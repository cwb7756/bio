// pages/map/map.js
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
    currentLessonTitle: '',
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
            currentLessonTitle: d.currentLessonTitle,
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

  // 点击节点
  tapNode(e) {
    const node = e.currentTarget.dataset.node;
    if (node.status === 'locked' || node.status === 'lock') {
      wx.showToast({ title: '先完成前面的关卡吧', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/course/course?courseId=' + node.courseId });
  },

  // 开始当前关卡 → 跳课程页
  startCurrent() {
    const node = this.data.nodes.find((n) => n.status === 'current');
    if (node) {
      wx.navigateTo({ url: '/pages/course/course?courseId=' + node.courseId });
    } else {
      wx.showToast({ title: '暂无进行中的关卡', icon: 'none' });
    }
  }
});
