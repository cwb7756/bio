// pages/study/study.js
const app = getApp();

Page({
  data: {
    statusBarHeight: 20,
    activeTab: 0,
    tabs: ['必修一', '必修二', '选择性必修'],
    chapters: [],
    overview: {
      completedLessons: 0,
      totalLessons: 0,
      completionRate: 0
    },
    // 知识地图入口概览（当前教材第一门课程，与 goMap 跳转一致）
    mapOverview: {
      loaded: false,
      doneCount: 0,
      totalCount: 0,
      overallPercent: 0
    },
    loading: true,
    needLogin: false
  },

  onLoad() {
    const sys = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: sys.statusBarHeight });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    // 消费 home 页传递的 pendingCourseId，跳转对应课程详情
    const pendingCourseId = app.globalData.pendingCourseId;
    if (pendingCourseId) {
      delete app.globalData.pendingCourseId;
      wx.navigateTo({ url: '/pages/course/course?courseId=' + pendingCourseId });
      return;
    }
    // 登录门控：学习进度为用户数据，未登录展示登录引导空状态
    if (!app.globalData.isLoggedIn) {
      this.setData({ needLogin: true, loading: false });
      return;
    }
    this.setData({ needLogin: false });
    this.loadCourseList();
  },

  // 去登录
  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  // 调用 getCourseList 云函数获取课程列表
  loadCourseList() {
    this.setData({ loading: true });
    const textbook = this.data.tabs[this.data.activeTab];

    wx.cloud.callFunction({
      name: 'getCourseList',
      data: { textbook },
      success: (res) => {
        if (res.result && res.result.code === 0) {
          this.setData({
            chapters: res.result.data.chapters,
            overview: res.result.data.overview,
            loading: false
          });
          // 加载知识地图入口概览
          this.loadMapOverview();
        } else {
          this.setData({ loading: false });
          wx.showToast({ title: '加载失败', icon: 'none' });
        }
      },
      fail: (err) => {
        console.error('getCourseList error:', err);
        this.setData({ loading: false });
        wx.showToast({ title: '网络异常', icon: 'none' });
      }
    });
  },

  // 加载知识地图入口概览（当前教材第一门课程，与 goMap 跳转一致）
  loadMapOverview() {
    if (!this.data.chapters || this.data.chapters.length === 0) {
      this.setData({ 'mapOverview.loaded': false });
      return;
    }
    const courseId = this.data.chapters[0]._id;
    wx.cloud.callFunction({
      name: 'knowledgeMap',
      data: { courseId },
      success: (res) => {
        if (res.result && res.result.code === 0) {
          const d = res.result.data;
          // isDemo 时 doneCount/overallPercent 为示例值，真实进度应为 0
          this.setData({
            mapOverview: {
              loaded: true,
              doneCount: d.isDemo ? 0 : d.doneCount,
              totalCount: d.totalCount,
              overallPercent: d.isDemo ? 0 : d.overallPercent
            }
          });
        }
      },
      fail: (err) => {
        console.error('knowledgeMap overview error:', err);
        // 静默降级，保持静态文案
      }
    });
  },

  switchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.index });
    this.loadCourseList();
  },

  goChapter(e) {
    const idx = e.currentTarget.dataset.index;
    const ch = this.data.chapters[idx];
    if (ch.color === 'lock') {
      wx.showToast({ title: '请先完成前置章节', icon: 'none' });
    } else {
      wx.navigateTo({
        url: '/pages/course/course?courseId=' + ch._id
      });
    }
  },

  // 知识地图：默认展示当前教材第一门课程
  goMap() {
    if (!this.data.chapters || this.data.chapters.length === 0) {
      wx.showToast({ title: '暂无课程', icon: 'none' });
      return;
    }
    const first = this.data.chapters[0];
    const courseId = first ? first._id : 'course_required_1';
    wx.navigateTo({ url: '/pages/map/map?courseId=' + courseId });
  }
});
