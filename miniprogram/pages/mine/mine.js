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
      { num: '23', label: '连续打卡', unit: '天' },
      { num: '486', label: '刷题总数', unit: '题' },
      { num: '38', label: '学习时长', unit: 'h' }
    ],
    achievements: [
      { icon: 'ic-fire', name: '连胜达人', desc: '连续学习20天' },
      { icon: 'ic-target', name: '刷题高手', desc: '累计刷题400+' },
      { icon: 'ic-spark', name: '初露锋芒', desc: '完成第一章' },
      { icon: 'ic-star', name: '错题终结', desc: '错题正确率90%' }
    ],
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
    } else {
      this.setData({
        isLoggedIn: false,
        'user.name': '点击登录',
        'user.grade': '登录后同步学习数据',
        'user.avatarUrl': ''
      });
    }
  },

  // 点击用户卡片：未登录跳登录页
  onProfileTap() {
    if (!this.data.isLoggedIn) {
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
          this.refreshUser();
          wx.showToast({ title: '已退出登录', icon: 'none' });
        }
      }
    });
  },

  goMenu(e) {
    const path = e.currentTarget.dataset.path;
    if (path) {
      wx.navigateTo({ url: path });
    }
  }
});
