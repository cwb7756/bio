// tools/lib/glb-builder.js
// GLB（glTF 2.0 二进制）构建工具库：几何生成 + 平滑顶点法线 + 多材质输出
// 供 tools/gen-*-model.js 系列脚本复用（xr-frame 走 glTF 严格校验，规范见各函数注释）
const fs = require('fs');
const path = require('path');

// ---- 向量工具 ----
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const length = a => Math.sqrt(dot(a, a));
const normalize = a => {
  const len = length(a);
  return len < 1e-12 ? [0, 0, 0] : scale(a, 1 / len);
};
const lerp = (a, b, t) => add(a, scale(sub(b, a), t));

// ---- 网格构建器：顶点 1-based 索引，法线导出时按面累加计算（变换顶点安全）----
class MeshBuilder {
  constructor() {
    this.verts = [];
    this.faces = [];
  }

  addVertex(p) {
    this.verts.push(p);
    return this.verts.length;
  }

  // 合并另一个网格（面索引自动按顶点数偏移）
  merge(other) {
    const offset = this.verts.length;
    this.verts.push(...other.verts);
    for (const f of other.faces) this.faces.push(f.map(i => i + offset));
    return this;
  }

  // 顶点整体变换（平移/旋转/缩放）
  transform(fn) {
    this.verts = this.verts.map(fn);
    return this;
  }

  translate(offset) {
    return this.transform(p => add(p, offset));
  }

