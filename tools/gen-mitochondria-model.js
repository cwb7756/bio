// tools/gen-mitochondria-model.js
// 生成线粒体 GLB 模型（精细版）：剖切外膜 + 内膜 + 板层状嵴 + 基质颗粒
//   展示双层膜结构与内膜向内折叠形成的嵴
// 用法: node tools/gen-mitochondria-model.js [输出路径]
const path = require('path');
const { MeshBuilder, saveGLB, COLORS } = require('./lib/glb-builder');

const outPath = process.argv[2] || path.join(__dirname, 'output', 'mitochondria.glb');

// 剖切缺口朝 +z（相机方向），缺口约 100°，双面材质保证内壁可见
const CUT = 0.88;
const cutOpts = { thetaStart: Math.PI / 2 + CUT, thetaEnd: Math.PI / 2 - CUT + Math.PI * 2 };

// 外膜：长椭球 radii [3, 1.4, 1.4]，剖切展示内部（提高分段更平滑）
const outer = new MeshBuilder();
outer.ellipsoid([0, 0, 0], [3, 1.4, 1.4], 40, 20, cutOpts);

// 内膜：略小的椭球，与外膜之间形成膜间隙
const inner = new MeshBuilder();
inner.ellipsoid([0, 0, 0], [2.78, 1.2, 1.2], 40, 20, cutOpts);

// 嵴：8 块垂直于长轴的扁椭球板，同角度剖切，缺口处可见板层截面
const cristae = new MeshBuilder();
for (const x of [-2.1, -1.5, -0.9, -0.3, 0.3, 0.9, 1.5, 2.1]) {
  // 越靠两端的嵴越短，贴合椭球轮廓
  const ry = 1.02 * Math.sqrt(Math.max(0.05, 1 - (x / 3) * (x / 3)));
  cristae.ellipsoid([x, 0, 0], [0.11, ry, ry], 22, 12, cutOpts);
}

// 基质颗粒：散布于内腔的小球（线粒体基质中的钙磷颗粒 / 核糖体）
const granules = new MeshBuilder();
const gPos = [
  [-1.6, 0.35, -0.3], [-0.7, -0.4, -0.4], [0.2, 0.5, -0.25], [1.0, -0.3, -0.35],
  [1.7, 0.25, -0.2], [-1.1, 0.15, -0.5], [0.6, -0.5, -0.15], [-0.2, 0.4, -0.45]
];
for (const p of gPos) granules.sphere(p, 0.11, 10, 7);

saveGLB(outPath, [
  { name: 'outer_membrane', mesh: outer, material: { name: 'outer_membrane', baseColorFactor: COLORS.green, doubleSided: true } },
  { name: 'inner_membrane', mesh: inner, material: { name: 'inner_membrane', baseColorFactor: COLORS.greenSoft, doubleSided: true } },
  { name: 'cristae', mesh: cristae, material: { name: 'cristae', baseColorFactor: COLORS.amber, doubleSided: true } },
  { name: 'granules', mesh: granules, material: { name: 'granules', baseColorFactor: COLORS.orange } }
], 'tools/gen-mitochondria-model.js');
