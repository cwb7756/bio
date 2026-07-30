// tools/gen-animal-cell-model.js
// 生成动物细胞 GLB 模型：剖切细胞膜 + 细胞核（含核仁）+ 线粒体 + 高尔基体 + 内质网 + 核糖体
// 用法: node tools/gen-animal-cell-model.js [输出路径]
const path = require('path');
const { MeshBuilder, saveGLB, COLORS } = require('./lib/glb-builder');

const outPath = process.argv[2] || path.join(__dirname, 'output', 'animal-cell.glb');

// 剖切缺口朝 +z（相机方向），缺口约 100°，双面材质保证内壁可见
const CUT = 0.88;
const cutOpts = { thetaStart: Math.PI / 2 + CUT, thetaEnd: Math.PI / 2 - CUT + Math.PI * 2 };

const NUCLEUS = [0.25, 0.15, 0.2]; // 细胞核中心

// 细胞膜：球体剖切展示内部细胞器
const membrane = new MeshBuilder();
membrane.sphere([0, 0, 0], 2.7, 36, 18, cutOpts);

// 核膜：剖切小球，露出核仁
const nucleus = new MeshBuilder();
nucleus.sphere(NUCLEUS, 1.05, 28, 14, cutOpts);

// 核仁
const nucleolus = new MeshBuilder();
nucleolus.sphere(NUCLEUS, 0.38, 16, 10);

// 线粒体 ×3：小椭球旋转摆放
const mito = new MeshBuilder();
const mitoDefs = [
  { pos: [1.65, 0.75, 0.9], rot: 0.5 },
  { pos: [-1.55, -0.8, 0.75], rot: -0.8 },
  { pos: [0.1, -1.4, -0.95], rot: 1.2 }
];
for (const def of mitoDefs) {
  const m = new MeshBuilder();
  m.ellipsoid([0, 0, 0], [0.5, 0.26, 0.26], 16, 10);
  m.rotateY(def.rot).translate(def.pos);
  mito.merge(m);
}

// 高尔基体：3 层扁椭球板叠放
const golgi = new MeshBuilder();
for (let k = 0; k < 3; k++) {
  golgi.ellipsoid([-0.45, 1.25 + k * 0.2, -0.85], [0.5, 0.08, 0.34], 16, 8);
}

// 内质网：绕核螺旋管（半径渐扩 + 上下波动）
const er = new MeshBuilder();
const erPts = [];
const ER_N = 60;
for (let i = 0; i <= ER_N; i++) {
  const t = (i / ER_N) * Math.PI * 4;
  const r = 1.4 + 0.3 * (i / ER_N);
  erPts.push([
    NUCLEUS[0] + r * Math.cos(t),
    NUCLEUS[1] + 0.35 * Math.sin(2.5 * t),
    NUCLEUS[2] + r * Math.sin(t)
  ]);
}
er.tube(erPts, 0.09, 8);

// 核糖体 ×10：散布细胞质中的颗粒（避开细胞核）
const ribo = new MeshBuilder();
const riboPos = [
  [1.9, 0.3, -0.6], [-1.8, 0.9, -0.5], [-0.9, 1.6, 0.8], [1.2, -1.4, 0.9],
  [-1.9, -0.2, 1.0], [0.9, 1.5, -1.0], [-0.6, -1.8, 0.3], [1.95, -0.5, 0.3],
  [-1.2, 0.2, -1.5], [0.5, 0.9, 1.7]
];
for (const p of riboPos) ribo.sphere(p, 0.085, 8, 6);

saveGLB(outPath, [
  { name: 'membrane', mesh: membrane, material: { name: 'membrane', baseColorFactor: COLORS.greenSoft, doubleSided: true } },
  { name: 'nucleus', mesh: nucleus, material: { name: 'nucleus', baseColorFactor: COLORS.green, doubleSided: true } },
  { name: 'nucleolus', mesh: nucleolus, material: { name: 'nucleolus', baseColorFactor: COLORS.amber } },
  { name: 'mitochondria', mesh: mito, material: { name: 'mitochondria', baseColorFactor: COLORS.orange } },
  { name: 'golgi', mesh: golgi, material: { name: 'golgi', baseColorFactor: COLORS.amber } },
  { name: 'endoplasmic_reticulum', mesh: er, material: { name: 'er', baseColorFactor: COLORS.cream } },
  { name: 'ribosomes', mesh: ribo, material: { name: 'ribosomes', baseColorFactor: COLORS.greenDeep } }
], 'tools/gen-animal-cell-model.js');
