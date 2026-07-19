// pages/aiClassroom/aiClassroom.js
// AI课堂：输入问题 → 大纲确认 → 分阶段生成课件 → TTS 配音播放
const app = getApp();
const cw = require('../../utils/courseware.js');

// 场景类型中文标签
const TYPE_LABELS = {
  cover: '封面',
  concept: '概念',
  diagram: '图解',
  sim: '动画',
  quiz: '小测',
  summary: '总结'
};

// 推荐主题
const SUGGESTIONS = [
  '什么是光合作用？',
  '减数分裂的过程',
  'DNA是如何复制的？',
  '兴奋在神经纤维上的传导',
  '生态系统的能量流动'
];

// LLM 调用：流式累加全文 → 解析 JSON；失败 reject 供重试
function llmJson(messages) {
  return new Promise(function (resolve, reject) {
    const model = wx.cloud.extend.AI.createModel('cloudbase');
    let full = '';
    model.streamText({
      data: { model: 'hy3', messages: messages },
      onText: function (delta) { full += delta; },
      onFinish: function (finalText) {
        full = finalText || full;
        try {
          resolve(cw.extractJson(full));
        } catch (e) {
          reject(e);
        }
      }
    }).catch(reject);
  });
}

// 相对时间格式化：刚刚 / x分钟前 / x小时前 / 昨天 / MM-DD
function formatRelativeTime(ts) {
  if (!ts) return '';
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / 3600000) + '小时前';
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (d >= yesterday) return '昨天';
  const pad = function (n) { return n < 10 ? '0' + n : '' + n; };
  return pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

