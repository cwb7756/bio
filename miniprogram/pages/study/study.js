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
    loading: true
  },

  onLoad() {
    const sys = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: sys.statusBarHeight });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    this.loadCourseList();
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
    const first = this.data.chapters[0];
    const courseId = first ? first._id : 'course_required_1';
    wx.navigateTo({ url: '/pages/map/map?courseId=' + courseId });
  }
});
