// tools/gen-bacteriophage-model.js
// 生成 T 系噬菌体 GLB 模型：二十面体头部 + 尾鞘（含环箍）+ 尾管 + 基板 + 尾钉 + 6 根尾丝
// 用法: node tools/gen-bacteriophage-model.js [输出路径]
const path = require('path');
const { MeshBuilder, saveGLB, COLORS } = require('./lib/glb-builder');

const outPath = process.argv[2] || path.join(__dirname, 'output', 'bacteriophage.glb');

// 头部：正二十面体（平直法线呈现晶体棱角），沿轴向略拉长
const head = new MeshBuilder();
head.icosahedron([0, 1.75, 0], 1.35, [1, 1, 1.15]);

// 颈圈 + 尾鞘 + 尾管
const tail = new MeshBuilder();
tail.cylinderBetween([0, 0.68, 0], [0, 0.42, 0], 0.3, 14);   // 颈圈
tail.cylinderBetween([0, 0.42, 0], [0, -1.5, 0], 0.42, 16);  // 尾鞘
tail.cylinderBetween([0, -1.5, 0], [0, -1.78, 0], 0.16, 12); // 尾管

// 环箍 ×3：套在尾鞘上的装饰环
const collars = new MeshBuilder();
for (const y of [-0.35, -0.85, -1.35]) {
  collars.cylinderBetween([0, y, 0], [0, y - 0.12, 0], 0.5, 16);
}

// 基板：六边形扁柱
const baseplate = new MeshBuilder();
baseplate.cylinderBetween([0, -1.66, 0], [0, -1.82, 0], 0.75, 6);

// 尾钉：基板中心向下的短锥与小球
const spike = new MeshBuilder();
spike.cylinderBetween([0, -1.82, 0], [0, -2.05, 0], 0.08, 10);
spike.sphere([0, -2.1, 0], 0.1, 10, 6);

// 尾丝 ×6：从基板六角伸出的折线管（外展下伸再略收）
const fibers = new MeshBuilder();
for (let k = 0; k < 6; k++) {
  const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  fibers.tube([
    [0.68 * ca, -1.8, 0.68 * sa],
    [1.45 * ca, -2.35, 1.45 * sa],
    [1.3 * ca, -2.95, 1.3 * sa]
  ], 0.06, 8);
}

saveGLB(outPath, [
  { name: 'head', mesh: head, material: { name: 'head', baseColorFactor: COLORS.green } },
  { name: 'tail', mesh: tail, material: { name: 'tail', baseColorFactor: COLORS.greenDeep } },
  { name: 'collars', mesh: collars, material: { name: 'collars', baseColorFactor: COLORS.amber } },
  { name: 'baseplate', mesh: baseplate, material: { name: 'baseplate', baseColorFactor: COLORS.amber } },
  { name: 'spike', mesh: spike, material: { name: 'spike', baseColorFactor: COLORS.orange } },
  { name: 'fibers', mesh: fibers, material: { name: 'fibers', baseColorFactor: COLORS.cream } }
], 'tools/gen-bacteriophage-model.js');
