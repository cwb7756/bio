// tools/gen-dna-model.js
// 生成 DNA 双螺旋结构 GLB 模型（球棍风格：两条管状骨架 + 碱基对横档 + 连接球）
// 用法: node tools/gen-dna-model.js [输出路径]
// 说明: 几何与 GLB 输出统一复用 tools/lib/glb-builder.js
const path = require('path');
const { MeshBuilder, saveGLB, COLORS, lerp } = require('./lib/glb-builder');

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

function helixPoint(angle, y, phase) {
  return [HELIX_R * Math.cos(angle + phase), y, HELIX_R * Math.sin(angle + phase)];
}

const totalHeight = (BP_COUNT - 1) * RISE;
const yOffset = -totalHeight / 2; // 垂直方向居中

// 两条骨架管
const backbone = new MeshBuilder();
for (const phase of [0, Math.PI]) {
  const pathPoints = [];
  const totalSteps = (BP_COUNT - 1) * PATH_SEG_PER_BP;
  for (let i = 0; i <= totalSteps; i++) {
    const bp = i / PATH_SEG_PER_BP;
    pathPoints.push(helixPoint(bp * ANGLE_STEP, bp * RISE + yOffset, phase));
  }
  backbone.tube(pathPoints, TUBE_R, TUBE_SEG);
}

// 碱基对横档与连接球
const rungs = new MeshBuilder();
const joints = new MeshBuilder();
for (let k = 0; k < BP_COUNT; k++) {
  const angle = k * ANGLE_STEP;
  const y = k * RISE + yOffset;
  const pA = helixPoint(angle, y, 0);
  const pB = helixPoint(angle, y, Math.PI);
  const mid = lerp(pA, pB, 0.5);
  // 两段横档中间留缝，模拟两条碱基在中间配对
  rungs.cylinderBetween(pA, lerp(pA, mid, 1 - GAP_RATIO), RUNG_R, TUBE_SEG);
  rungs.cylinderBetween(pB, lerp(pB, mid, 1 - GAP_RATIO), RUNG_R, TUBE_SEG);
  joints.sphere(pA, SPHERE_R, 12, 6);
  joints.sphere(pB, SPHERE_R, 12, 6);
}

// 全部使用主题绿（拆 3 个 primitive 仅为后续分件配色留接口，视觉与重构前一致）
saveGLB(outPath, [
  { name: 'backbone', mesh: backbone, material: { name: 'backbone', baseColorFactor: COLORS.green } },
  { name: 'base_pairs', mesh: rungs, material: { name: 'base_pairs', baseColorFactor: COLORS.green } },
  { name: 'joints', mesh: joints, material: { name: 'joints', baseColorFactor: COLORS.green } }
], 'tools/gen-dna-model.js');
