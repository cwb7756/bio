// tools/gen-dna-model.js
// 生成 DNA 双螺旋结构 OBJ 模型文件（球棍风格：两条管状骨架 + 碱基对横档 + 连接球）
// 用法: node tools/gen-dna-model.js [输出路径]
// 说明: 生成的 OBJ 不含法线与材质，加载端（three.js OBJLoader）会自动计算顶点法线
const fs = require('fs');
const path = require('path');

const outPath = process.argv[2] || path.join(__dirname, 'output', 'dna.obj');

// ---- 模型参数 ----
const BP_COUNT = 22;              // 碱基对数量
const ANGLE_STEP = Math.PI / 5;   // 每个碱基对旋转 36°（10 bp/圈）
const RISE = 0.34;                // 每个碱基对上升高度
const HELIX_R = 1.0;              // 螺旋半径
const TUBE_R = 0.07;              // 骨架管半径
const RUNG_R = 0.045;             // 碱基对横档半径
const SPHERE_R = 0.12;            // 骨架连接球半径
const TUBE_SEG = 10;              // 管圆周分段数
const PATH_SEG_PER_BP = 6;        // 每个碱基对的路径细分
const GAP_RATIO = 0.08;           // 碱基对中间留缝比例（模拟两条碱基配对）

const verts = [];
const faces = [];

// ---- 向量工具 ----
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const length = a => Math.sqrt(dot(a, a));
const normalize = a => {
  const len = length(a);
  return len < 1e-12 ? [0, 0, 0] : scale(a, 1 / len);
};
const lerp = (a, b, t) => add(a, scale(sub(b, a), t));

function addVertex(p) {
  verts.push(p);
  return verts.length; // OBJ 索引从 1 开始
}

// ---- 端盖扇面 ----
function capFan(ring, centerPoint, reverse) {
  const c = addVertex(centerPoint);
  for (let j = 0; j < ring.length; j++) {
    const a = ring[j];
    const b = ring[(j + 1) % ring.length];
    faces.push(reverse ? [c, b, a] : [c, a, b]);
  }
}

// ---- 沿路径生成圆管（平行传输近似保证截面连续）----
function tube(points, radius, radialSeg) {
  const ringIdx = [];
  let prevU = null;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const pPrev = points[Math.max(0, i - 1)];
    const pNext = points[Math.min(points.length - 1, i + 1)];
    const t = normalize(sub(pNext, pPrev));
    // 优先复用上一环的 u 并投影到当前法平面，避免截面扭折
    let u = prevU ? sub(prevU, scale(t, dot(prevU, t))) : null;
    if (!u || length(u) < 1e-6) {
      const ref = Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      u = cross(t, ref);
    }
    u = normalize(u);
    prevU = u;
    const v = cross(t, u);
    const ring = [];
    for (let j = 0; j < radialSeg; j++) {
      const a = (j / radialSeg) * Math.PI * 2;
      const dir = add(scale(u, Math.cos(a)), scale(v, Math.sin(a)));
      ring.push(addVertex(add(p, scale(dir, radius))));
    }
    ringIdx.push(ring);
  }
  for (let i = 0; i < ringIdx.length - 1; i++) {
    for (let j = 0; j < radialSeg; j++) {
      const a = ringIdx[i][j];
      const b = ringIdx[i][(j + 1) % radialSeg];
      const c = ringIdx[i + 1][(j + 1) % radialSeg];
      const d = ringIdx[i + 1][j];
      faces.push([a, b, c]);
      faces.push([a, c, d]);
    }
  }
  capFan(ringIdx[0], points[0], true);
  capFan(ringIdx[ringIdx.length - 1], points[points.length - 1], false);
}

// ---- 两点之间的圆柱 ----
function cylinderBetween(p1, p2, radius, radialSeg) {
  tube([p1, p2], radius, radialSeg);
}

// ---- UV 球（极点处仅生成三角形，避免退化面）----
function sphere(center, radius, wSeg, hSeg) {
  const idx = [];
  for (let iy = 0; iy <= hSeg; iy++) {
    const row = [];
    const phi = (iy / hSeg) * Math.PI;
    for (let ix = 0; ix <= wSeg; ix++) {
      const theta = (ix / wSeg) * Math.PI * 2;
      row.push(addVertex([
        center[0] + radius * Math.sin(phi) * Math.cos(theta),
        center[1] + radius * Math.cos(phi),
        center[2] + radius * Math.sin(phi) * Math.sin(theta)
      ]));
    }
    idx.push(row);
  }
  for (let iy = 0; iy < hSeg; iy++) {
    for (let ix = 0; ix < wSeg; ix++) {
      const a = idx[iy][ix];
      const b = idx[iy][ix + 1];
      const c = idx[iy + 1][ix + 1];
      const d = idx[iy + 1][ix];
      if (iy === 0) faces.push([b, c, d]);
      else if (iy === hSeg - 1) faces.push([a, b, c]);
      else {
        faces.push([a, b, c]);
        faces.push([a, c, d]);
      }
    }
  }
}

// ---- 构建 DNA 双螺旋 ----
function helixPoint(angle, y, phase) {
  return [HELIX_R * Math.cos(angle + phase), y, HELIX_R * Math.sin(angle + phase)];
}

const totalHeight = (BP_COUNT - 1) * RISE;
const yOffset = -totalHeight / 2; // 垂直方向居中

// 两条骨架管
for (const phase of [0, Math.PI]) {
  const pathPoints = [];
  const totalSteps = (BP_COUNT - 1) * PATH_SEG_PER_BP;
  for (let i = 0; i <= totalSteps; i++) {
    const bp = i / PATH_SEG_PER_BP;
    pathPoints.push(helixPoint(bp * ANGLE_STEP, bp * RISE + yOffset, phase));
  }
  tube(pathPoints, TUBE_R, TUBE_SEG);
}

// 碱基对横档与连接球
for (let k = 0; k < BP_COUNT; k++) {
  const angle = k * ANGLE_STEP;
  const y = k * RISE + yOffset;
  const pA = helixPoint(angle, y, 0);
  const pB = helixPoint(angle, y, Math.PI);
  const mid = lerp(pA, pB, 0.5);
  // 两段横档中间留缝，模拟两条碱基在中间配对
  cylinderBetween(pA, lerp(pA, mid, 1 - GAP_RATIO), RUNG_R, TUBE_SEG);
  cylinderBetween(pB, lerp(pB, mid, 1 - GAP_RATIO), RUNG_R, TUBE_SEG);
  sphere(pA, SPHERE_R, 12, 6);
  sphere(pB, SPHERE_R, 12, 6);
}

// ---- 输出 OBJ ----
const lines = [
  '# DNA double helix model',
  '# generated by tools/gen-dna-model.js',
  'o dna_double_helix'
];
for (const v of verts) {
  lines.push(`v ${v[0].toFixed(6)} ${v[1].toFixed(6)} ${v[2].toFixed(6)}`);
}
for (const f of faces) {
  lines.push('f ' + f.join(' '));
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, lines.join('\n') + '\n');

const stats = fs.statSync(outPath);
console.log('生成完成:', outPath);
console.log('顶点数:', verts.length, '三角面数:', faces.length, '文件大小:', stats.size, 'bytes');
