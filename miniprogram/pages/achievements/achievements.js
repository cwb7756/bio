// pages/achievements/achievements.js
Page({
  data: {
    statusBarHeight: 20,
    loading: true,
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
    this.loadAchievements();
  },

  // 调用 achievements 云函数获取成就列表
  loadAchievements() {
    this.setData({ loading: true });
    const info = wx.getStorageSync('userInfo') || {};
    wx.cloud.callFunction({
      name: 'achievements',
      data: { userID: info.userID || '' },
      success: (res) => {
        if (res.result && res.result.code === 0) {
          const d = res.result.data;
          this.setData({
            achievements: d.achievements,
            unlockedCount: d.unlockedCount,
            totalCount: d.totalCount,
            isDemo: d.isDemo,
            loading: false
          });
        } else {
          this.setData({ loading: false });
          wx.showToast({ title: '加载失败', icon: 'none' });
        }
      },
      fail: (err) => {
        console.error('achievements error:', err);
        this.setData({ loading: false });
        wx.showToast({ title: '网络异常', icon: 'none' });
      }
    });
  },

  goBack() {
    wx.navigateBack();
  }
});
