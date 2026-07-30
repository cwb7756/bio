// tools/gen-dna-model.js
// 生成 DNA 双螺旋结构 GLB 模型文件（球棍风格：两条管状骨架 + 碱基对横档 + 连接球）
// 用法: node tools/gen-dna-model.js [输出路径]
// 说明: 输出标准 glTF 2.0 二进制（GLB），含平滑顶点法线与 PBR 材质，供小程序 xr-frame 加载
const fs = require('fs');
const path = require('path');

const outPath = process.argv[2] || path.join(__dirname, 'output', 'dna.glb');

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

// ---- 输出 GLB（glTF 2.0 二进制）----

// 平滑顶点法线：累加面法线后归一化
const normals = verts.map(() => [0, 0, 0]);
for (const f of faces) {
  const a = verts[f[0] - 1];
  const b = verts[f[1] - 1];
  const c = verts[f[2] - 1];
  const n = cross(sub(b, a), sub(c, a)); // 未归一化，大面权重更高
  for (const vi of f) {
    normals[vi - 1] = add(normals[vi - 1], n);
  }
}
for (let i = 0; i < normals.length; i++) {
  const n = normalize(normals[i]);
  normals[i] = length(n) < 1e-12 ? [0, 1, 0] : n;
}

// 包围盒（POSITION accessor 必须提供 min/max）
const posMin = [Infinity, Infinity, Infinity];
const posMax = [-Infinity, -Infinity, -Infinity];
for (const v of verts) {
  for (let i = 0; i < 3; i++) {
    if (v[i] < posMin[i]) posMin[i] = v[i];
    if (v[i] > posMax[i]) posMax[i] = v[i];
  }
}

// 二进制缓冲：POSITION + NORMAL + indices
const positionArr = new Float32Array(verts.length * 3);
const normalArr = new Float32Array(verts.length * 3);
verts.forEach((v, i) => positionArr.set(v, i * 3));
normals.forEach((n, i) => normalArr.set(n, i * 3));

const useUint32 = verts.length > 65535;
const IndexArray = useUint32 ? Uint32Array : Uint16Array;
const indexArr = new IndexArray(faces.length * 3);
faces.forEach((f, i) => {
  indexArr[i * 3] = f[0] - 1;
  indexArr[i * 3 + 1] = f[1] - 1;
  indexArr[i * 3 + 2] = f[2] - 1;
});

const pad4 = n => (4 - (n % 4)) % 4;
const posBytes = Buffer.from(positionArr.buffer);
const nrmBytes = Buffer.from(normalArr.buffer);
const idxBytes = Buffer.from(indexArr.buffer);
const binBody = Buffer.concat([
  posBytes,
  nrmBytes,
  idxBytes,
  Buffer.alloc(pad4(idxBytes.length))
]);

const gltf = {
  asset: { version: '2.0', generator: 'tools/gen-dna-model.js' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'dna_double_helix' }],
  meshes: [{
    name: 'dna_double_helix',
    primitives: [{
      attributes: { POSITION: 0, NORMAL: 1 },
      indices: 2,
      material: 0
    }]
  }],
  materials: [{
    name: 'dna_material',
    pbrMetallicRoughness: {
      baseColorFactor: [0.373, 0.722, 0.58, 1], // 与小程序主题色 #5fb894 一致
      metallicFactor: 0.1,
      roughnessFactor: 0.6
    }
  }],
  buffers: [{ byteLength: binBody.length }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: posBytes.length, target: 34962 },
    { buffer: 0, byteOffset: posBytes.length, byteLength: nrmBytes.length, target: 34962 },
    { buffer: 0, byteOffset: posBytes.length + nrmBytes.length, byteLength: idxBytes.length, target: 34963 }
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: verts.length, type: 'VEC3', min: posMin, max: posMax },
    { bufferView: 1, componentType: 5126, count: verts.length, type: 'VEC3' },
    { bufferView: 2, componentType: useUint32 ? 5125 : 5123, count: indexArr.length, type: 'SCALAR' }
  ]
};

// GLB 容器：12 字节头 + JSON chunk（空格补齐 4 字节）+ BIN chunk
let jsonBuf = Buffer.from(JSON.stringify(gltf), 'utf8');
jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(pad4(jsonBuf.length), 0x20)]);

const totalLength = 12 + 8 + jsonBuf.length + 8 + binBody.length;
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); // magic 'glTF'
header.writeUInt32LE(2, 4);          // version
header.writeUInt32LE(totalLength, 8);

const jsonChunkHeader = Buffer.alloc(8);
jsonChunkHeader.writeUInt32LE(jsonBuf.length, 0);
jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

const binChunkHeader = Buffer.alloc(8);
binChunkHeader.writeUInt32LE(binBody.length, 0);
binChunkHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, Buffer.concat([header, jsonChunkHeader, jsonBuf, binChunkHeader, binBody]));

const stats = fs.statSync(outPath);
console.log('生成完成:', outPath);
console.log('顶点数:', verts.length, '三角面数:', faces.length, '索引类型:', useUint32 ? 'Uint32' : 'Uint16', '文件大小:', stats.size, 'bytes');
