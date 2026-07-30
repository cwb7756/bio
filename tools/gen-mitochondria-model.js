// tools/gen-mitochondria-model.js
// 生成线粒体 GLB 模型：剖切外膜 + 板层状嵴（展示双层膜与内膜折叠结构）
// 用法: node tools/gen-mitochondria-model.js [输出路径]
const path = require('path');
const { MeshBuilder, saveGLB, COLORS } = require('./lib/glb-builder');

const outPath = process.argv[2] || path.join(__dirname, 'output', 'mitochondria.glb');

// 剖切缺口朝 +z（相机方向），缺口约 100°，双面材质保证内壁可见
const CUT = 0.88; // 半缺口角（弧度）
const T_START = Math.PI / 2 + CUT;
const T_END = Math.PI / 2 - CUT + Math.PI * 2;
const cutOpts = { thetaStart: T_START, thetaEnd: T_END };

// 外膜：长椭球 radii [3, 1.4, 1.4]，剖切展示内部
const outer = new MeshBuilder();
outer.ellipsoid([0, 0, 0], [3, 1.4, 1.4], 32, 16, cutOpts);

// 嵴：6 块垂直于长轴的扁椭球板，同角度剖切，缺口处可见板层截面
const cristae = new MeshBuilder();
for (const x of [-2.0, -1.2, -0.4, 0.4, 1.2, 2.0]) {
  cristae.ellipsoid([x, 0, 0], [0.13, 1.02, 1.02], 20, 10, cutOpts);
}

saveGLB(outPath, [
  { name: 'outer_membrane', mesh: outer, material: { name: 'outer_membrane', baseColorFactor: COLORS.green, doubleSided: true } },
  { name: 'cristae', mesh: cristae, material: { name: 'cristae', baseColorFactor: COLORS.amber, doubleSided: true } }
], 'tools/gen-mitochondria-model.js');
