// pages/home/home.js
const app = getApp();

// tabBar 页面路径集合，跳转时需用 switchTab
const TAB_PAGES = ['/pages/ai/ai'];

Page({
  data: {
    statusBarHeight: 20,
    searchValue: '',
    catImage: '',
    userName: '同学',
    loading: true,
    continueLearning: null,
    features: [
      { icon: 'ic-microscope', name: '知识图解', bg: 'g', path: '/pages/knowledge/knowledge' },
      { icon: 'ic-pen', name: '刷题练习', bg: 'g2', path: '/pages/quiz/quiz' },
      { icon: 'ic-folder', name: '速记卡片', bg: 'g3', path: '' },
      { icon: 'ic-close', name: '错题本', bg: 'g4', path: '' },
      { icon: 'ic-video', name: 'B站课程', bg: 'g5', path: '' },
      { icon: 'ic-bot', name: 'AI老师', bg: 'g6', path: '/pages/ai/ai' }
    ],
    hotTopics: []
  },

  onLoad() {
    const sys = wx.getSystemInfoSync();
    const cats = [
      '/images/cat-lying-1.png',
      '/images/cat-lying-2.png',
      '/images/cat-lying-3.png',
      '/images/cat-lying-4.png',
      '/images/cat-lying-5.png'
    ];
    const catImage = cats[Math.floor(Math.random() * cats.length)];
    this.setData({ statusBarHeight: sys.statusBarHeight, catImage });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    // 先用本地缓存快速回显用户名
    const info = wx.getStorageSync('userInfo');
    if (info && info.nickname) {
      this.setData({ userName: info.nickname });
    }
    // 拉取最新云端数据
    this.loadHomeData();
  },

  // 调用 home 云函数获取首页数据
  loadHomeData() {
    this.setData({ loading: true });

    wx.cloud.callFunction({
      name: 'home',
      success: (res) => {
        if (res.result && res.result.code === 0) {
          const { user, continueLearning, hotTopics } = res.result.data;

          const updateData = {
            continueLearning,
            hotTopics,
            loading: false
          };

          if (user) {
            updateData.userName = user.nickname || '同学';
            // 同步更新本地缓存
            const cached = wx.getStorageSync('userInfo') || {};
            wx.setStorageSync('userInfo', { ...cached, ...user });
            app.globalData.userInfo = { ...cached, ...user };
          }

          this.setData(updateData);
        } else {
          this.setData({ loading: false });
        }
      },
      fail: (err) => {
        console.error('home cloud function error:', err);
        this.setData({ loading: false });
      }
    });
  },

  onSearchInput(e) {
    this.setData({ searchValue: e.detail.value });
  },

  onSearchConfirm() {
    if (this.data.searchValue) {
      wx.showToast({ title: '搜索: ' + this.data.searchValue, icon: 'none' });
    }
  },

  goFeature(e) {
    const path = e.currentTarget.dataset.path;
    if (!path) {
      wx.showToast({ title: '功能开发中...', icon: 'none' });
      return;
    }
    if (TAB_PAGES.includes(path)) {
      wx.switchTab({ url: path });
    } else {
      wx.navigateTo({ url: path });
    }
  },

  // 继续学习：study 是 tab 页，用 globalData 传递 courseId 后 switchTab
  continueStudy() {
    const cl = this.data.continueLearning;
    if (cl && cl.courseId) {
      app.globalData.pendingCourseId = cl.courseId;
    }
    wx.switchTab({ url: '/pages/study/study' });
  },

  // 点击热门考点跳转学习页
  goHotTopic(e) {
    const courseId = e.currentTarget.dataset.courseId;
    if (courseId) {
      app.globalData.pendingCourseId = courseId;
    }
    wx.switchTab({ url: '/pages/study/study' });
  },

  goAllTopics() {
    wx.showToast({ title: '更多考点即将上线', icon: 'none' });
  }
});
