// tools/gen-chloroplast-model.js
// 生成叶绿体 GLB 模型（精细版）：剖切外膜 + 内膜 + 基粒（类囊体堆叠）+ 基质类囊体（基质片层）+ 淀粉粒 + 嗜锇颗粒
// 用法: node tools/gen-chloroplast-model.js [输出路径]
const path = require('path');
const { MeshBuilder, saveGLB, COLORS } = require('./lib/glb-builder');

const outPath = process.argv[2] || path.join(__dirname, 'output', 'chloroplast.glb');

// 剖切缺口朝 +z（相机方向），缺口约 100°
const CUT = 0.88;
const cutOpts = { thetaStart: Math.PI / 2 + CUT, thetaEnd: Math.PI / 2 - CUT + Math.PI * 2 };

// 外膜：扁椭球 radii [2.8, 1.5, 2.1]，剖切展示内部
const outer = new MeshBuilder();
outer.ellipsoid([0, 0, 0], [2.8, 1.5, 2.1], 40, 20, cutOpts);

// 内膜：略小的椭球，与外膜构成双层被膜
const inner = new MeshBuilder();
inner.ellipsoid([0, 0, 0], [2.62, 1.36, 1.94], 40, 20, cutOpts);

// 基粒：3 摞类囊体圆盘，每摞 8 片扁圆柱竖直堆叠
const grana = new MeshBuilder();
const stacks = [
  [-1.4, -0.6, 0.35],
  [0.1, -0.55, -0.5],
  [1.45, -0.6, 0.45]
];
for (const [cx, cy, cz] of stacks) {
  for (let k = 0; k < 8; k++) {
    const y = cy + k * 0.15;
    grana.cylinderBetween([cx, y, cz], [cx, y + 0.09, cz], 0.5, 24);
  }
}

// 基质类囊体（基质片层）：连接相邻基粒顶部的斜向扁管
const lamellae = new MeshBuilder();
for (let s = 0; s < stacks.length - 1; s++) {
  const a = stacks[s];
  const b = stacks[s + 1];
  lamellae.tube([
    [a[0], a[1] + 0.5, a[2]],
    [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.35, (a[2] + b[2]) / 2],
    [b[0], b[1] + 0.5, b[2]]
  ], 0.06, 8);
}

// 淀粉粒：基质中一颗光滑大椭球
const starch = new MeshBuilder();
starch.ellipsoid([-0.3, 0.55, 0.2], [0.55, 0.42, 0.42], 20, 12);

// 嗜锇颗粒（脂质小球）：散布基质的小球
const globuli = new MeshBuilder();
for (const p of [[1.3, 0.4, -0.2], [0.9, 0.7, 0.3], [-1.5, 0.45, -0.3]]) {
  globuli.sphere(p, 0.12, 10, 7);
}

saveGLB(outPath, [
  { name: 'envelope', mesh: outer, material: { name: 'envelope', baseColorFactor: COLORS.greenSoft, doubleSided: true } },
  { name: 'inner_membrane', mesh: inner, material: { name: 'inner_membrane', baseColorFactor: COLORS.green, doubleSided: true } },
  { name: 'grana', mesh: grana, material: { name: 'grana', baseColorFactor: COLORS.greenDeep } },
  { name: 'stroma_lamellae', mesh: lamellae, material: { name: 'stroma_lamellae', baseColorFactor: COLORS.green } },
  { name: 'starch', mesh: starch, material: { name: 'starch', baseColorFactor: COLORS.cream } },
  { name: 'globuli', mesh: globuli, material: { name: 'globuli', baseColorFactor: COLORS.amber } }
], 'tools/gen-chloroplast-model.js');
