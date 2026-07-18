// pages/map/map.js
const app = getApp();

Page({
  data: {
    statusBarHeight: 20,
    loading: true,
    isDemo: false,
    course: null,
    nodes: [],
    doneCount: 0,
    totalCount: 0,
    overallPercent: 0,
    // 进度环
    ringDash: 0
  },

  onLoad(options) {
    const sys = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: sys.statusBarHeight,
      courseId: options.courseId || 'course_required_1'
    });
  },

  onShow() {
    // 登录拦截：知识地图展示用户学习进度，未登录则提示并跳转登录页
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录后查看知识地图', icon: 'none' });
      setTimeout(() => {
        wx.navigateTo({ url: '/pages/login/login' });
      }, 1000);
      return;
    }
    this.loadMap();
  },

  // 调用 knowledgeMap 云函数获取地图数据
  loadMap() {
    this.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'knowledgeMap',
      data: {
        courseId: this.data.courseId
      },
      success: (res) => {
        if (res.result && res.result.code === 0) {
          const d = res.result.data;
          // 进度环：半径 26，周长 ≈ 163.4
          const ringDash = 163.4 * (1 - d.overallPercent / 100);
          this.setData({
            course: d.course,
            nodes: d.nodes,
            doneCount: d.doneCount,
            totalCount: d.totalCount,
            overallPercent: d.overallPercent,
            isDemo: d.isDemo,
            ringDash,
            loading: false
          });
        } else {
          this.setData({ loading: false });
          wx.showToast({ title: (res.result && res.result.msg) || '加载失败', icon: 'none' });
        }
      },
      fail: (err) => {
        console.error('knowledgeMap error:', err);
        this.setData({ loading: false });
        wx.showToast({ title: '网络异常', icon: 'none' });
      }
    });
  },

  goBack() {
    wx.navigateBack();
  },

  // 点击节点：无解锁限制，任何节点均可跳转课程页
  tapNode(e) {
    const node = e.currentTarget.dataset.node;
    wx.navigateTo({ url: '/pages/course/course?courseId=' + node.courseId });
  }
});
