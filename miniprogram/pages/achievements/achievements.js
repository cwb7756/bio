// pages/achievements/achievements.js
const app = getApp();

Page({
  data: {
    statusBarHeight: 20,
    loading: false,
    isDemo: false,
    achievements: [],
    unlockedCount: 0,
    totalCount: 0
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
    this.loadAchievements();
  },

  // 调用 achievements 云函数刷新并获取成就列表
  loadAchievements(done) {
    this.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'achievements',
      data: { action: 'refresh' },
      success: (res) => {
        if (res.result && res.result.code === 0) {
          var list = res.result.list || [];
          var total = res.result.total !== undefined ? res.result.total : list.length;
          var isDemo = res.result.isDemo !== undefined ? res.result.isDemo : false;
          var unlockedCount = res.result.unlockedCount !== undefined ? res.result.unlockedCount : list.filter(function(a) { return a.unlocked; }).length;
          var newlyUnlocked = res.result.newlyUnlocked || [];

          this.setData({
            achievements: list,
            totalCount: total,
            unlockedCount: unlockedCount,
            isDemo: isDemo,
            loading: false
          });

          // 新解锁成就提示
          if (newlyUnlocked.length > 0) {
            var names = newlyUnlocked.map(function(a) { return a.name; }).join('、');
            wx.showToast({
              title: '解锁成就：' + names,
              icon: 'none',
              duration: 3000
            });
          }
        } else {
          this.setData({ loading: false });
          wx.showToast({ title: res.result.msg || '加载失败', icon: 'none' });
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
    this.loadAchievements(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    // refresh 已返回全部成就，无需分页加载
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
