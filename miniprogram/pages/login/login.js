// pages/login/login.js
const app = getApp();

Page({
  data: {
    statusBarHeight: 20,
    authMode: 'login', // 'login' | 'register'
    nickname: '',
    password: '',
    confirmPassword: '',
    loading: false
  },

  onLoad() {
    const sys = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: sys.statusBarHeight });

    // 检查本地登录状态
    const cached = wx.getStorageSync('userInfo');
    if (cached && cached.nickname) {
      wx.switchTab({ url: '/pages/home/home' });
    }
  },

  // ---- 返回上一页 ----
  goBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack();
    } else {
      wx.switchTab({ url: '/pages/home/home' });
    }
  },

  // ---- 登录/注册模式切换 ----
  switchAuthMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode === this.data.authMode) return;
    this.setData({ authMode: mode, confirmPassword: '' });
  },

  // ---- 输入处理 ----
  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },

  onConfirmPasswordInput(e) {
    this.setData({ confirmPassword: e.detail.value });
  },

  // ---- 微信一键登录（直接调用云函数，openid 由云端获取，不依赖 getUserProfile）----
  handleWeChatLogin() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    this._callLoginCloud('wxLogin', {});
  },

  // ---- 昵称登录/注册提交 ----
  handleNicknameSubmit() {
    if (this.data.loading) return;
    const { authMode, nickname, password, confirmPassword } = this.data;
  
    if (!nickname || !nickname.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }
    if (nickname.trim().length > 20) {
      wx.showToast({ title: '昵称不超过 20 字', icon: 'none' });
      return;
    }
    if (!password) {
      wx.showToast({ title: '请输入密码', icon: 'none' });
      return;
    }
    if (password.length < 6) {
      wx.showToast({ title: '密码至少 6 位', icon: 'none' });
      return;
    }
    if (authMode === 'register' && password !== confirmPassword) {
      wx.showToast({ title: '两次密码不一致', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    const action = authMode === 'register' ? 'nicknameRegister' : 'nicknameLogin';
    this._callLoginCloud(action, { nickname: nickname.trim(), password });
  },

  // ---- 调用云函数 ----
  _callLoginCloud(action, extra) {
    wx.showLoading({ title: action === 'nicknameRegister' ? '注册中...' : '登录中...' });

    wx.cloud.callFunction({
      name: 'login',
      data: { action, ...extra },
      success: (res) => {
        wx.hideLoading();
        this.setData({ loading: false });

        if (res.result && res.result.code === 0) {
          const user = res.result.user;
          wx.setStorageSync('userInfo', user);
          app.globalData.userInfo = user;
          app.globalData.isLoggedIn = true;

          wx.showToast({
            title: res.result.isNewUser ? '欢迎加入!' : '登录成功',
            icon: 'success',
            duration: 1500
          });

          setTimeout(() => {
            // 微信一键登录的新用户跳转信息填写页，其余直接进首页
            if (action === 'wxLogin' && res.result.isNewUser) {
              wx.redirectTo({ url: '/pages/profile/profile?mode=setup' });
            } else {
              wx.switchTab({ url: '/pages/home/home' });
            }
          }, 1500);
        } else {
          wx.showToast({
            title: (res.result && res.result.msg) || '操作失败',
            icon: 'none'
          });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        this.setData({ loading: false });
        console.error('login cloud function error:', err);
        wx.showToast({ title: '网络异常，请重试', icon: 'none' });
      }
    });
  },

});
