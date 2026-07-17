// pages/knowledge/knowledge.js
Page({
  data: {
    statusBarHeight: 20,
    courseId: '',
    kpId: '',
    course: null,
    knowledgePoints: [],
    bookmarked: false,
    loading: true,
    loadError: false
  },

  onLoad(options) {
    const sys = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: sys.statusBarHeight,
      courseId: (options && options.courseId) || '',
      kpId: (options && options.kpId) || ''
    });
    this.loadDetail();
  },

  loadDetail() {
    if (!this.data.courseId) {
      this.setData({ loading: false, loadError: true });
      return;
    }
    this.setData({ loading: true, loadError: false });
    wx.cloud.callFunction({
      name: 'getCourseDetail',
      data: { courseId: this.data.courseId },
      success: (res) => {
        if (res.result && res.result.code === 0) {
          const { course, knowledgePoints } = res.result.data;
          this.setData({ course, knowledgePoints, loading: false }, () => {
            this.scrollToKp();
          });
        } else {
          this.setData({ loading: false, loadError: true });
        }
      },
      fail: (err) => {
        console.error('getCourseDetail error:', err);
        this.setData({ loading: false, loadError: true });
      }
    });
  },

  // kpId 锚点定位
  scrollToKp() {
    if (!this.data.kpId) return;
    setTimeout(() => {
      wx.pageScrollTo({
        selector: '#kp-' + this.data.kpId,
        duration: 300,
        fail: () => {}
      });
    }, 100);
  },

  // 去看课程
  goCourse() {
    wx.navigateTo({
      url: '/pages/course/course?courseId=' + this.data.courseId
    });
  },

  goBack() {
    wx.navigateBack();
  },

  toggleBookmark() {
    this.setData({ bookmarked: !this.data.bookmarked });
    wx.showToast({
      title: this.data.bookmarked ? '已收藏' : '已取消收藏',
      icon: 'none'
    });
  },

  addToCards() {
    wx.showToast({ title: '已加入速记卡', icon: 'none' });
  },

  askAI() {
    wx.showToast({ title: 'AI老师讲解中...', icon: 'none' });
  }
});
