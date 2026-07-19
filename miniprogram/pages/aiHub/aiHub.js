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

  // 进入 AI 课堂（课件生成 + TTS 讲解）
  goClassroom() {
    wx.navigateTo({ url: '/pages/aiClassroom/aiClassroom' });
  },

  onShareAppMessage() {
    return { title: 'Bio - 高中生物学习助手', path: '/pages/home/home' };
  },

  onShareTimeline() {
    return { title: 'Bio - 高中生物学习助手' };
  }
});
