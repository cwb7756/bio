// pages/study/study.js
Page({
  data: {
    statusBarHeight: 20,
    activeTab: 0,
    tabs: ['必修一', '必修二', '选择性必修'],
    chapters: [
      {
        title: '分子与细胞',
        progress: 65,
        lessons: 12,
        completed: 8,
        icon: 'ic-microscope',
        color: 'green'
      },
      {
        title: '细胞的结构与功能',
        progress: 100,
        lessons: 10,
        completed: 10,
        icon: 'ic-flask',
        color: 'done'
      },
      {
        title: '细胞的代谢',
        progress: 40,
        lessons: 15,
        completed: 6,
        icon: 'ic-bolt',
        color: 'green'
      },
      {
        title: '细胞的生命历程',
        progress: 0,
        lessons: 8,
        completed: 0,
        icon: 'ic-refresh',
        color: 'lock'
      }
    ]
  },

  onLoad() {
    const sys = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: sys.statusBarHeight });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
  },

  switchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.index });
  },

  goChapter(e) {
    const idx = e.currentTarget.dataset.index;
    const ch = this.data.chapters[idx];
    if (ch.progress === 0) {
      wx.showToast({ title: '请先完成前置章节', icon: 'none' });
    } else {
      wx.navigateTo({ url: '/pages/knowledge/knowledge' });
    }
  }
});
