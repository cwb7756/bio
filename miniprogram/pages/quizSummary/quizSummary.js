// pages/quizSummary/quizSummary.js
const app = getApp();
const sound = require('../../utils/sound.js');

Page({
  data: {
    statusBarHeight: 20,
    summary: null,
    accuracyText: '0%',
    durationText: '0秒',
    encourage: '',
    encourageSub: '',
    catImage: '/images/cat-happy.png',
    wrongList: [], // 错题 + 跳过，用于一键收藏
    savingMistakes: false
  },

  onLoad() {
    const sys = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: sys.statusBarHeight });

    // 登录拦截：总结页可一键收藏错题（用户数据），未登录则提示并跳转登录页
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => {
        wx.navigateTo({ url: '/pages/login/login' });
      }, 1000);
      return;
    }

    const s = app.globalData.quizSummary;
    if (!s || !s.details || s.details.length === 0) {
      wx.showToast({ title: '总结数据缺失', icon: 'none' });
      setTimeout(() => wx.redirectTo({ url: '/pages/quizEntry/quizEntry' }), 800);
      return;
    }

    // 完成刷题：播放结算音效
    sound.play('complete');

    // 预处理每题展示数据：选项标注 + 展开态
    const details = s.details.map((d) => ({
      questionId: d.questionId,
      type: (d.type || '选择题') + ' · ' + (d.topic || ''),
      chapter: d.chapter || '',
      stem: d.stem,
      options: (d.options || []).map((o) => ({
        key: o.key,
        text: o.text,
        isCorrect: o.key === d.answer,
        isUserPick: !!d.userAnswer && d.userAnswer === o.key,
        isUserWrong: !!d.userAnswer && d.userAnswer === o.key && o.key !== d.answer
      })),
      answer: d.answer,
      userAnswer: d.userAnswer || '',
      correct: !!d.correct,
      skipped: !!d.skipped,
      explanation: d.explanation || '',
      expanded: false
    }));

    const wrongList = details.filter((d) => !d.correct);
    const encourage = this.buildEncourage(s.accuracy, s.correct, s.total);

    this.setData({
      summary: Object.assign({}, s, { details }),
      accuracyText: (s.accuracy || 0) + '%',
      durationText: this.formatDuration(s.duration || 0),
      encourage: encourage.title,
      encourageSub: encourage.sub,
      catImage: (s.accuracy || 0) >= 70 ? '/images/cat-happy.png' : '/images/cat-sad.png',
      wrongList
    });

    // 清理全局暂存，避免下次进入残留
    app.globalData.quizSummary = null;
  },

  // 根据正确率生成鼓励语
  buildEncourage(accuracy, correct, total) {
    if (total <= 0) return { title: '继续加油', sub: '完成练习后查看你的表现' };
    if (accuracy >= 90) return { title: '太棒了！', sub: '你已熟练掌握这部分知识' };
    if (accuracy >= 70) return { title: '不错哦！', sub: '再练几道就能完全掌握啦' };
    if (accuracy >= 50) return { title: '加油！', sub: '错题记得回顾，下次更稳' };
    return { title: '别灰心', sub: '把错题搞懂，就是最大的进步' };
  },

  // 秒数 → 可读时长
  formatDuration(sec) {
    sec = Math.round(sec || 0);
    if (sec < 60) return sec + '秒';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s === 0 ? m + '分钟' : m + '分' + s + '秒';
  },

  // 展开/收起解析
  toggleExplain(e) {
    const idx = e.currentTarget.dataset.index;
    const key = 'summary.details[' + idx + '].expanded';
    this.setData({ [key]: !this.data.summary.details[idx].expanded });
  },

  // 一键收藏错题（错题 + 跳过的题）
  saveAllMistakes() {
    if (this.data.savingMistakes) return;
    const list = this.data.wrongList;
    if (list.length === 0) {
      wx.showToast({ title: '本次没有错题，很棒！', icon: 'none' });
      return;
    }
    this.setData({ savingMistakes: true });
    wx.showLoading({ title: '收藏中...', mask: true });
    const tasks = list.map((d) => {
      const correctOpt = d.options.find((o) => o.isCorrect);
      return new Promise((resolve) => {
        wx.cloud.callFunction({
          name: 'mistakes',
          data: {
            action: 'add',
            questionId: d.questionId,
            chapter: d.chapter,
            topic: '',
            stem: d.stem,
            options: d.options.map((o) => ({ key: o.key, text: o.text })),
            answer: correctOpt ? correctOpt.key : '',
            userAnswer: d.userAnswer,
            explanation: d.explanation
          },
          success: (res) => resolve(res.result && res.result.code === 0),
          fail: () => resolve(false)
        });
      });
    });

    Promise.all(tasks).then((results) => {
      wx.hideLoading();
      this.setData({ savingMistakes: false });
      const ok = results.filter(Boolean).length;
      wx.showToast({
        title: ok + '/' + list.length + ' 道已收藏',
        icon: 'none'
      });
    });
  },

  // 再来一组：回到刷题前置页重新选择分类
  retry() {
    wx.redirectTo({ url: '/pages/quizEntry/quizEntry' });
  },

  // 返回首页
  goHome() {
    wx.switchTab({ url: '/pages/home/home' });
  },

  // 去错题本
  goMistakes() {
    wx.redirectTo({ url: '/pages/mistakes/mistakes' });
  }
});
