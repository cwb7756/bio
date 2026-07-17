// pages/pet/pet.js
Page({
  data: {
    statusBarHeight: 20,
    loading: true,
    isDemo: false,
    pet: null,
    diary: [],
    catImage: '/images/cat-lv1.png',
    interacting: false
  },

  onLoad() {
    const sys = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: sys.statusBarHeight });
  },

  // 等级样式：Lv.1-2 幼猫 / Lv.3-4 绿围巾 / Lv.5+ 皇冠
  levelImage(level) {
    if (level >= 5) return '/images/cat-lv5.png';
    if (level >= 3) return '/images/cat-lv3.png';
    return '/images/cat-lv1.png';
  },

  // 播放互动状态图，一段时间后恢复当前等级样式
  playState(image, duration) {
    clearTimeout(this._stateTimer);
    this.setData({ catImage: image });
    this._stateTimer = setTimeout(() => {
      const lv = this.data.pet ? this.data.pet.level : 1;
      this.setData({ catImage: this.levelImage(lv) });
    }, duration || 2000);
  },

  onShow() {
    const app = getApp();
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    this.loadPet();
  },

  // 调用 pet 云函数获取猫咪状态
  loadPet() {
    this.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'pet',
      data: { action: 'get' },
      success: (res) => {
        if (res.result && res.result.code === 0) {
          this.setData({
            pet: res.result.data.pet,
            diary: res.result.data.diary,
            isDemo: res.result.data.isDemo,
            catImage: this.levelImage(res.result.data.pet.level),
            loading: false
          });
        } else {
          this.setData({ pet: null, loading: false });
          wx.showToast({ title: '加载失败', icon: 'none' });
        }
      },
      fail: (err) => {
        console.error('pet error:', err);
        this.setData({ pet: null, loading: false });
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
    });
  },

  goBack() {
    wx.navigateBack();
  },

  // 互动（喂食/抚摸）
  interact(e) {
    if (this.data.interacting) return;
    const action = e.currentTarget.dataset.action;
    this.setData({ interacting: true });
    wx.cloud.callFunction({
      name: 'pet',
      data: { action: action },
      success: (res) => {
        this.setData({ interacting: false });
        if (res.result && res.result.code === 0) {
          this.setData({
            pet: res.result.data.pet,
            diary: res.result.data.diary
          });
          const msg = res.result.data.msg || '';
          // 播放对应操作的状态图：升级 > 喂食 > 抚摸
          if (msg.indexOf('升到') >= 0) {
            this.playState('/images/cat-happy.png', 2600);
          } else if (action === 'feed') {
            this.playState('/images/cat-feed.png', 2000);
          } else if (action === 'pat') {
            this.playState('/images/cat-pat.png', 2000);
          }
          wx.showToast({ title: msg || '互动成功', icon: 'none' });
        } else {
          wx.showToast({ title: (res.result && res.result.msg) || '互动失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ interacting: false });
        wx.showToast({ title: '网络异常', icon: 'none' });
      }
    });
  },

  // 去学习赚小鱼干
  goStudy() {
    wx.switchTab({ url: '/pages/study/study' });
  },

  // 玩耍（未解锁）
  playLocked() {
    wx.showToast({ title: '球球 Lv.6 解锁玩耍', icon: 'none' });
  }
});
