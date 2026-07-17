// pages/mistakes/mistakes.js
Page({
  data: {
    statusBarHeight: 20,
    loading: true,
    mistakes: [],
    isDemo: false,
    expanded: {} // { _id: true } 解析展开状态
  },

  onLoad() {
    const sys = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: sys.statusBarHeight });
  },

  onShow() {
    this.loadMistakes();
  },

  // 调用 mistakes 云函数获取错题列表
  loadMistakes() {
    this.setData({ loading: true });
    const info = wx.getStorageSync('userInfo') || {};
    wx.cloud.callFunction({
      name: 'mistakes',
      data: { action: 'list', userID: info.userID || '' },
      success: (res) => {
        if (res.result && res.result.code === 0) {
          this.setData({
            mistakes: res.result.data.mistakes,
            isDemo: res.result.data.isDemo,
            loading: false
          });
        } else {
          this.setData({ loading: false });
          wx.showToast({ title: '加载失败', icon: 'none' });
        }
      },
      fail: (err) => {
        console.error('mistakes error:', err);
        this.setData({ loading: false });
        wx.showToast({ title: '网络异常', icon: 'none' });
      }
    });
  },

  goBack() {
    wx.navigateBack();
  },

  // 展开/收起解析
  toggleExplain(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ ['expanded.' + id]: !this.data.expanded[id] });
  },

  // 删除错题
  removeMistake(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '提示',
      content: '确定从错题本移除这道题吗？',
      success: (r) => {
        if (!r.confirm) return;
        const info = wx.getStorageSync('userInfo') || {};
        wx.cloud.callFunction({
          name: 'mistakes',
          data: { action: 'remove', mistakeId: id, userID: info.userID || '' },
          success: (res) => {
            if (res.result && res.result.code === 0) {
              wx.showToast({ title: '已移除', icon: 'none' });
              this.loadMistakes();
            } else {
              wx.showToast({ title: (res.result && res.result.msg) || '移除失败', icon: 'none' });
            }
          },
          fail: () => wx.showToast({ title: '网络异常', icon: 'none' })
        });
      }
    });
  },

  // 去刷题
  goQuiz() {
    wx.navigateTo({ url: '/pages/quiz/quiz' });
  }
});