  // 绕 Y 轴旋转（右手系），pivot 为旋转中心
  rotateY(angle, pivot = [0, 0, 0]) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return this.transform(p => {
      const d = sub(p, pivot);
      return [pivot[0] + d[0] * c + d[2] * s, p[1], pivot[2] - d[0] * s + d[2] * c];
    });
  }

  // 端盖扇面
  capFan(ring, centerPoint, reverse) {
    const c = this.addVertex(centerPoint);
    for (let j = 0; j < ring.length; j++) {
      const a = ring[j];
      const b = ring[(j + 1) % ring.length];
      this.faces.push(reverse ? [c, b, a] : [c, a, b]);
    }
  }

  // 沿路径生成圆管（平行传输近似保证截面连续）
  // radius 可为常数或 (i, t) => number（t 为 0..1 归一化路径位置），支持变径/锥形
  tube(points, radius, radialSeg) {
    const radiusAt = typeof radius === 'function'
      ? radius
      : () => radius;
    const ringIdx = [];
    let prevU = null;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const pPrev = points[Math.max(0, i - 1)];
      const pNext = points[Math.min(points.length - 1, i + 1)];
      const t = normalize(sub(pNext, pPrev));
      let u = prevU ? sub(prevU, scale(t, dot(prevU, t))) : null;
      if (!u || length(u) < 1e-6) {
        const ref = Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
        u = cross(t, ref);
      }
      u = normalize(u);
      prevU = u;
      const v = cross(t, u);
      const r = radiusAt(i, points.length > 1 ? i / (points.length - 1) : 0);
      const ring = [];
      for (let j = 0; j < radialSeg; j++) {
        const a = (j / radialSeg) * Math.PI * 2;
        const dir = add(scale(u, Math.cos(a)), scale(v, Math.sin(a)));
        ring.push(this.addVertex(add(p, scale(dir, r))));
      }
      ringIdx.push(ring);
    }
    for (let i = 0; i < ringIdx.length - 1; i++) {
      for (let j = 0; j < radialSeg; j++) {
        const a = ringIdx[i][j];
        const b = ringIdx[i][(j + 1) % radialSeg];
        const c = ringIdx[i + 1][(j + 1) % radialSeg];
        const d = ringIdx[i + 1][j];
        this.faces.push([a, b, c]);
        this.faces.push([a, c, d]);
      }
    }
    this.capFan(ringIdx[0], points[0], true);
    this.capFan(ringIdx[ringIdx.length - 1], points[points.length - 1], false);
  }

  // 两点之间的圆柱
  cylinderBetween(p1, p2, radius, radialSeg) {
    this.tube([p1, p2], radius, radialSeg);
  }

  // 环面（甲状体）：majorR 主半径，minorR 管半径，axis 为环所在平面的法向 'x'|'y'|'z'
  // 用于核孔、套环、颗粒带等细节；tStart/tEnd 可做部分弧
  torus(center, majorR, minorR, majorSeg, minorSeg, axis = 'y', opts = {}) {
    const tStart = opts.thetaStart !== undefined ? opts.thetaStart : 0;
    const tEnd = opts.thetaEnd !== undefined ? opts.thetaEnd : Math.PI * 2;
    const full = Math.abs(tEnd - tStart - Math.PI * 2) < 1e-6;
    const mDiv = full ? majorSeg : Math.max(2, Math.round(majorSeg * (tEnd - tStart) / (Math.PI * 2)));
    // 根据 axis 将局部 (cosθ*(majorR+minorR*cosφ), minorR*sinφ, sinθ*(...)) 映射到世界
    const place = (a, b, c) => {
      if (axis === 'y') return [center[0] + a, center[1] + b, center[2] + c];
      if (axis === 'x') return [center[0] + b, center[1] + a, center[2] + c];
      return [center[0] + a, center[1] + c, center[2] + b]; // 'z'
    };
    const grid = [];
    for (let i = 0; i <= mDiv; i++) {
      const theta = tStart + (i / mDiv) * (tEnd - tStart);
      const ct = Math.cos(theta);
      const st = Math.sin(theta);
      const row = [];
      for (let j = 0; j <= minorSeg; j++) {
        const phi = (j / minorSeg) * Math.PI * 2;
        const rr = majorR + minorR * Math.cos(phi);
        row.push(this.addVertex(place(ct * rr, minorR * Math.sin(phi), st * rr)));
      }
      grid.push(row);
    }
    const iMax = full ? mDiv : mDiv; // full 时首尾环重合，仍按 mDiv 列连接
    for (let i = 0; i < iMax; i++) {
      const ni = full ? (i + 1) % mDiv : i + 1;
      for (let j = 0; j < minorSeg; j++) {
        const a = grid[i][j];
        const b = grid[ni][j];
        const c = grid[ni][j + 1];
        const d = grid[i][j + 1];
        this.faces.push([a, b, c]);
        this.faces.push([a, c, d]);
      }
    }
  }

  // UV 球/椭球。opts.thetaStart/thetaEnd 可限制方位角范围实现剖切（配合双面材质展示内部）
  sphere(center, radius, wSeg, hSeg, opts = {}) {
    this.ellipsoid(center, [radius, radius, radius], wSeg, hSeg, opts);
  }

  ellipsoid(center, radii, wSeg, hSeg, opts = {}) {
    const tStart = opts.thetaStart !== undefined ? opts.thetaStart : 0;
    const tEnd = opts.thetaEnd !== undefined ? opts.thetaEnd : Math.PI * 2;
    const full = Math.abs(tEnd - tStart - Math.PI * 2) < 1e-6;
    // 剖切时按角度比例分配经向分段（首尾环不合并，需要 +1 列）
    const wDiv = full ? wSeg : Math.max(3, Math.round(wSeg * (tEnd - tStart) / (Math.PI * 2)));
    const idx = [];
    for (let iy = 0; iy <= hSeg; iy++) {
      const row = [];
      const phi = (iy / hSeg) * Math.PI;
      for (let ix = 0; ix <= wDiv; ix++) {
        const theta = tStart + (ix / wDiv) * (tEnd - tStart);
        row.push(this.addVertex([
          center[0] + radii[0] * Math.sin(phi) * Math.cos(theta),
          center[1] + radii[1] * Math.cos(phi),
          center[2] + radii[2] * Math.sin(phi) * Math.sin(theta)
        ]));
      }
      idx.push(row);
    }
    for (let iy = 0; iy < hSeg; iy++) {
      for (let ix = 0; ix < wDiv; ix++) {
        const a = idx[iy][ix];
        const b = idx[iy][ix + 1];
        const c = idx[iy + 1][ix + 1];
        const d = idx[iy + 1][ix];
        if (iy === 0) this.faces.push([b, c, d]);
        else if (iy === hSeg - 1) this.faces.push([a, b, c]);
        else {
          this.faces.push([a, b, c]);
          this.faces.push([a, c, d]);
        }
      }
    }
  }

  // 正二十面体 / 细分派生球（平直法线：每面独立顶点），scaleVec 可轴向拉伸；自动校正 winding 朝外
  // freq：每条边的细分等分数，1=原始 20 面，freq>1 生成 20*freq^2 面的派生球（晶体颗状衣壳）
  icosahedron(center, radius, scaleVec = [1, 1, 1], freq = 1) {
    const t = (1 + Math.sqrt(5)) / 2;
    const raw = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
    ].map(v => normalize(v));
    const faceIdx = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
    ];
    const F = Math.max(1, Math.round(freq));
    // 将单位方向投影为世界坐标（轴向拉伸）
    const project = v => add(center, [
      v[0] * radius * scaleVec[0],
      v[1] * radius * scaleVec[1],
      v[2] * radius * scaleVec[2]
    ]);
    const emit = tri => {
      let pts = tri;
      const faceCenter = scale(add(add(pts[0], pts[1]), pts[2]), 1 / 3);
      const n = cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]));
      if (dot(n, sub(faceCenter, center)) < 0) pts = [pts[0], pts[2], pts[1]];
      const a = this.addVertex(pts[0]);
      const b = this.addVertex(pts[1]);
      const c = this.addVertex(pts[2]);
      this.faces.push([a, b, c]);
    };
    for (const f of faceIdx) {
      const v0 = raw[f[0]];
      const v1 = raw[f[1]];
      const v2 = raw[f[2]];
      if (F === 1) {
        emit([project(v0), project(v1), project(v2)]);
        continue;
      }
      // 重心网格细分：沿两边方向均匀内插后归一化投影到球面
      const gridPt = (i, j) => {
        const a = (F - i - j) / F;
        const b = i / F;
        const c = j / F;
        return project(normalize(add(add(scale(v0, a), scale(v1, b)), scale(v2, c))));
      };
      for (let i = 0; i < F; i++) {
        for (let j = 0; j < F - i; j++) {
          emit([gridPt(i, j), gridPt(i + 1, j), gridPt(i, j + 1)]);
          if (j < F - i - 1) {
            emit([gridPt(i + 1, j), gridPt(i + 1, j + 1), gridPt(i, j + 1)]);
          }
        }
      }
    }
  }
}

