// pages/home/home.js
Page({
  data: {
    statusBarHeight: 20,
    searchValue: '',
    catImage: '',
    continueLearning: {
      tag: '继续学习',
      title: '细胞的能量"货币" — ATP',
      meta: '第 3 章 · 细胞的能量供应和利用 · 已学 65%',
      progress: 65
    },
    features: [
      { icon: 'ic-microscope', name: '知识图解', bg: 'g', path: '/pages/knowledge/knowledge' },
      { icon: 'ic-pen', name: '刷题练习', bg: 'g2', path: '/pages/quiz/quiz' },
      { icon: 'ic-folder', name: '速记卡片', bg: 'g3', path: '' },
      { icon: 'ic-close', name: '错题本', bg: 'g4', path: '' },
      { icon: 'ic-video', name: 'B站课程', bg: 'g5', path: '' },
      { icon: 'ic-bot', name: 'AI老师', bg: 'g6', path: '' }
    ],
    hotTopics: [
      { no: 1, title: '光合作用与呼吸作用', desc: '必修一 · 高频大题 · 图表分析', fire: '9.2k', hot: false },
      { no: 2, title: '基因的自由组合定律', desc: '必修二 · 计算题必考', fire: '8.7k', hot: true },
      { no: 3, title: '内环境稳态与调节', desc: '选择性必修 · 概念辨析', fire: '7.5k', hot: false }
    ]
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
    if (path) {
      wx.navigateTo({ url: path });
    } else {
      wx.showToast({ title: '功能开发中...', icon: 'none' });
    }
  },

  continueStudy() {
    wx.navigateTo({ url: '/pages/knowledge/knowledge' });
  },

  goAllTopics() {
    wx.showToast({ title: '更多考点即将上线', icon: 'none' });
  }
});
