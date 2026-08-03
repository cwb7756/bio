// tools/gen-dna-model.js
// 生成 DNA 双螺旋结构 GLB 模型（精细版·球棍风格）：
//   两条反向平行骨架（用不同颜色区分）+ 按碱基配对(A-T / G-C)着色的碱基对横档 + 骨架连接球
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
const RUNG_R = 0.05;              // 碱基对横档半径
const SPHERE_R = 0.12;            // 骨架连接球半径
const TUBE_SEG = 10;              // 管圆周分段数
const PATH_SEG_PER_BP = 6;        // 每个碱基对的路径细分
const GAP_RATIO = 0.06;           // 碱基对中间留缝比例（模拟两条碱基配对）

// 碱基着色：A-绿 / T-暖黄 / G-深绿 / C-橙；碱基配对 A-T、G-C
const BASE_COLOR = { A: COLORS.green, T: COLORS.amber, G: COLORS.greenDeep, C: COLORS.orange };
const COMPLEMENT = { A: 'T', T: 'A', G: 'C', C: 'G' };
// 确定性碱基序列（沿链方向，读作 5'->3'）
const SEQ = 'ATGCTTAGCCGATACGGATCA';

function helixPoint(angle, y, phase) {
  return [HELIX_R * Math.cos(angle + phase), y, HELIX_R * Math.sin(angle + phase)];
}

const totalHeight = (BP_COUNT - 1) * RISE;
const yOffset = -totalHeight / 2; // 垂直方向居中

// 两条骨架管（分开成两个网格以区分正/反义链）
const strandA = new MeshBuilder();
const strandB = new MeshBuilder();
const strandMeshes = [strandA, strandB];
[0, Math.PI].forEach((phase, si) => {
  const pathPoints = [];
  const totalSteps = (BP_COUNT - 1) * PATH_SEG_PER_BP;
  for (let i = 0; i <= totalSteps; i++) {
    const bp = i / PATH_SEG_PER_BP;
    pathPoints.push(helixPoint(bp * ANGLE_STEP, bp * RISE + yOffset, phase));
  }
  strandMeshes[si].tube(pathPoints, TUBE_R, TUBE_SEG);
});

// 碱基对横档：按碱基着色，每个碱基一个网格
const baseMesh = { A: new MeshBuilder(), T: new MeshBuilder(), G: new MeshBuilder(), C: new MeshBuilder() };
// 连接球分正/反义链
const jointsA = new MeshBuilder();
const jointsB = new MeshBuilder();
for (let k = 0; k < BP_COUNT; k++) {
  const angle = k * ANGLE_STEP;
  const y = k * RISE + yOffset;
  const pA = helixPoint(angle, y, 0);
  const pB = helixPoint(angle, y, Math.PI);
  const mid = lerp(pA, pB, 0.5);
  const baseA = SEQ[k % SEQ.length];
  const baseB = COMPLEMENT[baseA];
  // 两段横档在中间留缝，各自代表一条碱基（着相应颜色）
  baseMesh[baseA].cylinderBetween(pA, lerp(pA, mid, 1 - GAP_RATIO), RUNG_R, TUBE_SEG);
  baseMesh[baseB].cylinderBetween(pB, lerp(pB, mid, 1 - GAP_RATIO), RUNG_R, TUBE_SEG);
  jointsA.sphere(pA, SPHERE_R, 12, 8);
  jointsB.sphere(pB, SPHERE_R, 12, 8);
}

saveGLB(outPath, [
  { name: 'strand_a', mesh: strandA, material: { name: 'strand_a', baseColorFactor: COLORS.green } },
  { name: 'strand_b', mesh: strandB, material: { name: 'strand_b', baseColorFactor: COLORS.greenDeep } },
  { name: 'joints_a', mesh: jointsA, material: { name: 'joints_a', baseColorFactor: COLORS.greenSoft } },
  { name: 'joints_b', mesh: jointsB, material: { name: 'joints_b', baseColorFactor: COLORS.greenSoft } },
  { name: 'base_A', mesh: baseMesh.A, material: { name: 'base_A', baseColorFactor: BASE_COLOR.A } },
  { name: 'base_T', mesh: baseMesh.T, material: { name: 'base_T', baseColorFactor: BASE_COLOR.T } },
  { name: 'base_G', mesh: baseMesh.G, material: { name: 'base_G', baseColorFactor: BASE_COLOR.G } },
  { name: 'base_C', mesh: baseMesh.C, material: { name: 'base_C', baseColorFactor: BASE_COLOR.C } }
], 'tools/gen-dna-model.js');
