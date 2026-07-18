// pages/mistakes/mistakes.js
const app = getApp();

Page({
  data: {
    statusBarHeight: 20,
    loading: false,
    mistakes: [],
    isDemo: false,
    expanded: {},
    skip: 0,
    limit: 20,
    total: 0
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

  // 调用 mistakes 云函数获取错题列表
  loadMistakes(append, done) {
    this.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'mistakes',
      data: { action: 'list', skip: this.data.skip, limit: this.data.limit },
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

  onShareAppMessage() {
    return { title: 'Bio - 高中生物学习助手', path: '/pages/home/home' };
  },

  onShareTimeline() {
    return { title: 'Bio - 高中生物学习助手' };
  }
});
