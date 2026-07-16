Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/home/home', text: '首页', icon: 'home' },
      { pagePath: '/pages/study/study', text: '学习', icon: 'study' },
      { pagePath: '/pages/ai/ai', text: 'AI答疑', icon: 'ai' },
      { pagePath: '/pages/mine/mine', text: '我的', icon: 'mine' }
    ]
  },
  methods: {
    switchTab(e) {
      const idx = e.currentTarget.dataset.index;
      const path = this.data.list[idx].pagePath;
      wx.switchTab({ url: path });
      this.setData({ selected: idx });
    }
  }
});