Page({
  data: {
    statusBarHeight: 20,
    phase: 'input',          // input | outline | generating | playing
    typeLabels: TYPE_LABELS,
    // input 态
    inputValue: '',
    suggestions: SUGGESTIONS,
    historyList: [],
    // outline 态
    outlineLoading: false,
    outlineTitle: '',
    sections: [],
    // generating 态
    genCurrent: 0,           // 正在生成第几节（1-based）
    genTotal: 0,
    genDoneList: [],         // [{ title, sceneType }]
    genProgress: '0%',       // 进度条宽度（含单位，规避内联样式 }}% 校验误报）
    // playing 态
    coursewareTitle: '',
    scenes: [],
    current: 0,
    currentScene: null,
    currentFrame: null,      // sim 场景当前帧
    frameIndex: 0,
    playing: false,
    autoPlay: true,
    subtitle: '',
    showSubtitle: true,
    quizPicked: '',          // quiz 已选选项 key
    isLastScene: false
  },

  onLoad(options) {
    const sys = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: sys.statusBarHeight });

    // 运行时缓存（不参与渲染）
    this._scenesRaw = [];        // 生成中的原始场景
    this._ttsCache = {};         // key -> Promise<clips[]>
    this._audio = null;          // InnerAudioContext 单例
    this._fs = wx.getFileSystemManager();
    this._audioFiles = [];       // 待清理临时文件
    this._fileCounter = 0;
    this._playToken = null;      // 播放令牌，翻页/退出时使旧回调失效
    this._silentTimer = null;
    this._silentToastShown = false;
    this._sceneStarted = false;  // 当前场景音频是否已开始（暂停中恢复用）
    this._genAborted = false;

    // 登录门控：课件为用户数据，未登录跳转登录页
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录后使用AI课堂', icon: 'none' });
      setTimeout(function () {
        wx.navigateTo({ url: '/pages/login/login' });
      }, 1000);
      return;
    }
    this.loadHistory();

    // 支持外部带问题预填（如 AI 答疑页联动）
    if (options && options.question) {
      this.setData({ inputValue: decodeURIComponent(options.question) });
    }
  },

  onShow() {
    // 从登录页返回后刷新历史
    if (app.globalData.isLoggedIn && this.data.phase === 'input') {
      this.loadHistory();
    }
  },

  onUnload() {
    this.stopPlayback();
    if (this._audio) {
      this._audio.destroy();
      this._audio = null;
    }
    // 清理临时音频文件（best-effort）
    const fs = this._fs;
    this._audioFiles.forEach(function (p) {
      try { fs.unlinkSync(p); } catch (e) { }
    });
    this._audioFiles = [];
  },

  onBack() {
    // 生成中返回：中断生成
    if (this.data.phase === 'generating') {
      this._genAborted = true;
    }
    if (getCurrentPages().length > 1) {
      wx.navigateBack();
    } else {
      wx.switchTab({ url: '/pages/aiHub/aiHub' });
    }
  },

  // 顶栏返回：播放态先退出播放回输入页，其余态直接返回
  onNavBack() {
    if (this.data.phase === 'playing') {
      this.onExitPlay();
    } else {
      this.onBack();
    }
  },

  // ---------- input 态 ----------

  onInput(e) {
    this.setData({ inputValue: e.detail.value });
  },

  onTapSuggestion(e) {
    const text = e.currentTarget.dataset.text;
    this.setData({ inputValue: text });
    this.onStartOutline();
  },

  // 检查 AI 能力可用性
  checkAiReady() {
    if (!wx.cloud || !wx.cloud.extend || !wx.cloud.extend.AI) {
      wx.showToast({ title: '当前基础库版本不支持AI能力，需≥3.15.1', icon: 'none', duration: 3000 });
      return false;
    }
    return true;
  },

  // 生成大纲
  async onStartOutline() {
    const question = this.data.inputValue.trim();
    if (!question) {
      wx.showToast({ title: '先输入想学习的问题吧', icon: 'none' });
      return;
    }
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    if (!this.checkAiReady()) return;

    this.setData({ phase: 'outline', outlineLoading: true, sections: [], outlineTitle: '' });
    try {
      const raw = await llmJson(cw.buildOutlineMessages(question));
      const outline = cw.normalizeOutline(raw, question);
      const sections = outline.sections.map(function (s) {
        return { title: s.title, sceneType: s.sceneType, goal: s.goal };
      });
      this.setData({ outlineTitle: outline.title, sections: sections, outlineLoading: false });
    } catch (err) {
      console.error('outline error:', err);
      wx.showToast({ title: '大纲生成失败，请重试', icon: 'none' });
      this.setData({ phase: 'input', outlineLoading: false });
    }
  },

  // ---------- outline 态 ----------

  onEditSection(e) {
    const index = e.currentTarget.dataset.index;
    const value = e.detail.value;
    this.setData({ ['sections[' + index + '].title']: value });
  },

  onDeleteSection(e) {
    const index = e.currentTarget.dataset.index;
    const sections = this.data.sections.slice();
    if (sections.length <= 2) {
      wx.showToast({ title: '至少保留2节', icon: 'none' });
      return;
    }
    sections.splice(index, 1);
    this.setData({ sections: sections });
  },

  // 确认大纲 → 逐场景生成
  async onConfirmOutline() {
    const sections = this.data.sections;
    if (!sections.length || !this.checkAiReady()) return;
    const question = this.data.inputValue.trim();
    const title = this.data.outlineTitle || '生物小课堂';

    this._scenesRaw = [];
    this._genAborted = false;
    this.setData({
      phase: 'generating',
      genCurrent: 1,
      genTotal: sections.length,
      genDoneList: [],
      genProgress: '0%'
    });

    for (let i = 0; i < sections.length; i++) {
      if (this._genAborted) return;
      this.setData({ genCurrent: i + 1 });
      const scene = await this.genOneScene(question, title, sections[i], i, sections.length);
      if (this._genAborted) return;
      this._scenesRaw.push(scene);
      // 轻量列表用于进度展示（不带 svg 长字符串）
      const doneList = this._scenesRaw.map(function (s) {
        return { title: s.title, sceneType: s.type };
      });
      const pct = Math.round(this._scenesRaw.length / sections.length * 100) + '%';
      this.setData({ genDoneList: doneList, genProgress: pct });
      // 并行预取该场景音频
      this.prefetchSceneAudio(i, scene);
    }

    if (!this._scenesRaw.length) {
      wx.showToast({ title: '课件生成失败，请重试', icon: 'none' });
      this.setData({ phase: 'input' });
      return;
    }

    // 保存课件（best-effort，失败不影响播放）
    wx.cloud.callFunction({
      name: 'aiCourseware',
      data: {
        action: 'saveCourseware',
        title: title,
        question: question,
        scenes: this._scenesRaw
      }
    }).catch(function (err) {
      console.error('saveCourseware error:', err);
    });

    this.enterPlay(this._scenesRaw, title);
  },

  // 生成单个场景：失败重试 1 次 → 降级 concept 文字页
  async genOneScene(question, coursewareTitle, section, index, total) {
    const build = function () {
      return cw.buildSceneMessages(question, coursewareTitle, section, index + 1, total);
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await llmJson(build());
        const scene = cw.normalizeScene(raw, section.title);
        if (scene) return scene;
      } catch (err) {
        console.error('scene gen error (attempt ' + attempt + '):', err);
      }
    }
    return cw.fallbackScene(section.title, section.goal);
  },

  // 先播放已完成部分（生成中途）
  onPlayPartial() {
    if (!this._scenesRaw.length) return;
    this._genAborted = true;
    const title = this.data.outlineTitle || '生物小课堂';
    this.enterPlay(this._scenesRaw, title);
  },

  onAbortGenerate() {
    this._genAborted = true;
    this.setData({ phase: 'input' });
  },

  // ---------- 历史课件 ----------

  async loadHistory() {
    if (!app.globalData.isLoggedIn) {
      this.setData({ historyList: [] });
      return;
    }
    try {
      const res = await wx.cloud.callFunction({
        name: 'aiCourseware',
        data: { action: 'listCoursewares' }
      });
      const list = (res.result && res.result.coursewares) || [];
      const historyList = list.map(function (c) {
        return {
          _id: c._id,
          title: c.title,
          question: c.question,
          sceneCount: c.sceneCount,
          timeText: formatRelativeTime(c.updatedAt)
        };
      });
      this.setData({ historyList: historyList });
    } catch (err) {
      console.error('loadHistory error:', err);
    }
  },

  // 打开历史课件 → 直接播放
  async onTapHistory(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showLoading({ title: '加载课件中', mask: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'aiCourseware',
        data: { action: 'getCourseware', coursewareId: id }
      });
      wx.hideLoading();
      const c = res.result && res.result.courseware;
      if (!c || !c.scenes || !c.scenes.length) {
        wx.showToast({ title: '课件内容为空', icon: 'none' });
        return;
      }
      this.enterPlay(c.scenes, c.title);
    } catch (err) {
      wx.hideLoading();
      console.error('getCourseware error:', err);
      wx.showToast({ title: '课件加载失败', icon: 'none' });
    }
  },

  // 长按删除历史课件
  onLongPressHistory(e) {
    const id = e.currentTarget.dataset.id;
    const self = this;
    if (!id) return;
    wx.showModal({
      title: '删除课件',
      content: '确定删除这份课件吗？',
      confirmText: '删除',
      confirmColor: '#EE8888',
      success: function (res) {
        if (!res.confirm) return;
        wx.cloud.callFunction({
          name: 'aiCourseware',
          data: { action: 'deleteCourseware', coursewareId: id }
        }).then(function () {
          self.loadHistory();
        }).catch(function (err) {
          console.error('deleteCourseware error:', err);
          wx.showToast({ title: '删除失败', icon: 'none' });
        });
      }
    });
  },

  // ---------- 播放准备 ----------

  // 场景预处理：SVG 净化转 data URI；quiz 选项结构化；失败的图形场景降级
  prepareScene(raw) {
    const s = Object.assign({}, raw);
    if (s.type === 'diagram') {
      const uri = cw.svgToUriSafe(s.svg);
      if (!uri) {
        return {
          type: 'concept',
          title: s.title,
          narration: s.narration,
          blocks: [{ kind: 'paragraph', text: s.caption || '图解渲染失败，请结合讲稿理解。' }]
        };
      }
      s.svgUri = uri;
      return s;
    }
    if (s.type === 'sim') {
      const frames = (s.frames || []).map(function (f) {
        return { svg: f.svg, caption: f.caption, narration: f.narration, svgUri: cw.svgToUriSafe(f.svg) };
      }).filter(function (f) { return !!f.svgUri; });
      if (frames.length < 2) {
        return {
          type: 'concept',
          title: s.title,
          narration: s.narration,
          blocks: [{ kind: 'paragraph', text: '动画渲染失败，请结合讲稿理解本过程。' }]
        };
      }
      s.frames = frames;
      return s;
    }
    if (s.type === 'quiz') {
      s.options = (s.options || []).map(function (t, i) {
        return { key: String.fromCharCode(65 + i), text: t };
      });
      return s;
    }
    return s;
  },

  // 进入播放态
  enterPlay(scenesRaw, title) {
    const scenes = scenesRaw.map(this.prepareScene, this);
    this._playToken = null;
    this.setData({
      phase: 'playing',
      coursewareTitle: title || '生物小课堂',
      scenes: scenes,
      current: 0,
      currentScene: null,
      currentFrame: null,
      frameIndex: 0,
      quizPicked: '',
      playing: true,
      showSubtitle: true,
      isLastScene: scenes.length <= 1
    });
    this.enterScene(0);
  },

  // 进入第 index 个场景
  enterScene(index) {
    const scenes = this.data.scenes;
    if (index < 0 || index >= scenes.length) return;
    this.stopPlayback();
    const scene = scenes[index];
    this._playToken = {};
    this._sceneStarted = false;
    this.setData({
      current: index,
      currentScene: scene,
      currentFrame: scene.type === 'sim' ? scene.frames[0] : null,
      frameIndex: 0,
      quizPicked: '',
      subtitle: scene.narration || '',
      isLastScene: index >= scenes.length - 1
    });
    // 预取下一场景音频
    if (index + 1 < scenes.length) {
      this.prefetchSceneAudio(index + 1, scenes[index + 1]);
    }
    if (this.data.playing) {
      this.startScenePlayback();
    }
  },

  // ---------- 播放引擎 ----------

  // 预取某场景音频（普通场景整体讲稿；sim 场景预取第 0 帧）
  prefetchSceneAudio(index, scene) {
    if (!scene) return;
    if (scene.narration) {
      this.getClips('s' + index, scene.narration);
    }
    if (scene.type === 'sim' && scene.frames && scene.frames[0] && scene.frames[0].narration) {
      this.getClips('s' + index + 'f0', scene.frames[0].narration);
    }
  },

  // 获取 TTS clips（带缓存）；失败 resolve([]) 走静音降级
  getClips(key, text) {
    if (this._ttsCache[key]) return this._ttsCache[key];
    const clean = cw.cleanTtsText(text);
    if (!clean) return Promise.resolve([]);
    const p = wx.cloud.callFunction({
      name: 'aiCourseware',
      data: { action: 'tts', text: clean }
    }).then(function (res) {
      if (res.result && res.result.code === 0 && res.result.clips && res.result.clips.length) {
        return res.result.clips;
      }
      return [];
    }).catch(function (err) {
      console.error('tts error:', err);
      return [];
    });
    this._ttsCache[key] = p;
    return p;
  },

  // base64 → 本地临时文件
  writeAudioFile(base64) {
    const path = wx.env.USER_DATA_PATH + '/cl_tts_' + Date.now() + '_' + (this._fileCounter++) + '.mp3';
    this._fs.writeFileSync(path, base64, 'base64');
    this._audioFiles.push(path);
    return path;
  },

  ensureAudio() {
    if (!this._audio) {
      this._audio = wx.createInnerAudioContext();
    }
    return this._audio;
  },

  // 开始当前场景播放
  startScenePlayback() {
    const scene = this.data.currentScene;
    if (!scene) return;
    this._sceneStarted = true;
    if (scene.type === 'sim') {
      // sim 先播总起讲稿，再进入帧链
      if (scene.narration) {
        const self = this;
        this.playNarration('s' + this.data.current, scene.narration, function () {
          self.startFrame(0);
        });
      } else {
        this.startFrame(0);
      }
    } else {
      this.playNarration('s' + this.data.current, scene.narration, this.onSceneAudioDone);
    }
  },

  // sim 场景：播放第 fi 帧（帧讲稿音频驱动帧切换）
  startFrame(fi) {
    const scene = this.data.currentScene;
    if (!scene || scene.type !== 'sim') return;
    const frames = scene.frames;
    if (fi < 0 || fi >= frames.length) return;
    const frame = frames[fi];
    this._playToken = {};
    this.setData({
      frameIndex: fi,
      currentFrame: frame,
      subtitle: frame.narration || scene.narration || ''
    });
    // 预取下一帧音频
    if (fi + 1 < frames.length && frames[fi + 1].narration) {
      this.getClips('s' + this.data.current + 'f' + (fi + 1), frames[fi + 1].narration);
    }
    const self = this;
    this.playNarration('s' + this.data.current + 'f' + fi, frame.narration, function () {
      // 帧链：音频结束自动切下一帧；末帧结束走场景结束逻辑
      if (fi + 1 < frames.length) {
        self.startFrame(fi + 1);
      } else {
        self.onSceneAudioDone();
      }
    });
  },

  // 播放一段讲稿：有音频顺序连播，无音频静音定时（仅自动模式推进）
  playNarration(cacheKey, text, onDone) {
    const self = this;
    const token = this._playToken;
    this.setData({ subtitle: text || this.data.subtitle });
    this.getClips(cacheKey, text).then(function (clips) {
      if (self._playToken !== token) return;
      // clips 就绪时处于暂停：暂存待播放队列，恢复时接续
      if (!self.data.playing) {
        self._pendingPlay = { clips: clips, text: text, onDone: onDone };
        return;
      }
      if (clips.length) {
        self.playClipsSequentially(clips, 0, onDone);
      } else {
        self.silentWait(text, onDone);
      }
    });
  },

  // 顺序连播 clips
  playClipsSequentially(clips, idx, onDone) {
    const self = this;
    const token = this._playToken;
    if (this._playToken !== token) return;
    if (idx >= clips.length) {
      if (onDone) onDone.call(this);
      return;
    }
    let path;
    try {
      path = this.writeAudioFile(clips[idx].audioBase64);
    } catch (err) {
      console.error('write audio error:', err);
      this.silentWait(clips[idx].text, onDone);
      return;
    }
    const audio = this.ensureAudio();
    audio.stop();
    audio.src = path;
    audio.onEnded(function () {
      if (self._playToken !== token) return;
      self.playClipsSequentially(clips, idx + 1, onDone);
    });
    audio.onError(function (res) {
      console.error('audio play error:', res);
      if (self._playToken !== token) return;
      // 跳过损坏片段继续
      self.playClipsSequentially(clips, idx + 1, onDone);
    });
    audio.play();
  },

  // 静音降级：字幕模式 + 定时推进（toast 只提示一次）
  silentWait(text, onDone) {
    const self = this;
    const token = this._playToken;
    if (!this._silentToastShown) {
      this._silentToastShown = true;
      wx.showToast({ title: '语音暂不可用，已进入字幕模式', icon: 'none', duration: 2500 });
    }
    // 记录静音待办，供暂停恢复后续播
    this._silentPending = { text: text, onDone: onDone };
    if (!this.data.autoPlay) return;
    const dur = Math.min(15000, Math.max(4000, String(text || '').length * 280));
    this._silentTimer = setTimeout(function () {
      if (self._playToken !== token) return;
      self._silentPending = null;
      if (!self.data.playing) return;
      if (onDone) onDone.call(self);
    }, dur);
  },

  // 当前场景音频播完
  onSceneAudioDone() {
    const scene = this.data.currentScene;
    // quiz 场景讲完不自动翻页，等待学生作答后手动继续
    if (scene && scene.type === 'quiz') {
      this.setData({ playing: false });
      return;
    }
    if (!this.data.autoPlay) {
      this.setData({ playing: false });
      return;
    }
    if (this.data.current < this.data.scenes.length - 1) {
      this.enterScene(this.data.current + 1);
    } else {
      this.setData({ playing: false });
      wx.showToast({ title: '课件播放完毕', icon: 'none' });
    }
  },

  // 停止播放（翻页/退出前调用）：停音频、清定时器、吊销令牌
  stopPlayback() {
    this._playToken = null;
    this._pendingPlay = null;
    this._silentPending = null;
    if (this._silentTimer) {
      clearTimeout(this._silentTimer);
      this._silentTimer = null;
    }
    if (this._audio) {
      this._audio.stop();
    }
  },

  // ---------- 播放控制 ----------

  onTogglePlay() {
    const next = !this.data.playing;
    this.setData({ playing: next });
    if (next) {
      if (this._pendingPlay) {
        // clips 就绪期间被暂停 → 接续播放
        const p = this._pendingPlay;
        this._pendingPlay = null;
        if (p.clips.length) {
          this.playClipsSequentially(p.clips, 0, p.onDone);
        } else {
          this.silentWait(p.text, p.onDone);
        }
      } else if (!this._sceneStarted) {
        this.startScenePlayback();
      } else if (this._silentPending) {
        // 静音模式暂停后恢复 → 重新计时
        const sp = this._silentPending;
        this._silentPending = null;
        this.silentWait(sp.text, sp.onDone);
      } else if (this._audio) {
        this._audio.play();
      }
    } else {
      if (this._silentTimer) {
        clearTimeout(this._silentTimer);
        this._silentTimer = null;
      }
      if (this._audio) {
        this._audio.pause();
      }
    }
  },

  onPrevScene() {
    if (this.data.current <= 0) return;
    this.enterScene(this.data.current - 1);
  },

  onNextScene() {
    if (this.data.current >= this.data.scenes.length - 1) return;
    this.enterScene(this.data.current + 1);
  },

  // 重播当前场景
  onReplay() {
    if (!this.data.currentScene) return;
    this.setData({ playing: true });
    this.enterScene(this.data.current);
  },

  onToggleAuto() {
    this.setData({ autoPlay: !this.data.autoPlay });
  },

  onToggleSubtitle() {
    this.setData({ showSubtitle: !this.data.showSubtitle });
  },

  // 退出播放态返回输入页
  onExitPlay() {
    this.stopPlayback();
    this.setData({ playing: false, phase: 'input' });
    this.loadHistory();
  },

  // sim 手动切帧（点按帧进度点）
  onTapFrameDot(e) {
    const fi = e.currentTarget.dataset.index;
    const scene = this.data.currentScene;
    if (!scene || scene.type !== 'sim' || fi === this.data.frameIndex) return;
    this.stopPlayback();
    this._playToken = {};
    if (this.data.playing) {
      this.startFrame(fi);
    } else {
      const frame = scene.frames[fi];
      this.setData({
        frameIndex: fi,
        currentFrame: frame,
        subtitle: frame.narration || scene.narration || ''
      });
    }
  },

  // quiz 选项作答
  onPickOption(e) {
    if (this.data.quizPicked) return;
    this.setData({ quizPicked: e.currentTarget.dataset.key });
  },

  onShareAppMessage() {
    return { title: 'Bio - AI课堂', path: '/pages/aiHub/aiHub' };
  },

  onShareTimeline() {
    return { title: 'Bio - AI课堂' };
  }
});