// ---- 输出 GLB（glTF 2.0 二进制）----
// parts: [{ name, mesh: MeshBuilder, material: { name, baseColorFactor, metallicFactor, roughnessFactor, doubleSided } }]
// 自动将所有部件包围盒中心平移到原点（查看器按固定 scale 挂载，居中更稳妥）
function buildGLB(parts, generator) {
  // 整体居中
  const boxMin = [Infinity, Infinity, Infinity];
  const boxMax = [-Infinity, -Infinity, -Infinity];
  for (const part of parts) {
    for (const v of part.mesh.verts) {
      for (let i = 0; i < 3; i++) {
        if (v[i] < boxMin[i]) boxMin[i] = v[i];
        if (v[i] > boxMax[i]) boxMax[i] = v[i];
      }
    }
  }
  const boxCenter = scale(add(boxMin, boxMax), 0.5);
  for (const part of parts) part.mesh.translate(scale(boxCenter, -1));

  const binChunks = [];
  const bufferViews = [];
  const accessors = [];
  const materials = [];
  const primitives = [];
  let byteOffset = 0;
  let totalVerts = 0;
  let totalFaces = 0;
  const pad4 = n => (4 - (n % 4)) % 4;

  for (const part of parts) {
    const { verts, faces } = part.mesh;
    totalVerts += verts.length;
    totalFaces += faces.length;

    // 平滑顶点法线：累加面法线后归一化（glTF 不自动计算）
    const normals = verts.map(() => [0, 0, 0]);
    for (const f of faces) {
      const a = verts[f[0] - 1];
      const b = verts[f[1] - 1];
      const c = verts[f[2] - 1];
      const n = cross(sub(b, a), sub(c, a));
      for (const vi of f) normals[vi - 1] = add(normals[vi - 1], n);
    }
    for (let i = 0; i < normals.length; i++) {
      const n = normalize(normals[i]);
      normals[i] = length(n) < 1e-12 ? [0, 1, 0] : n;
    }

    // POSITION accessor 必须提供 min/max
    const posMin = [Infinity, Infinity, Infinity];
    const posMax = [-Infinity, -Infinity, -Infinity];
    for (const v of verts) {
      for (let i = 0; i < 3; i++) {
        if (v[i] < posMin[i]) posMin[i] = v[i];
        if (v[i] > posMax[i]) posMax[i] = v[i];
      }
    }

    const positionArr = new Float32Array(verts.length * 3);
    const normalArr = new Float32Array(verts.length * 3);
    verts.forEach((v, i) => positionArr.set(v, i * 3));
    normals.forEach((n, i) => normalArr.set(n, i * 3));
    const useUint32 = verts.length > 65535;
    const IndexArray = useUint32 ? Uint32Array : Uint16Array;
    const indexArr = new IndexArray(faces.length * 3);
    faces.forEach((f, i) => {
      indexArr[i * 3] = f[0] - 1;
      indexArr[i * 3 + 1] = f[1] - 1;
      indexArr[i * 3 + 2] = f[2] - 1;
    });

    const posBytes = Buffer.from(positionArr.buffer);
    const nrmBytes = Buffer.from(normalArr.buffer);
    const idxBytes = Buffer.from(indexArr.buffer);
    const base = bufferViews.length;

    bufferViews.push(
      { buffer: 0, byteOffset, byteLength: posBytes.length, target: 34962 },
      { buffer: 0, byteOffset: byteOffset + posBytes.length, byteLength: nrmBytes.length, target: 34962 },
      { buffer: 0, byteOffset: byteOffset + posBytes.length + nrmBytes.length, byteLength: idxBytes.length, target: 34963 }
    );
    accessors.push(
      { bufferView: base, componentType: 5126, count: verts.length, type: 'VEC3', min: posMin, max: posMax },
      { bufferView: base + 1, componentType: 5126, count: verts.length, type: 'VEC3' },
      { bufferView: base + 2, componentType: useUint32 ? 5125 : 5123, count: indexArr.length, type: 'SCALAR' }
    );
    const accBase = accessors.length - 3;
    const matIdx = materials.length;
    const mat = part.material || {};
    materials.push({
      name: mat.name || part.name + '_material',
      pbrMetallicRoughness: {
        baseColorFactor: mat.baseColorFactor || [0.373, 0.722, 0.58, 1],
        metallicFactor: mat.metallicFactor !== undefined ? mat.metallicFactor : 0.1,
        roughnessFactor: mat.roughnessFactor !== undefined ? mat.roughnessFactor : 0.6
      },
      doubleSided: !!mat.doubleSided
    });
    primitives.push({
      attributes: { POSITION: accBase, NORMAL: accBase + 1 },
      indices: accBase + 2,
      material: matIdx
    });

    const chunk = Buffer.concat([posBytes, nrmBytes, idxBytes]);
    binChunks.push(chunk, Buffer.alloc(pad4(chunk.length)));
    byteOffset += chunk.length + pad4(chunk.length);
  }

  const binBody = Buffer.concat(binChunks);
  const gltf = {
    asset: { version: '2.0', generator: generator || 'tools/lib/glb-builder.js' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'model' }],
    meshes: [{ name: 'model', primitives }],
    materials,
    buffers: [{ byteLength: binBody.length }],
    bufferViews,
    accessors
  };

  // GLB 容器：12 字节头 + JSON chunk（空格补齐 4 字节）+ BIN chunk（补零对齐）
  let jsonBuf = Buffer.from(JSON.stringify(gltf), 'utf8');
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(pad4(jsonBuf.length), 0x20)]);
  const totalLength = 12 + 8 + jsonBuf.length + 8 + binBody.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // magic 'glTF'
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonBuf.length, 0);
  jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'
  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binBody.length, 0);
  binChunkHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

  return {
    buffer: Buffer.concat([header, jsonChunkHeader, jsonBuf, binChunkHeader, binBody]),
    vertCount: totalVerts,
    faceCount: totalFaces
  };
}

// 生成并写入文件，打印统计信息
function saveGLB(outPath, parts, generator) {
  const { buffer, vertCount, faceCount } = buildGLB(parts, generator);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buffer);
  const stats = fs.statSync(outPath);
  console.log('生成完成:', outPath);
  console.log('顶点数:', vertCount, '三角面数:', faceCount, '文件大小:', stats.size, 'bytes');
  return stats.size;
}

// 项目配色（手绘风格设计系统）
const COLORS = {
  green: [0.373, 0.722, 0.58, 1],       // 主题绿 #5fb894
  greenDeep: [0.243, 0.557, 0.408, 1],  // 深绿 #3E8E68
  greenSoft: [0.659, 0.847, 0.753, 1],  // 浅绿 #A8D8C0
  amber: [0.941, 0.784, 0.376, 1],      // 暖黄 #F0C860
  cream: [0.961, 0.941, 0.902, 1],      // 米白 #F5F0E6
  orange: [0.91, 0.588, 0.353, 1]       // 橙 #E8965A
};

module.exports = { MeshBuilder, buildGLB, saveGLB, COLORS, add, sub, scale, normalize, lerp };
