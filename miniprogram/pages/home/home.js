// pages/home/home.js
const app = getApp();
import cache from '../../utils/cache';

// tabBar 页面路径集合，跳转时需用 switchTab
const TAB_PAGES = ['/pages/aiHub/aiHub', '/pages/study/study'];

// 首页数据缓存有效期：30 秒
const HOME_CACHE_TTL = 30 * 1000;

Page({
  data: {
    statusBarHeight: 20,
    searchValue: '',
    catImage: '',
    userName: '同学',
    loading: true,
    continueLearning: null,
    isLoggedIn: false,
    features: [
      { icon: 'ic-book-sparkle', name: '个性化课程', bg: 'g', path: '/pages/aiClassroom/aiClassroom', premium: true },
      { icon: 'ic-pen', name: '刷题练习', bg: 'g2', path: '/pages/aiHub/aiHub' },
      { icon: 'ic-cube', name: '3D模型', bg: 'g3', path: '/packages/3d-model/pages/gallery/gallery' },
      { icon: 'ic-eraser', name: '错题本', bg: 'g4', path: '/pages/mistakes/mistakes' },
      { icon: 'ic-video', name: 'B站课程', bg: 'g5', path: '/pages/study/study' },
      { icon: 'ic-microscope', name: '知识图解', bg: 'g6', path: '/pages/knowledgeGraph/knowledgeGraph' }
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
    // 先用本地缓存快速回显用户名；未登录重置为默认称呼
    const info = wx.getStorageSync('userInfo');
    if (info && info.nickname) {
      this.setData({ userName: info.nickname });
    } else {
      this.setData({ userName: '同学' });
    }
    // 同步登录态，驱动“开始第一节课 / 请登录”文案切换
    this.setData({ isLoggedIn: !!app.globalData.isLoggedIn });
      
    // 优先从缓存读取首页数据
    const cachedHome = cache.get('home', { action: 'main' }, HOME_CACHE_TTL);
    if (cachedHome) {
      console.log('home page: using cached data');
      this.applyHomeData(cachedHome);
    } else {
      this.setData({ loading: true });
    }
      
    // 异步更新云端最新数据
    this.loadHomeData();
    // 同步猫咪等级样式（与猫咪页面一致）
    this.syncPetCat();
  },

  // 等级样式：Lv.1-2 幼猫 / Lv.3-4 绿围巾 / Lv.5+ 皇冠
  levelImage(level) {
    if (level >= 5) return '/images/cat-lv5.png';
    if (level >= 3) return '/images/cat-lv3.png';
    return '/images/cat-lv1.png';
  },

  // 应用首页数据（从缓存或云端）
  applyHomeData(data) {
    const { user, continueLearning, hotTopics } = data;
    const loggedIn = app.globalData.isLoggedIn;
    
    const cl = loggedIn && continueLearning
      ? Object.assign({}, continueLearning, { progressText: continueLearning.progress + '%' })
      : null;
    
    const updateData = {
      continueLearning: cl,
      hotTopics,
      loading: false
    };

    if (user && loggedIn) {
      updateData.userName = user.nickname || '同学';
      // 同步更新本地缓存
      const cached = wx.getStorageSync('userInfo') || {};
      wx.setStorageSync('userInfo', { ...cached, ...user });
      app.globalData.userInfo = { ...cached, ...user };
    }

    this.setData(updateData);
  },

  // 获取宠物等级，同步搜索框上的猫咪样式；失败保持默认随机图
  syncPetCat() {
    if (!app.globalData.isLoggedIn) return;
    wx.cloud.callFunction({
      name: 'pet',
      data: { action: 'get' },
      success: (res) => {
        if (res.result && res.result.code === 0 && res.result.data && res.result.data.pet) {
          this.setData({ catImage: this.levelImage(res.result.data.pet.level) });
        }
      },
      fail: () => {}
    });
  },

  // 调用 home 云函数获取首页数据
  loadHomeData() {
    wx.cloud.callFunction({
      name: 'home',
      success: (res) => {
        if (res.result && res.result.code === 0) {
          const { user, continueLearning, hotTopics } = res.result.data;

          // 更新本地缓存（30 秒有效）
          cache.set('home', { user, continueLearning, hotTopics }, { action: 'main' }, HOME_CACHE_TTL);

          // 用户数据（昵称 / 继续学习）仅登录态下应用；
          // 未登录时云端可能仍通过 openid 返回 users 记录，需前端门控，避免退出登录后数据复活
          const loggedIn = app.globalData.isLoggedIn;
          // 进度条宽度在 JS 侧拼成完整字符串，避免 WXML 内联样式里 }}% 触发编辑器 CSS 校验误报
          const cl = loggedIn && continueLearning
            ? Object.assign({}, continueLearning, { progressText: continueLearning.progress + '%' })
            : null;
          const updateData = {
            continueLearning: cl,
            hotTopics,
            loading: false
          };

          if (user && loggedIn) {
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

  // 搜索确认：跳转全局搜索结果页（课程/考点 + 知识点 + 题目）
  onSearchConfirm() {
    const keyword = (this.data.searchValue || '').trim();
    if (!keyword) {
      wx.showToast({ title: '请输入搜索内容', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/search/search?keyword=' + encodeURIComponent(keyword) });
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

  // 继续学习：未登录跳登录页；已登录跳 study tab 页，用 globalData 传递 courseId
  continueStudy() {
    if (!app.globalData.isLoggedIn) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
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
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录后查看全部考点', icon: 'none' });
      setTimeout(function () {
        wx.navigateTo({ url: '/pages/login/login' });
      }, 1000);
      return;
    }
    wx.navigateTo({ url: '/pages/knowledgeGraph/knowledgeGraph' });
  },

  // 分享给好友
  onShareAppMessage() {
    return {
      title: '高中生物 · 探索生命的奥秘',
      path: '/pages/home/home'
    };
  },

  // 分享到朋友圈
  onShareTimeline() {
    return {
      title: '高中生物 · 探索生命的奥秘'
    };
  }
});
