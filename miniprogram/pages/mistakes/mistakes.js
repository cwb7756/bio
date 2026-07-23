// pages/mistakes/mistakes.js
const app = getApp();
const { addToNotebook } = require('../../utils/notebook.js');

Page({
  data: {
    statusBarHeight: 20,
    loading: false,
    mistakes: [],
    isDemo: false,
    expanded: {},
    skip: 0,
    limit: 20,
    total: 0,
    searchValue: ''
  },

  onLoad() {
    const sys = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: sys.statusBarHeight });
  },

  onShow() {
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    this.setData({ skip: 0, mistakes: [], expanded: {} });
    this.loadMistakes(false);
  },

  // 调用 mistakes 云函数获取错题列表（带关键词时服务端按题干/章节/考点过滤）
  loadMistakes(append, done) {
    this.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'mistakes',
      data: {
        action: 'list',
        skip: this.data.skip,
        limit: this.data.limit,
        keyword: (this.data.searchValue || '').trim()
      },
      success: (res) => {
        if (res.result && res.result.code === 0) {
          var list = res.result.list || (res.result.data && res.result.data.mistakes) || [];
          var total = res.result.total !== undefined ? res.result.total : list.length;
          var isDemo = res.result.isDemo !== undefined ? res.result.isDemo : (res.result.data && res.result.data.isDemo) || false;
          this.setData({
            mistakes: append ? this.data.mistakes.concat(list) : list,
            total: total,
            isDemo: isDemo,
            loading: false
          });
        } else {
          this.setData({ loading: false });
          wx.showToast({ title: '加载失败', icon: 'none' });
        }
        if (done) done();
      },
      fail: (err) => {
        console.error('mistakes error:', err);
        this.setData({ loading: false });
        wx.showToast({ title: '网络异常', icon: 'none' });
        if (done) done();
      }
    });
  },

  onPullDownRefresh() {
    this.setData({ skip: 0, mistakes: [], expanded: {} });
    this.loadMistakes(false, () => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    if (this.data.loading) return;
    if (this.data.mistakes.length < this.data.total) {
      this.setData({ skip: this.data.skip + this.data.limit });
      this.loadMistakes(true);
    }
  },

  // 搜索输入与确认
  onSearchInput(e) {
    this.setData({ searchValue: e.detail.value });
  },

  onSearchConfirm() {
    this.setData({ skip: 0, mistakes: [], expanded: {} });
    this.loadMistakes(false);
  },

  // 清空搜索并恢复全量列表
  clearSearch() {
    if (!this.data.searchValue) return;
    this.setData({ searchValue: '', skip: 0, mistakes: [], expanded: {} });
    this.loadMistakes(false);
  },

  goBack() {
    wx.navigateBack();
  },

  // 展开/收起解析
  toggleExplain(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ ['expanded.' + id]: !this.data.expanded[id] });
  },

  // 删除错题
  removeMistake(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '提示',
      content: '确定从错题本移除这道题吗？',
      success: (r) => {
        if (!r.confirm) return;
        wx.cloud.callFunction({
          name: 'mistakes',
          data: { action: 'remove', mistakeId: id },
          success: (res) => {
            if (res.result && res.result.code === 0) {
              wx.showToast({ title: '已移除', icon: 'none' });
              this.setData({ skip: 0 });
              this.loadMistakes(false);
            } else {
              wx.showToast({ title: (res.result && res.result.msg) || '移除失败', icon: 'none' });
            }
          },
          fail: () => wx.showToast({ title: '网络异常', icon: 'none' })
        });
      }
    });
  },

  // 去刷题
  goQuiz() {
    wx.navigateTo({ url: '/pages/quizEntry/quizEntry' });
  },

  // 收录到笔记本
  addToNotebook(e) {
    var id = e.currentTarget.dataset.id;
    var note = null;
    for (var i = 0; i < this.data.mistakes.length; i++) {
      if (this.data.mistakes[i]._id === id) {
        note = this.data.mistakes[i];
        break;
      }
    }
    if (!note) return;
    var content = note.stem;
    if (note.answer) content += '\n正确答案：' + note.answer;
    if (note.userAnswer) content += '\n我的作答：' + note.userAnswer;
    if (note.explanation) content += '\n解析：' + note.explanation;
    addToNotebook({
      type: 'mistake',
      source: 'mistakes',
      refId: note.questionId || note._id,
      title: note.topic ? (note.chapter + '·' + note.topic) : '错题收录',
      content: content,
      meta: { chapter: note.chapter, topic: note.topic }
    });
  },

  onShareAppMessage() {
    return { title: 'Bio - 高中生物学习助手', path: '/pages/home/home' };
  },

  onShareTimeline() {
    return { title: 'Bio - 高中生物学习助手' };
  }
});
