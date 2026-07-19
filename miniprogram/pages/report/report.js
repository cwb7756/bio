// pages/report/report.js
const app = getApp();

Page({
  data: {
    statusBarHeight: 20,
    loading: true,
    hasData: false,
    stats: [],
    week: [],
    weekMax: 1,
    chapters: []
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
    this.loadReport();
  },

  // 调用 report 云函数获取学习报告
  loadReport(done) {
    this.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'report',
      data: {},
      success: (res) => {
        if (res.result && res.result.code === 0) {
          const d = res.result.data;
          const weekMax = Math.max(1, ...d.week.map((w) => w.count));
          this.setData({
            loading: false,
            hasData: !!d.hasData,
            stats: [
              { num: String(d.streakDays), label: '连续打卡', unit: '天', icon: 'ic-fire' },
              { num: String(d.quizTotal), label: '刷题总数', unit: '题', icon: 'ic-pen' },
              { num: String(d.quizRate), label: '答题正确率', unit: '%', icon: 'ic-target' },
              { num: String(d.studyHours), label: '学习时长', unit: 'h', icon: 'ic-history' }
            ],
            week: d.week,
            weekMax,
            chapters: d.chapters
          });
        } else {
          this.setData({ loading: false });
          wx.showToast({ title: '加载失败', icon: 'none' });
        }
        if (done) done();
      },
      fail: (err) => {
        console.error('report error:', err);
        this.setData({ loading: false });
        wx.showToast({ title: '网络异常', icon: 'none' });
        if (done) done();
      }
    });
  },

  onPullDownRefresh() {
    this.loadReport(() => {
      wx.stopPullDownRefresh();
    });
  },

  goBack() {
    wx.navigateBack();
  },

  // 空状态引导：跳转学习 tab
  goStudy() {
    wx.switchTab({ url: '/pages/study/study' });
  },

  onShareAppMessage() {
    return { title: 'Bio - 高中生物学习助手', path: '/pages/home/home' };
  },

  onShareTimeline() {
    return { title: 'Bio - 高中生物学习助手' };
  }
});
