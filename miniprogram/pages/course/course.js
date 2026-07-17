// pages/course/course.js
Page({
  data: {
    statusBarHeight: 20,
    courseId: '',
    course: null,
    videos: [],
    knowledgePoints: [],
    currentIndex: 0,
    currentVideo: null,
    currentCover: '',
    loading: true,
    loadError: false
  },

  onLoad(options) {
    const sys = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: sys.statusBarHeight,
      courseId: (options && options.courseId) || ''
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
          const { course, videos, knowledgePoints } = res.result.data;
          this.setData({
            course,
            videos,
            knowledgePoints,
            currentIndex: 0,
            currentVideo: videos[0] || null,
            currentCover: this.pickCover(course, videos, 0),
            loading: false
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

  // 当前视频封面，兜底课程封面
  pickCover(course, videos, index) {
    const v = videos[index];
    return (v && v.cover) || (course && course.image) || '';
  },

  switchVideo(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      currentIndex: index,
      currentVideo: this.data.videos[index],
      currentCover: this.pickCover(this.data.course, this.data.videos, index)
    });
  },

  // 点击播放：优先跳 B 站小程序，失败复制链接兜底
  playCurrent() {
    const v = this.data.currentVideo;
    if (!v) {
      wx.showToast({ title: '暂无视频', icon: 'none' });
      return;
    }
    if (!v.aid || !v.url) {
      wx.showToast({ title: '暂无视频源', icon: 'none' });
      return;
    }
    wx.navigateToMiniProgram({
      appId: 'wx7564fd5313d24844',
      path: 'pages/video/video?avid=' + v.aid,
      fail: () => {
        wx.setClipboardData({
          data: v.url,
          success: () => {
            wx.showToast({ title: '链接已复制，请前往B站观看', icon: 'none' });
          }
        });
      }
    });
  },

  // 全屏查看封面
  previewCover() {
    if (!this.data.currentCover) return;
    wx.previewImage({ current: this.data.currentCover, urls: [this.data.currentCover] });
  },

  // 跳考点页（可带 kpId 锚点）
  goKnowledge(e) {
    const kpId = e.currentTarget.dataset.kpid || '';
    let url = '/pages/knowledge/knowledge?courseId=' + this.data.courseId;
    if (kpId) url += '&kpId=' + kpId;
    wx.navigateTo({ url });
  },

  goBack() {
    wx.navigateBack();
  },

  // 分享给好友
  onShareAppMessage() {
    const course = this.data.course;
    return {
      title: course ? course.title || '高中生物课程' : '高中生物课程',
      path: '/pages/course/course?courseId=' + this.data.courseId
    };
  },

  // 分享到朋友圈
  onShareTimeline() {
    const course = this.data.course;
    return {
      title: course ? course.title || '高中生物课程' : '高中生物课程'
    };
  }
});
