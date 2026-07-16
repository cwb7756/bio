// pages/mine/mine.js
Page({
  data: {
    statusBarHeight: 20,
    user: {
      name: '生物小达人',
      grade: '高二',
      level: 'Lv.12',
      avatar: 'ic-student'
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
      { icon: 'ic-close', name: '我的错题本', desc: '12道待复习', badge: '12' },
      { icon: 'ic-folder', name: '速记卡片', desc: '35张已收藏', badge: '' },
      { icon: 'ic-chart', name: '学习报告', desc: '查看学习数据', badge: '' },
      { icon: 'ic-trophy', name: '成就中心', desc: '8/24 已解锁', badge: '' },
      { icon: 'ic-crown', name: 'VIP会员', desc: '解锁全部功能', badge: 'HOT' },
      { icon: 'ic-settings', name: '设置', desc: '通知、隐私等', badge: '' }
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
  },

  goMenu(e) {
    const name = e.currentTarget.dataset.name;
    if (name === '我的错题本') {
      wx.navigateTo({ url: '/pages/quiz/quiz' });
    } else {
      wx.showToast({ title: '功能开发中...', icon: 'none' });
    }
  },

  goVip() {
    wx.showToast({ title: 'VIP功能即将上线', icon: 'none' });
  }
});
