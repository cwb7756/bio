// utils/sound.js - 全局互动音效管理器
// 音效文件位于 /assets/sounds/<style>/<name>.wav
// 可用音效：correct(答对) wrong(答错) click(点击) pop(互动) complete(完成/升级)
// 开关与风格持久化于本地 storage，设置页负责同步云端 users.settings

const STORAGE_KEY = 'soundSettings';
const DEFAULT_STYLE = 'crisp';
const STYLES = ['crisp', 'soft', 'retro'];

let enabled = true;
let style = DEFAULT_STYLE;
const players = {}; // name -> InnerAudioContext（全局复用）

// 启动时从本地缓存恢复（页面无需手动初始化）
try {
  const s = wx.getStorageSync(STORAGE_KEY);
  if (s) {
    enabled = s.enabled !== false;
    if (STYLES.indexOf(s.style) >= 0) style = s.style;
  }
} catch (e) {
  // 读取失败使用默认值
}

function saveLocal() {
  try {
    wx.setStorageSync(STORAGE_KEY, { enabled: enabled, style: style });
  } catch (e) {
    // 存储失败不影响播放
  }
}

// 播放指定音效；开关关闭或播放异常时静默跳过
function play(name) {
  if (!enabled) return;
  try {
    let p = players[name];
    if (!p) {
      p = wx.createInnerAudioContext();
      p._src = '';
      players[name] = p;
    }
    const src = '/assets/sounds/' + style + '/' + name + '.wav';
    if (p._src !== src) {
      p.src = src;
      p._src = src;
    }
    p.stop();
    p.play();
  } catch (e) {
    // 音频不可用时静默降级
  }
}

function setEnabled(v) {
  enabled = !!v;
  saveLocal();
}

function setStyle(s) {
  if (STYLES.indexOf(s) < 0) return;
  style = s;
  // 风格切换后强制各播放器重新加载音频
  Object.keys(players).forEach((k) => { players[k]._src = ''; });
  saveLocal();
}

// 应用云端设置（设置页 loadSettings 成功后调用）
function applySettings(settings) {
  if (!settings) return;
  enabled = settings.sound !== false;
  if (STYLES.indexOf(settings.soundStyle) >= 0) {
    style = settings.soundStyle;
  }
  Object.keys(players).forEach((k) => { players[k]._src = ''; });
  saveLocal();
}

function getState() {
  return { enabled: enabled, style: style };
}

module.exports = {
  play: play,
  setEnabled: setEnabled,
  setStyle: setStyle,
  applySettings: applySettings,
  getState: getState,
  STYLES: STYLES.slice()
};
