// pages/aiHub/aiHub.js
Page({
  data: {
    statusBarHeight: 20
  },

  onLoad() {
    const sys = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: sys.statusBarHeight });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
  },

  // 进入 AI 老师答疑页
  goTeacher() {
    wx.navigateTo({ url: '/pages/ai/ai' });
  },

  // AI 课堂后期开发，先占位提示
  goClassroom() {
    wx.showToast({ title: 'AI课堂敬请期待', icon: 'none' });
  },

  onShareAppMessage() {
    return { title: 'Bio - 高中生物学习助手', path: '/pages/home/home' };
  },

  onShareTimeline() {
    return { title: 'Bio - 高中生物学习助手' };
  }
});
