// 一次性脚本：合成互动音效 WAV 文件（16kHz 16bit mono）
// 用法：node tools/gen-sounds.js
// 输出：miniprogram/assets/sounds/<style>/<name>.wav
const fs = require('fs');
const path = require('path');

const SR = 16000; // 采样率
const OUT_ROOT = path.join(__dirname, '..', 'miniprogram', 'assets', 'sounds');

// 波形生成
function waveValue(wave, phase) {
  if (wave === 'square') return Math.sign(Math.sin(phase)) * 0.55;
  if (wave === 'triangle') return (2 / Math.PI) * Math.asin(Math.sin(phase));
  return Math.sin(phase);
}

// 合成一段音符事件序列并串联
// ev: { f0, f1(可选滑音), dur, wave, vol, attack, decay, harmonics }
function synth(events) {
  const out = [];
  for (const ev of events) {
    const n = Math.round(ev.dur * SR);
    const attack = ev.attack != null ? ev.attack : 0.005;
    const decay = ev.decay != null ? ev.decay : ev.dur / 2.5;
    const vol = ev.vol != null ? ev.vol : 0.32;
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const prog = i / n;
      const freq = ev.f0 + (ev.f1 != null ? (ev.f1 - ev.f0) * prog : 0);
      phase += (2 * Math.PI * freq) / SR;
      let v = waveValue(ev.wave, phase);
      // 叠加少量二次泛音让音色更亮
      if (ev.harmonics) v += 0.3 * Math.sin(phase * 2);
      let env;
      if (t < attack) env = t / attack;
      else env = Math.exp(-(t - attack) / decay);
      // 末尾 8ms 强制淡出，消除爆音
      const remain = (n - i) / SR;
      if (remain < 0.008) env *= remain / 0.008;
      out.push(v * env * vol);
    }
  }
  return out;
}

// 混音（把多轨样本对齐起点叠加并归一）
function mix(tracks) {
  const len = Math.max(...tracks.map((t) => t.length));
  const out = new Array(len).fill(0);
  for (const t of tracks) for (let i = 0; i < t.length; i++) out[i] += t[i];
  const peak = Math.max(...out.map(Math.abs), 0.9);
  return out.map((v) => (v / peak) * 0.85);
}

function wavBuffer(samples) {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}

// ============ 三套音效设计 ============
const S = 'sine';
const Q = 'square';

const SETS = {
  // 清脆铃声（默认）：明亮正弦 + 泛音
  crisp: {
    correct: () => mix([
      synth([{ f0: 1319, dur: 0.1, wave: S, harmonics: true }]),
      (() => { const t = synth([{ f0: 1976, dur: 0.32, wave: S, harmonics: true }]); return new Array(Math.round(0.09 * SR)).fill(0).concat(t); })()
    ]),
    wrong: () => synth([
      { f0: 220, f1: 140, dur: 0.28, wave: S, vol: 0.4, decay: 0.14 }
    ]),
    click: () => synth([{ f0: 1600, dur: 0.045, wave: S, vol: 0.25, decay: 0.02 }]),
    pop: () => synth([{ f0: 500, f1: 1100, dur: 0.09, wave: S, vol: 0.3, decay: 0.05 }]),
    complete: () => synth([
      { f0: 1047, dur: 0.1, wave: S, harmonics: true },
      { f0: 1319, dur: 0.1, wave: S, harmonics: true },
      { f0: 1568, dur: 0.1, wave: S, harmonics: true },
      { f0: 2093, dur: 0.38, wave: S, harmonics: true, decay: 0.2 }
    ])
  },
  // 柔和木琴：低八度、慢起音、长衰减
  soft: {
    correct: () => mix([
      synth([{ f0: 784, dur: 0.16, wave: S, attack: 0.015, decay: 0.09, vol: 0.3 }]),
      (() => { const t = synth([{ f0: 1175, dur: 0.4, wave: S, attack: 0.015, decay: 0.22, vol: 0.3 }]); return new Array(Math.round(0.12 * SR)).fill(0).concat(t); })()
    ]),
    wrong: () => synth([
      { f0: 330, f1: 247, dur: 0.32, wave: S, vol: 0.28, attack: 0.02, decay: 0.2 }
    ]),
    click: () => synth([{ f0: 880, dur: 0.06, wave: S, vol: 0.2, attack: 0.01, decay: 0.035 }]),
    pop: () => synth([{ f0: 400, f1: 760, dur: 0.11, wave: S, vol: 0.25, attack: 0.01, decay: 0.07 }]),
    complete: () => synth([
      { f0: 523, dur: 0.14, wave: S, attack: 0.012, decay: 0.08 },
      { f0: 659, dur: 0.14, wave: S, attack: 0.012, decay: 0.08 },
      { f0: 784, dur: 0.14, wave: S, attack: 0.012, decay: 0.08 },
      { f0: 1047, dur: 0.5, wave: S, attack: 0.012, decay: 0.3 }
    ])
  },
  // 复古像素：方波 8-bit
  retro: {
    correct: () => synth([
      { f0: 988, dur: 0.08, wave: Q, vol: 0.22, decay: 0.05 },
      { f0: 1319, dur: 0.34, wave: Q, vol: 0.22, decay: 0.16 }
    ]),
    wrong: () => synth([
      { f0: 160, dur: 0.12, wave: Q, vol: 0.24, decay: 0.08 },
      { f0: 110, dur: 0.26, wave: Q, vol: 0.24, decay: 0.14 }
    ]),
    click: () => synth([{ f0: 1100, dur: 0.035, wave: Q, vol: 0.16, decay: 0.018 }]),
    pop: () => synth([{ f0: 300, f1: 1300, dur: 0.07, wave: Q, vol: 0.2, decay: 0.04 }]),
    complete: () => synth([
      { f0: 1047, dur: 0.08, wave: Q, vol: 0.2, decay: 0.05 },
      { f0: 1319, dur: 0.08, wave: Q, vol: 0.2, decay: 0.05 },
      { f0: 1568, dur: 0.08, wave: Q, vol: 0.2, decay: 0.05 },
      { f0: 2093, dur: 0.16, wave: Q, vol: 0.2, decay: 0.08 },
      { f0: 1568, dur: 0.08, wave: Q, vol: 0.2, decay: 0.05 },
      { f0: 2093, dur: 0.32, wave: Q, vol: 0.2, decay: 0.15 }
    ])
  }
};

// ============ 生成 ============
let count = 0;
for (const style of Object.keys(SETS)) {
  const dir = path.join(OUT_ROOT, style);
  fs.mkdirSync(dir, { recursive: true });
  for (const name of Object.keys(SETS[style])) {
    const samples = SETS[style][name]();
    const file = path.join(dir, name + '.wav');
    fs.writeFileSync(file, wavBuffer(samples));
    count++;
    console.log('生成', path.relative(path.join(__dirname, '..'), file), (samples.length / SR).toFixed(2) + 's');
  }
}
console.log('完成，共 ' + count + ' 个音效文件');
