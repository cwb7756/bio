// pages/mine/mine.js
const app = getApp();

Page({
  data: {
    statusBarHeight: 20,
    isLoggedIn: false,
    user: {
      name: '点击登录',
      grade: '登录后同步学习数据',
      level: 'Lv.1',
      avatar: 'ic-student',
      avatarUrl: ''
    },
    stats: [
      { num: '--', label: '连续学习', unit: '天' },
      { num: '--', label: '刷题数', unit: '题' },
      { num: '--', label: '学习时长', unit: 'h' }
    ],
    achievements: [],
    menuList: [
      { icon: 'ic-close', name: '我的错题本', desc: '错题回顾与复习', badge: '', path: '/pages/mistakes/mistakes' },
      { icon: 'ic-folder', name: '速记卡片', desc: '考点速记随身看', badge: '', path: '/pages/flashcards/flashcards' },
      { icon: 'ic-chart', name: '学习报告', desc: '查看学习数据', badge: '', path: '/pages/report/report' },
      { icon: 'ic-trophy', name: '成就中心', desc: '查看已解锁成就', badge: '', path: '/pages/achievements/achievements' },
      { icon: 'ic-star', name: '我的猫咪', desc: '球球在等你互动', badge: '', path: '/pages/pet/pet' },
      { icon: 'ic-settings', name: '设置', desc: '通知、隐私等', badge: '', path: '/pages/settings/settings' }
    ]
  },

  onLoad() {
    const sys = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: sys.statusBarHeight });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
    this.refreshUser();
    this.loadStats();
    this.loadAchievements();
  },

  // 读取登录态并刷新用户信息
  refreshUser() {
    const info = wx.getStorageSync('userInfo');
    if (info && info.nickname) {
      this.setData({
        isLoggedIn: true,
        'user.name': info.nickname,
        'user.grade': (info.grade || '高中') + ' · 在路上',
        'user.avatarUrl': info.avatar || ''
      });
      app.globalData.isLoggedIn = true;
      app.globalData.userInfo = info;
    } else {
      this.setData({
        isLoggedIn: false,
        'user.name': '点击登录',
        'user.grade': '登录后同步学习数据',
        'user.avatarUrl': ''
      });
      app.globalData.isLoggedIn = false;
      app.globalData.userInfo = null;
    }
  },

  // 加载学习统计数据
  loadStats() {
    wx.cloud.callFunction({
      name: 'report',
      success: (res) => {
        if (res.result && res.result.code === 0) {
          const d = res.result.data || {};
          this.setData({
            'stats[0].num': d.streakDays != null ? String(d.streakDays) : '--',
            'stats[1].num': d.quizTotal != null ? String(d.quizTotal) : '--',
            'stats[2].num': d.studyHours != null ? String(d.studyHours) : '--'
          });
        }
      },
      fail: (err) => {
        console.error('report cloud function error:', err);
      }
    });
  },

  // 加载已解锁成就列表
  loadAchievements() {
    wx.cloud.callFunction({
      name: 'achievements',
      data: { action: 'list' },
      success: (res) => {
        if (res.result && res.result.code === 0) {
          var list = res.result.list || (res.result.data && res.result.data.achievements) || [];
          this.setData({ achievements: list });
        } else {
          this.setData({ achievements: [] });
        }
      },
      fail: (err) => {
        console.error('achievements cloud function error:', err);
        this.setData({ achievements: [] });
      }
    });
  },

  // 点击用户卡片：已登录跳编辑资料页，未登录跳登录页
  onProfileTap() {
    if (this.data.isLoggedIn) {
      wx.navigateTo({ url: '/pages/profile/profile?mode=edit' });
    } else {
      wx.navigateTo({ url: '/pages/login/login' });
    }
  },

  // 登录/退出按钮
  handleAuthBtn() {
    if (!this.data.isLoggedIn) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    wx.showModal({
      title: '提示',
      content: '确定退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('userInfo');
          app.globalData.userInfo = null;
          app.globalData.isLoggedIn = false;
          this.refreshUser();
          wx.showToast({ title: '已退出登录', icon: 'none' });
        }
      }
    });
  },

  goMenu(e) {
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    const path = e.currentTarget.dataset.path;
    if (path) {
      wx.navigateTo({ url: path });
    }
  }
});
