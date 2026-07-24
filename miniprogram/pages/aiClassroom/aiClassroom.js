// pages/aiClassroom/aiClassroom.js
// AI课堂：输入问题 → 大纲确认 → 分阶段生成课件 → TTS 配音播放
const app = getApp();
const cw = require('../../utils/courseware.js');
const sound = require('../../utils/sound.js');
const genJob = require('../../utils/courseGenJob.js');

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
    genStage: '',            // 生成阶段提示（如「正在绘制插图…」）
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
    isLastScene: false,
    // 课程完成反馈
    showComplete: false,
    quizRight: 0,
    quizTotal: 0,
    // 相关 B 站课程视频（末页推荐）
    relatedVideos: []
  },

  onLoad(options) {
    const sys = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: sys.statusBarHeight });

    // 运行时缓存（不参与渲染）
    this._ttsCache = {};         // key -> Promise<clips[]>
    this._audio = null;          // InnerAudioContext 单例
    this._fs = wx.getFileSystemManager();
    this._audioFiles = [];       // 待清理临时文件
    this._fileCounter = 0;
    this._playToken = null;      // 播放令牌，翻页/退出时使旧回调失效
    this._silentTimer = null;
    this._silentToastShown = false;
    this._sceneStarted = false;  // 当前场景音频是否已开始（暂停中恢复用）
    this._clipEndedCb = null;    // 当前音频片段结束回调指针
    this._clipErrorCb = null;    // 当前音频片段错误回调指针
    this._ttsConfigToastShown = false;

    // 订阅全局生成任务（页面销毁后任务仍在后台运行，回来时恢复）
    this._jobListener = this.onJobUpdate.bind(this);
    genJob.subscribe(this._jobListener);

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

    // 恢复后台生成任务：进行中恢复进度显示；已完成直接进入播放
    const js = genJob.getState();
    if (js.running) {
      this.setData({
        phase: 'generating',
        genCurrent: js.genCurrent,
        genTotal: js.genTotal,
        genDoneList: js.genDoneList,
        genProgress: js.genProgress,
        genStage: js.genStage
      });
    } else if (js.done) {
      const res = genJob.consumeResult();
      if (res) this.enterPlay(res.scenesRaw, res.title, res.question);
    }
  },

  onShow() {
    // 从登录页返回后刷新历史
    if (app.globalData.isLoggedIn && this.data.phase === 'input') {
      this.loadHistory();
    }
    // 后台生成任务完成：回到页面消费结果直接播放
    const res = genJob.consumeResult();
    if (res) {
      this.enterPlay(res.scenesRaw, res.title, res.question);
      return;
    }
    // 后台生成仍在进行：恢复进度显示
    const js = genJob.getState();
    if (js.running && this.data.phase !== 'generating') {
      this.setData({
        phase: 'generating',
        genCurrent: js.genCurrent,
        genTotal: js.genTotal,
        genDoneList: js.genDoneList,
        genProgress: js.genProgress,
        genStage: js.genStage
      });
    }
  },

  onUnload() {
    genJob.unsubscribe(this._jobListener);
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
    // 生成中返回不中断：任务在后台继续，重进页面可恢复进度
    if (getCurrentPages().length > 1) {
      wx.navigateBack();
    } else {
      wx.switchTab({ url: '/pages/home/home' });
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
    if (genJob.getState().running) {
      wx.showToast({ title: '上一份课件正在生成中', icon: 'none' });
      return;
    }

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

  // 确认大纲 → 交给全局任务逐场景生成（页面退出后任务继续）
  onConfirmOutline() {
    const sections = this.data.sections;
    if (!sections.length || !this.checkAiReady()) return;
    const question = this.data.inputValue.trim();
    const title = this.data.outlineTitle || '生物小课堂';

    const ok = genJob.start(question, title, sections);
    if (!ok) {
      wx.showToast({ title: '上一份课件正在生成中', icon: 'none' });
      return;
    }
    this.setData({
      phase: 'generating',
      genCurrent: 1,
      genTotal: sections.length,
      genDoneList: [],
      genProgress: '0%',
      genStage: ''
    });
  },

  // 全局生成任务状态同步：进度刷新；完成/失败时页面在前台则立即处理
  onJobUpdate(s) {
    if (this.data.phase === 'generating') {
      this.setData({
        genCurrent: s.genCurrent,
        genTotal: s.genTotal,
        genDoneList: s.genDoneList,
        genProgress: s.genProgress,
        genStage: s.genStage
      });
    }
    const pages = getCurrentPages();
    const isTop = pages.length && pages[pages.length - 1].route === 'pages/aiClassroom/aiClassroom';
    if (!isTop) return;
    if (s.done) {
      const res = genJob.consumeResult();
      if (res) this.enterPlay(res.scenesRaw, res.title, res.question);
    } else if (s.failed) {
      genJob.clearFailed();
      wx.showToast({ title: '课件生成失败，请重试', icon: 'none' });
      this.setData({ phase: 'input' });
    }
  },

  // 先播放已完成部分（生成中途取走部分结果，任务标记中断）
  onPlayPartial() {
    const res = genJob.consumePartial();
    if (!res) return;
    this.enterPlay(res.scenesRaw, res.title, res.question);
  },

  // 取消生成：中断全局任务
  onAbortGenerate() {
    genJob.abort();
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
      this.enterPlay(c.scenes, c.title, c.question);
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

  // 场景预处理：校验生图 fileID；quiz 选项结构化；失败的图形场景降级
  prepareScene(raw) {
    const s = Object.assign({}, raw);
    if (s.type === 'diagram') {
      if (!s.imageFileId) {
        return {
          type: 'concept',
          title: s.title,
          narration: s.narration,
          blocks: [{ kind: 'paragraph', text: s.caption || '插图生成失败，请结合讲稿理解。' }]
        };
      }
      return s;
    }
    if (s.type === 'sim') {
      const frames = (s.frames || []).filter(function (f) { return !!f.imageFileId; });
      if (frames.length < 2) {
        return {
          type: 'concept',
          title: s.title,
          narration: s.narration,
          blocks: [{ kind: 'paragraph', text: '动画生成失败，请结合讲稿理解本过程。' }]
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
  enterPlay(scenesRaw, title, question) {
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
      quizRight: 0,
      quizTotal: 0,
      showComplete: false,
      playing: true,
      showSubtitle: true,
      isLastScene: scenes.length <= 1,
      relatedVideos: []
    });
    this.enterScene(0);
    this.fetchRelatedVideos(question || this.data.inputValue.trim(), title);
  },

  // 匹配数据库中的相关 B 站课程视频（best-effort，末页展示）
  fetchRelatedVideos(question, title) {
    const keyword = ((question || '') + (title || '')).trim();
    if (!keyword) return;
    const self = this;
    wx.cloud.callFunction({
      name: 'aiCourseware',
      data: { action: 'matchVideos', keyword: keyword }
    }).then(function (res) {
      if (res.result && res.result.code === 0 && res.result.videos && res.result.videos.length) {
        self.setData({ relatedVideos: res.result.videos });
      }
    }).catch(function (err) {
      console.error('matchVideos error:', err);
    });
  },

  // 点击相关课程视频：跳转 B 站小程序播放（复用 course 页跳转参数）
  onPlayBiliVideo(e) {
    const aid = e.currentTarget.dataset.aid;
    if (!aid) return;
    wx.navigateToMiniProgram({
      appId: 'wx7564fd5313d24844',
      path: 'pages/video/video?avid=' + aid,
      fail: function (err) {
        // 用户取消跳转不提示
        if (err && err.errMsg && err.errMsg.indexOf('cancel') !== -1) return;
        wx.showToast({ title: '跳转失败，请稍后再试', icon: 'none' });
      }
    });
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

  // 获取 TTS clips（带缓存）；失败 resolve([]) 走静音降级；503 明确提示未配置
  getClips(key, text) {
    if (this._ttsCache[key]) return this._ttsCache[key];
    const clean = cw.cleanTtsText(text);
    if (!clean) return Promise.resolve([]);
    const self = this;
    const p = wx.cloud.callFunction({
      name: 'aiCourseware',
      data: { action: 'tts', text: clean }
    }).then(function (res) {
      if (res.result && res.result.code === 0 && res.result.clips && res.result.clips.length) {
        return res.result.clips;
      }
      if (res.result && (res.result.code === 503 || res.result.code === 402) && !self._ttsConfigToastShown) {
        self._ttsConfigToastShown = true;
        const tip = res.result.code === 503 ? '语音服务未配置，已切换字幕模式' : '语音额度已用完，已切换字幕模式';
        wx.showToast({ title: tip, icon: 'none', duration: 2500 });
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
      const self = this;
      this._audio = wx.createInnerAudioContext();
      // 事件监听仅绑定一次，经回调指针派发，避免重复注册导致回调累积
      this._audio.onEnded(function () {
        const cb = self._clipEndedCb;
        if (cb) cb();
      });
      this._audio.onError(function (err) {
        const cb = self._clipErrorCb;
        if (cb) cb(err);
      });
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

  // 顺序连播 clips（通过回调指针派发，监听器不重复注册）
  playClipsSequentially(clips, idx, onDone) {
    const self = this;
    const token = this._playToken;
    if (this._playToken !== token) return;
    if (idx >= clips.length) {
      this._clipEndedCb = null;
      this._clipErrorCb = null;
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
    this._clipEndedCb = function () {
      if (self._playToken !== token) return;
      self.playClipsSequentially(clips, idx + 1, onDone);
    };
    this._clipErrorCb = function (res) {
      console.error('audio play error:', res);
      if (self._playToken !== token) return;
      // 跳过损坏片段继续
      self.playClipsSequentially(clips, idx + 1, onDone);
    };
    audio.src = path;
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
      this.showCompletion();
    }
  },

  // 课程完成反馈：弹层 + 完成音效
  showCompletion() {
    this.setData({ playing: false, showComplete: true });
    sound.play('complete');
  },

  // 末页「完成课程」按钮：手动触发完成反馈
  onFinishCourse() {
    if (this.data.showComplete) return;
    this.stopPlayback();
    this.showCompletion();
  },

  // 完成弹层：再学一遍
  onRestartCourse() {
    this.setData({ showComplete: false, playing: true });
    this.enterScene(0);
  },

  // 完成弹层：返回输入页
  onCompleteExit() {
    this.setData({ showComplete: false });
    this.onExitPlay();
  },

  // 停止播放（翻页/退出前调用）：停音频、清定时器、吊销令牌
  stopPlayback() {
    this._playToken = null;
    this._pendingPlay = null;
    this._silentPending = null;
    this._clipEndedCb = null;
    this._clipErrorCb = null;
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

  // quiz 选项作答（累计小测成绩，供课程完成反馈展示）
  onPickOption(e) {
    if (this.data.quizPicked) return;
    const key = e.currentTarget.dataset.key;
    const scene = this.data.currentScene;
    const updates = { quizPicked: key };
    if (scene && scene.type === 'quiz') {
      updates.quizTotal = this.data.quizTotal + 1;
      if (key === scene.answer) {
        updates.quizRight = this.data.quizRight + 1;
      }
    }
    this.setData(updates);
  },

  onShareAppMessage() {
    return { title: 'Bio - AI课堂', path: '/pages/home/home' };
  },

  onShareTimeline() {
    return { title: 'Bio - AI课堂' };
  }
});
