// pages/study/study.js
const app = getApp();
import cache from '../../utils/cache';

// 课程列表缓存有效期：1 分钟
const COURSE_LIST_CACHE_TTL = 60 * 1000;
const { addToNotebook } = require('../../utils/notebook.js');

Page({
  data: {
    statusBarHeight: 20,
    chapters: [],
    overview: {
      completedLessons: 0,
      totalLessons: 0,
      completionRate: 0
    },
    loading: true,
    needLogin: false,
    // 学习概览卡片猫咪装饰图（每次进入随机一张趴姿猫）
    catImage: ''
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
    // 每次进入随机一张趴姿猫咪（cat-lying-1~5）
    const catIdx = Math.floor(Math.random() * 5) + 1;
    this.setData({ catImage: '/images/cat-lying-' + catIdx + '.png' });
    
    // 优先读取缓存
    const cachedCourseList = cache.get('courseList', { textbook: '全部' }, COURSE_LIST_CACHE_TTL);
    if (cachedCourseList) {
      console.log('study page: using cached course list');
      this.setData({ chapters: cachedCourseList.chapters, overview: cachedCourseList.overview, loading: false });
    } else {
      this.loadCourseList();
    }
  },

  // 去登录
  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  // 调用 getCourseList 云函数获取全部课程章节
  loadCourseList() {
    wx.cloud.callFunction({
      name: 'getCourseList',
      data: { textbook: '全部' },
      success: (res) => {
        if (res.result && res.result.code === 0) {
          const { chapters, overview } = res.result.data;
          
          // 写入缓存（1 分钟有效）
          cache.set('courseList', { chapters, overview }, { textbook: '全部' }, COURSE_LIST_CACHE_TTL);
          
          this.setData({
            chapters,
            overview,
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

  goChapter(e) {
    const idx = e.currentTarget.dataset.index;
    const ch = this.data.chapters[idx];
    wx.navigateTo({
      url: '/pages/course/course?courseId=' + ch._id
    });
  },

  // 收录章节到笔记本
  addChapterToNotebook(e) {
    var idx = e.currentTarget.dataset.index;
    var ch = this.data.chapters[idx];
    if (!ch) return;
    addToNotebook({
      type: 'course',
      source: 'study',
      refId: ch._id,
      title: ch.title,
      content: '已学' + ch.completed + '/' + ch.lessons + '课时，完成率' + ch.progress + '%',
      meta: { courseId: ch._id }
    });
  },

  // 3D 模型库（分包页面）
  go3DModels() {
    wx.navigateTo({ url: '/packages/3d-model/pages/gallery/gallery' });
  }
});
