// pages/achievements/achievements.js
const app = getApp();

Page({
  data: {
    statusBarHeight: 20,
    loading: false,
    isDemo: false,
    achievements: [],
    unlockedCount: 0,
    totalCount: 0,
    skip: 0,
    limit: 50
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
    this.setData({ skip: 0, achievements: [] });
    this.loadAchievements(false);
  },

  // 调用 achievements 云函数获取成就列表
  loadAchievements(append, done) {
    this.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'achievements',
      data: { action: 'list', skip: this.data.skip, limit: this.data.limit },
      success: (res) => {
        if (res.result && res.result.code === 0) {
          var list = res.result.list || (res.result.data && res.result.data.achievements) || [];
          var total = res.result.total !== undefined ? res.result.total : (res.result.data && res.result.data.totalCount) || list.length;
          var isDemo = res.result.isDemo !== undefined ? res.result.isDemo : (res.result.data && res.result.data.isDemo) || false;
          var unlockedCount = res.result.unlockedCount !== undefined ? res.result.unlockedCount : (res.result.data && res.result.data.unlockedCount !== undefined ? res.result.data.unlockedCount : list.filter(function(a) { return a.unlocked; }).length);
          this.setData({
            achievements: append ? this.data.achievements.concat(list) : list,
            totalCount: total,
            unlockedCount: unlockedCount,
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
        console.error('achievements error:', err);
        this.setData({ loading: false });
        wx.showToast({ title: '网络异常', icon: 'none' });
        if (done) done();
      }
    });
  },

  onPullDownRefresh() {
    this.setData({ skip: 0, achievements: [] });
    this.loadAchievements(false, () => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    if (this.data.loading) return;
    if (this.data.achievements.length < this.data.totalCount) {
      this.setData({ skip: this.data.skip + this.data.limit });
      this.loadAchievements(true);
    }
  },

  goBack() {
    wx.navigateBack();
  },

  onShareAppMessage() {
    return { title: 'Bio - 高中生物学习助手', path: '/pages/home/home' };
  },

  onShareTimeline() {
    return { title: 'Bio - 高中生物学习助手' };
  }
});
