// tools/gen-animal-cell-model.js
// 生成动物细胞 GLB 模型（精细版）：剖切细胞膜 + 细胞核（含核仁）+ 线粒体 + 高尔基体（含分泌囊泡）
//   + 粗面内质网（附着核糖体）+ 游离核糖体 + 溶酶体 + 中心体（一对中心粒）
// 用法: node tools/gen-animal-cell-model.js [输出路径]
const path = require('path');
const { MeshBuilder, saveGLB, COLORS } = require('./lib/glb-builder');

const outPath = process.argv[2] || path.join(__dirname, 'output', 'animal-cell.glb');

// 剖切缺口朝 +z（相机方向），缺口约 100°，双面材质保证内壁可见
const CUT = 0.88;
const cutOpts = { thetaStart: Math.PI / 2 + CUT, thetaEnd: Math.PI / 2 - CUT + Math.PI * 2 };

const NUCLEUS = [0.25, 0.15, 0.2]; // 细胞核中心

// 细胞膜：球体剖切展示内部细胞器（提高分段更平滑）
const membrane = new MeshBuilder();
membrane.sphere([0, 0, 0], 2.7, 44, 22, cutOpts);

// 核膜：剖切小球，露出核仁
const nucleus = new MeshBuilder();
nucleus.sphere(NUCLEUS, 1.05, 32, 16, cutOpts);

// 核仁
const nucleolus = new MeshBuilder();
nucleolus.sphere(NUCLEUS, 0.38, 18, 12);

// 线粒体 ×3：小椭球旋转摆放
const mito = new MeshBuilder();
const mitoDefs = [
  { pos: [1.65, 0.75, 0.9], rot: 0.5 },
  { pos: [-1.55, -0.8, 0.75], rot: -0.8 },
  { pos: [0.1, -1.4, -0.95], rot: 1.2 }
];
for (const def of mitoDefs) {
  const m = new MeshBuilder();
  m.ellipsoid([0, 0, 0], [0.5, 0.26, 0.26], 18, 12);
  m.rotateY(def.rot).translate(def.pos);
  mito.merge(m);
}

// 高尔基体：4 层弧形扁椭球板叠放
const golgi = new MeshBuilder();
for (let k = 0; k < 4; k++) {
  golgi.ellipsoid([-0.45, 1.15 + k * 0.18, -0.85], [0.5 - k * 0.03, 0.07, 0.34 - k * 0.02], 18, 8);
}
// 分泌囊泡：从高尔基体边缘出芽的小球
const vesicles = new MeshBuilder();
for (const p of [[0.15, 1.35, -0.75], [0.3, 1.05, -0.6], [-1.05, 1.6, -0.95]]) {
  vesicles.sphere(p, 0.13, 12, 8);
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

// 粗面内质网核糖体：沿 ER 管表面附着的小颗粒（每隔几段取一个点）
const erRibo = new MeshBuilder();
for (let i = 3; i < erPts.length; i += 3) {
  erRibo.sphere(erPts[i], 0.05, 6, 5);
}

// 游离核糖体 ×10：散布细胞质中的颗粒（避开细胞核）
const ribo = new MeshBuilder();
const riboPos = [
  [1.9, 0.3, -0.6], [-1.8, 0.9, -0.5], [-0.9, 1.6, 0.8], [1.2, -1.4, 0.9],
  [-1.9, -0.2, 1.0], [0.9, 1.5, -1.0], [-0.6, -1.8, 0.3], [1.95, -0.5, 0.3],
  [-1.2, 0.2, -1.5], [0.5, 0.9, 1.7]
];
for (const p of riboPos) ribo.sphere(p, 0.085, 8, 6);

// 溶酶体 ×3：细胞质中的消化性囊泡
const lysosome = new MeshBuilder();
for (const p of [[1.5, -0.5, -0.7], [-0.4, -1.6, 0.6], [1.0, 1.2, 0.5]]) {
  lysosome.sphere(p, 0.22, 14, 9);
}

// 中心体：一对相互垂直的中心粒（短圆柱）
const centriole = new MeshBuilder();
const cCenter = [-1.3, 0.6, 0.5];
centriole.cylinderBetween(
  [cCenter[0] - 0.22, cCenter[1], cCenter[2]],
  [cCenter[0] + 0.22, cCenter[1], cCenter[2]], 0.09, 12);
centriole.cylinderBetween(
  [cCenter[0], cCenter[1] - 0.05, cCenter[2] - 0.22],
  [cCenter[0], cCenter[1] - 0.05, cCenter[2] + 0.22], 0.09, 12);

saveGLB(outPath, [
  { name: 'membrane', mesh: membrane, material: { name: 'membrane', baseColorFactor: COLORS.greenSoft, doubleSided: true } },
  { name: 'nucleus', mesh: nucleus, material: { name: 'nucleus', baseColorFactor: COLORS.green, doubleSided: true } },
  { name: 'nucleolus', mesh: nucleolus, material: { name: 'nucleolus', baseColorFactor: COLORS.amber } },
  { name: 'mitochondria', mesh: mito, material: { name: 'mitochondria', baseColorFactor: COLORS.orange } },
  { name: 'golgi', mesh: golgi, material: { name: 'golgi', baseColorFactor: COLORS.amber } },
  { name: 'vesicles', mesh: vesicles, material: { name: 'vesicles', baseColorFactor: COLORS.amber } },
  { name: 'endoplasmic_reticulum', mesh: er, material: { name: 'er', baseColorFactor: COLORS.cream } },
  { name: 'er_ribosomes', mesh: erRibo, material: { name: 'er_ribosomes', baseColorFactor: COLORS.greenDeep } },
  { name: 'ribosomes', mesh: ribo, material: { name: 'ribosomes', baseColorFactor: COLORS.greenDeep } },
  { name: 'lysosomes', mesh: lysosome, material: { name: 'lysosomes', baseColorFactor: COLORS.orange } },
  { name: 'centriole', mesh: centriole, material: { name: 'centriole', baseColorFactor: COLORS.greenDeep } }
], 'tools/gen-animal-cell-model.js');
