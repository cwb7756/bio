// pages/profile/profile.js
const app = getApp();

Page({
  data: {
    mode: 'setup',       // 'setup' | 'edit'
    statusBarHeight: 20,
    avatar: '',           // 云文件 fileID 或网络 URL
    nickname: '',
    grade: '高一',
    grades: ['高一', '高二', '高三'],
    email: '',
    password: '',
    submitting: false
  },

  onLoad(options) {
    const sys = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: sys.statusBarHeight,
      mode: options.mode === 'edit' ? 'edit' : 'setup'
    });

    // 从本地缓存预填用户数据
    const info = wx.getStorageSync('userInfo');
    if (info) {
      this.setData({
        avatar: info.avatar || '',
        nickname: info.nickname || '',
        grade: info.grade || '高一',
        email: info.email || ''
      });
    }
  },

  // 微信头像选择（button open-type="chooseAvatar"），拿到临时路径后上传云存储
  onChooseAvatar(e) {
    const tempPath = e.detail.avatarUrl;
    if (!tempPath) return;
    wx.showLoading({ title: '上传中...' });
    const cloudPath = 'avatars/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.jpg';
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: tempPath,
      success: (uploadRes) => {
        wx.hideLoading();
        this.setData({ avatar: uploadRes.fileID });
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('avatar upload error:', err);
        wx.showToast({ title: '头像上传失败', icon: 'none' });
      }
    });
  },

  // ---- 输入处理 ----
  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value });
  },

  switchGrade(e) {
    this.setData({ grade: e.currentTarget.dataset.grade });
  },

  onEmailInput(e) {
    this.setData({ email: e.detail.value });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },

  // ---- 提交保存 ----
  submit() {
    if (this.data.submitting) return;
    const { nickname, avatar, grade, email, password } = this.data;

    if (!nickname || !nickname.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }
    if (nickname.trim().length > 20) {
      wx.showToast({ title: '昵称不超过20字', icon: 'none' });
      return;
    }

    // 邮箱与密码组合校验
    if (email || password) {
      if (!email) {
        wx.showToast({ title: '绑定密码需同时填写邮箱', icon: 'none' });
        return;
      }
      if (!this._validateEmail(email)) {
        wx.showToast({ title: '邮箱格式不正确', icon: 'none' });
        return;
      }
      if (!password || password.length < 6) {
        wx.showToast({ title: '密码至少6位', icon: 'none' });
        return;
      }
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '保存中...' });

    const data = {
      action: 'updateProfile',
      nickname: nickname.trim(),
      grade: grade
    };
    if (avatar) data.avatar = avatar;
    if (email) data.email = email.trim();
    if (password) data.password = password;

    wx.cloud.callFunction({
      name: 'login',
      data: data,
      success: (res) => {
        wx.hideLoading();
        this.setData({ submitting: false });

        if (res.result && res.result.code === 0) {
          // 更新本地缓存与全局状态
          const user = res.result.user;
          wx.setStorageSync('userInfo', user);
          app.globalData.userInfo = user;
          app.globalData.isLoggedIn = true;

          wx.showToast({ title: '保存成功', icon: 'success', duration: 1200 });

          setTimeout(() => {
            if (this.data.mode === 'setup') {
              wx.switchTab({ url: '/pages/home/home' });
            } else {
              wx.navigateBack();
            }
          }, 1200);
        } else {
          wx.showToast({
            title: (res.result && res.result.msg) || '保存失败',
            icon: 'none'
          });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        this.setData({ submitting: false });
        console.error('updateProfile error:', err);
        wx.showToast({ title: '网络异常，请重试', icon: 'none' });
      }
    });
  },

  // setup 模式跳过
  skipSetup() {
    wx.switchTab({ url: '/pages/home/home' });
  },

  goBack() {
    wx.navigateBack();
  },

  // ---- 工具方法 ----
  _validateEmail(email) {
    const reg = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return reg.test(email);
  }
});
