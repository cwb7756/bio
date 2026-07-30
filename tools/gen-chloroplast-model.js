// tools/gen-chloroplast-model.js
// 生成叶绿体 GLB 模型：剖切扁椭球外膜 + 3 摞基粒（类囊体圆盘堆叠）
// 用法: node tools/gen-chloroplast-model.js [输出路径]
const path = require('path');
const { MeshBuilder, saveGLB, COLORS } = require('./lib/glb-builder');

const outPath = process.argv[2] || path.join(__dirname, 'output', 'chloroplast.glb');

// 剖切缺口朝 +z（相机方向），缺口约 100°
const CUT = 0.88;
const cutOpts = { thetaStart: Math.PI / 2 + CUT, thetaEnd: Math.PI / 2 - CUT + Math.PI * 2 };

// 外膜：扁椭球 radii [2.8, 1.5, 2.1]，剖切展示内部
const outer = new MeshBuilder();
outer.ellipsoid([0, 0, 0], [2.8, 1.5, 2.1], 32, 16, cutOpts);

// 基粒：3 摞类囊体圆盘，每摞 6 片扁圆柱竖直堆叠，底部错落分布
const grana = new MeshBuilder();
const stacks = [
  [-1.4, -0.55, 0.35],
  [0.1, -0.45, -0.5],
  [1.45, -0.55, 0.45]
];
for (const [cx, cy, cz] of stacks) {
  for (let k = 0; k < 6; k++) {
    const y = cy + k * 0.17;
    grana.cylinderBetween([cx, y, cz], [cx, y + 0.11, cz], 0.5, 18);
  }
}

saveGLB(outPath, [
  { name: 'envelope', mesh: outer, material: { name: 'envelope', baseColorFactor: COLORS.greenSoft, doubleSided: true } },
  { name: 'grana', mesh: grana, material: { name: 'grana', baseColorFactor: COLORS.greenDeep } }
], 'tools/gen-chloroplast-model.js');
