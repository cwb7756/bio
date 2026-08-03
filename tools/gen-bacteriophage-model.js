// tools/gen-bacteriophage-model.js
// 生成 T 系噬菌体 GLB 模型（精细版）：
//   细分二十面体头部（衣壳）+ 颈环/领须 + 带螺纹尾鞘 + 尾管 + 六边形基板 + 尾钉 + 6 根带膝关节尾丝
// 用法: node tools/gen-bacteriophage-model.js [输出路径]
const path = require('path');
const { MeshBuilder, saveGLB, COLORS } = require('./lib/glb-builder');

const outPath = process.argv[2] || path.join(__dirname, 'output', 'bacteriophage.glb');

// 头部：细分派生球（freq=2 增加衣壳刻面细节），沿轴向略拉长呈长二十面体
const head = new MeshBuilder();
head.icosahedron([0, 2.0, 0], 1.3, [0.95, 1.18, 0.95], 2);

// 颈部圆柱 + 尾鞘 + 尾管
const tail = new MeshBuilder();
tail.cylinderBetween([0, 0.95, 0], [0, 0.72, 0], 0.28, 18);   // 颈部
tail.cylinderBetween([0, 0.72, 0], [0, -1.2, 0], 0.4, 20);    // 尾鞘主体
tail.cylinderBetween([0, -1.2, 0], [0, -1.52, 0], 0.14, 14);  // 尾管

// 领环 + 领须 ×6：颈部下方的环与下垂细丝
const collar = new MeshBuilder();
collar.torus([0, 0.78, 0], 0.42, 0.05, 24, 8, 'y');
for (let k = 0; k < 6; k++) {
  const a = (k / 6) * Math.PI * 2;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  collar.tube([
    [0.42 * ca, 0.78, 0.42 * sa],
    [0.6 * ca, 0.55, 0.6 * sa],
    [0.55 * ca, 0.3, 0.55 * sa]
  ], 0.03, 6);
}

// 尾鞘螺纹环 ×9：套在尾鞘上的收缩条纹
const rings = new MeshBuilder();
for (let i = 0; i < 9; i++) {
  const y = 0.6 - i * 0.2;
  rings.torus([0, y, 0], 0.42, 0.045, 20, 7, 'y');
}

// 基板：六边形扁柱
const baseplate = new MeshBuilder();
baseplate.cylinderBetween([0, -1.5, 0], [0, -1.7, 0], 0.72, 6);

// 尾钉 ×6 + 中央尖钉：基板向下的短锥
const spike = new MeshBuilder();
spike.cylinderBetween([0, -1.7, 0], [0, -1.98, 0], 0.07, 10); // 中央尖钉
spike.sphere([0, -2.02, 0], 0.09, 10, 6);
for (let k = 0; k < 6; k++) {
  const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  spike.cylinderBetween([0.6 * ca, -1.68, 0.6 * sa], [0.7 * ca, -1.95, 0.7 * sa], 0.05, 8);
}

// 尾丝 ×6：带膝关节的折线管（外展-下伸-内收），关节处加连接球
const fibers = new MeshBuilder();
const joints = new MeshBuilder();
for (let k = 0; k < 6; k++) {
  const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const p0 = [0.66 * ca, -1.72, 0.66 * sa];
  const knee = [1.5 * ca, -2.15, 1.5 * sa];
  const foot = [1.32 * ca, -3.0, 1.32 * sa];
  fibers.tube([p0, knee], 0.05, 7);
  fibers.tube([knee, foot], 0.045, 7);
  joints.sphere(knee, 0.075, 8, 6);
}

saveGLB(outPath, [
  { name: 'head', mesh: head, material: { name: 'head', baseColorFactor: COLORS.green } },
  { name: 'tail', mesh: tail, material: { name: 'tail', baseColorFactor: COLORS.greenDeep } },
  { name: 'collar', mesh: collar, material: { name: 'collar', baseColorFactor: COLORS.amber } },
  { name: 'rings', mesh: rings, material: { name: 'rings', baseColorFactor: COLORS.amber } },
  { name: 'baseplate', mesh: baseplate, material: { name: 'baseplate', baseColorFactor: COLORS.amber } },
  { name: 'spike', mesh: spike, material: { name: 'spike', baseColorFactor: COLORS.orange } },
  { name: 'fibers', mesh: fibers, material: { name: 'fibers', baseColorFactor: COLORS.cream } },
  { name: 'joints', mesh: joints, material: { name: 'joints', baseColorFactor: COLORS.orange } }
], 'tools/gen-bacteriophage-model.js');
