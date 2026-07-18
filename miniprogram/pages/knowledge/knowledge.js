// pages/knowledge/knowledge.js
const app = getApp();

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
      // 兜底默认课程，与 map 页面保持一致；避免从首页"知识图解"入口进入时因缺 courseId 直接显示加载失败
      courseId: (options && options.courseId) || 'course_required_1',
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
          const bookmarks = wx.getStorageSync('bookmarkedKPs') || [];
          const isBookmarked = bookmarks.indexOf(this.data.courseId) > -1;
          this.setData({ course, knowledgePoints, bookmarked: isBookmarked, loading: false }, () => {
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
    const id = this.data.courseId;
    let bookmarks = wx.getStorageSync('bookmarkedKPs') || [];
    const index = bookmarks.indexOf(id);
    if (index > -1) {
      bookmarks.splice(index, 1);
      this.setData({ bookmarked: false });
      wx.showToast({ title: '已取消收藏', icon: 'none' });
    } else {
      bookmarks.push(id);
      this.setData({ bookmarked: true });
      wx.showToast({ title: '已收藏', icon: 'none' });
    }
    wx.setStorageSync('bookmarkedKPs', bookmarks);
  },

  addToCards() {
    // 登录拦截：闪卡为用户数据，未登录提示并跳转登录页
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录后再添加闪卡', icon: 'none' });
      setTimeout(() => {
        wx.navigateTo({ url: '/pages/login/login' });
      }, 1000);
      return;
    }
    const kp = this.data.knowledgePoints[0];
    const kpTitle = kp ? kp.title : (this.data.course ? this.data.course.title : '');
    const kpContent = kp ? kp.desc : '';
    if (!kpTitle) {
      wx.showToast({ title: '暂无可添加的知识点', icon: 'none' });
      return;
    }
    wx.cloud.callFunction({
      name: 'flashcards',
      data: {
        action: 'add',
        title: kpTitle,
        content: kpContent,
        chapter: ''
      },
      success: (res) => {
        if (res.result && res.result.code === 0) {
          wx.showToast({ title: '已添加到闪卡', icon: 'none' });
        } else {
          wx.showToast({ title: (res.result && res.result.msg) || '添加失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.showToast({ title: '网络异常', icon: 'none' });
      }
    });
  },

  askAI() {
    const kp = this.data.knowledgePoints[0];
    const kpTitle = kp ? kp.title : (this.data.course ? this.data.course.title : '');
    wx.navigateTo({ url: '/pages/ai/ai?question=' + encodeURIComponent(kpTitle) });
  }
});
