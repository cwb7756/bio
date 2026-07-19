// 压缩 miniprogram/images 下的 PNG：调色板量化（保留透明通道），仅当更小时覆盖
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const imgDir = path.resolve(__dirname, '../../miniprogram/images');
const backupDir = path.resolve(__dirname, 'backup');

if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

async function compressOne(file) {
  const src = path.join(imgDir, file);
  const buf = fs.readFileSync(src);
  const before = buf.length;

  const out = await sharp(buf)
    .png({ palette: true, quality: 82, compressionLevel: 9, dither: 0.8 })
    .toBuffer();

  const after = out.length;
  if (after < before) {
    // 备份原图（仅首次）
    const bak = path.join(backupDir, file);
    if (!fs.existsSync(bak)) fs.copyFileSync(src, bak);
    fs.writeFileSync(src, out);
    console.log(`${file}: ${(before / 1024).toFixed(1)}KB -> ${(after / 1024).toFixed(1)}KB  (-${((1 - after / before) * 100).toFixed(0)}%)`);
    return after - before;
  }
  console.log(`${file}: 跳过（压缩后更大）`);
  return 0;
}

(async () => {
  const files = fs.readdirSync(imgDir).filter(f => f.endsWith('.png'));
  let saved = 0;
  for (const f of files) saved += await compressOne(f);
  console.log(`\n共节省 ${(saved / 1024).toFixed(1)}KB`);
})();
