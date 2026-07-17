// pages/pet/pet.js
Page({
  data: {
    statusBarHeight: 20,
    loading: true,
    isDemo: false,
    pet: {
      name: '球球',
      level: 1,
      xp: 0,
      xpMax: 100,
      mood: 80,
      fullness: 70,
      intimacy: 1,
      fish: 0,
      todayEarned: 0,
      accompanyDays: 1
    },
    diary: [],
    catImage: '/images/cat-lying-1.png',
    interacting: false
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
    this.setData({
      statusBarHeight: sys.statusBarHeight,
      catImage: cats[Math.floor(Math.random() * cats.length)]
    });
  },

  onShow() {
    this.loadPet();
  },

  // 调用 pet 云函数获取猫咪状态
  loadPet() {
    this.setData({ loading: true });
    const info = wx.getStorageSync('userInfo') || {};
    wx.cloud.callFunction({
      name: 'pet',
      data: { action: 'get', userID: info.userID || '' },
      success: (res) => {
        if (res.result && res.result.code === 0) {
          this.setData({
            pet: res.result.data.pet,
            diary: res.result.data.diary,
            isDemo: res.result.data.isDemo,
            loading: false
          });
        } else {
          this.setData({ loading: false });
          wx.showToast({ title: '加载失败', icon: 'none' });
        }
      },
      fail: (err) => {
        console.error('pet error:', err);
        this.setData({ loading: false });
        wx.showToast({ title: '网络异常', icon: 'none' });
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
    const info = wx.getStorageSync('userInfo') || {};
    wx.cloud.callFunction({
      name: 'pet',
      data: { action, userID: info.userID || '' },
      success: (res) => {
        this.setData({ interacting: false });
        if (res.result && res.result.code === 0) {
          this.setData({
            pet: res.result.data.pet,
            diary: res.result.data.diary
          });
          wx.showToast({ title: res.result.data.msg || '互动成功', icon: 'none' });
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
