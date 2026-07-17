// pages/report/report.js
Page({
  data: {
    statusBarHeight: 20,
    loading: true,
    isDemo: false,
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
    this.loadReport();
  },

  // 调用 report 云函数获取学习报告
  loadReport() {
    this.setData({ loading: true });
    const info = wx.getStorageSync('userInfo') || {};
    wx.cloud.callFunction({
      name: 'report',
      data: { userID: info.userID || '' },
      success: (res) => {
        if (res.result && res.result.code === 0) {
          const d = res.result.data;
          const weekMax = Math.max(1, ...d.week.map((w) => w.count));
          this.setData({
            loading: false,
            isDemo: d.isDemo,
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
      },
      fail: (err) => {
        console.error('report error:', err);
        this.setData({ loading: false });
        wx.showToast({ title: '网络异常', icon: 'none' });
      }
    });
  },

  goBack() {
    wx.navigateBack();
  }
});
