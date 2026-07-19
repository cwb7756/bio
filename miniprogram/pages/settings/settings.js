// pages/settings/settings.js
const app = getApp();
const sound = require('../../utils/sound.js');

Page({
  data: {
    statusBarHeight: 20,
    loading: true,
    isLoggedIn: false,
    settings: {
      notification: true,
      sound: true,
      soundStyle: 'crisp',
      autoPlay: false,
      dailyReminder: false
    },
    // 可选音效风格
    soundStyles: [
      { id: 'crisp', name: '清脆铃声' },
      { id: 'soft', name: '柔和木琴' },
      { id: 'retro', name: '复古像素' }
    ],
    soundStyleName: '清脆铃声',
    cacheSize: '0KB'
  },

  onLoad() {
    const sys = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: sys.statusBarHeight });
  },

  onShow() {
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    this.loadSettings();
    this.loadCacheSize();
  },

  // 调用 settings 云函数读取设置
  loadSettings() {
    wx.cloud.callFunction({
      name: 'settings',
      data: { action: 'get' },
      success: (res) => {
        if (res.result && res.result.code === 0) {
          const settings = res.result.data.settings;
          this.setData({
            settings: settings,
            soundStyleName: this.styleName(settings.soundStyle),
            isLoggedIn: res.result.data.isLoggedIn,
            loading: false
          });
          // 同步到全局音效管理器
          sound.applySettings(settings);
        } else {
          this.setData({ loading: false });
        }
      },
      fail: (err) => {
        console.error('settings error:', err);
        this.setData({ loading: false });
      }
    });
  },

  // 读取本地缓存大小
  loadCacheSize() {
    try {
      const info = wx.getStorageInfoSync();
      this.setData({ cacheSize: info.currentSize + 'KB' });
    } catch (e) {
      this.setData({ cacheSize: '未知' });
    }
  },

  goBack() {
    wx.navigateBack();
  },

  // 开关切换：先本地生效，再同步云端
  onSwitch(e) {
    const key = e.currentTarget.dataset.key;
    const value = e.detail.value;
    const oldValue = this.data.settings[key];
    this.setData({ ['settings.' + key]: value });

    // 音效开关即时生效，开启时播放一个短反馈
    if (key === 'sound') {
      sound.setEnabled(value);
      if (value) sound.play('pop');
    }

    wx.cloud.callFunction({
      name: 'settings',
      data: {
        action: 'update',
        settings: { [key]: value }
      },
      success: (res) => {
        if (!res.result || res.result.code !== 0) {
          if (res.result && res.result.code === 401) {
            wx.showToast({ title: '登录后设置将云端同步', icon: 'none' });
          } else {
            this.setData({ ['settings.' + key]: oldValue });
            wx.showToast({ title: '同步失败，请重试', icon: 'none' });
          }
        }
      },
      fail: () => {
        this.setData({ ['settings.' + key]: oldValue });
        if (key === 'sound') sound.setEnabled(oldValue);
        wx.showToast({ title: '同步失败，请重试', icon: 'none' });
      }
    });
  },

  // 风格 id → 中文名
  styleName(id) {
    const hit = this.data.soundStyles.find((s) => s.id === id);
    return hit ? hit.name : this.data.soundStyles[0].name;
  },

  // 选择音效风格：立即生效 + 试听 + 同步云端
  chooseSoundStyle() {
    const styles = this.data.soundStyles;
    wx.showActionSheet({
      itemList: styles.map((s) => s.name),
      success: (res) => {
        const picked = styles[res.tapIndex];
        if (!picked || picked.id === this.data.settings.soundStyle) return;
        const old = this.data.settings.soundStyle;
        this.setData({
          'settings.soundStyle': picked.id,
          soundStyleName: picked.name
        });
        sound.setStyle(picked.id);
        // 试听答对音效（音效总开关关闭时静默）
        sound.play('correct');

        wx.cloud.callFunction({
          name: 'settings',
          data: { action: 'update', settings: { soundStyle: picked.id } },
          success: (r) => {
            if (r.result && r.result.code === 401) {
              wx.showToast({ title: '登录后设置将云端同步', icon: 'none' });
            } else if (!r.result || r.result.code !== 0) {
              this.rollbackStyle(old);
            }
          },
          fail: () => this.rollbackStyle(old)
        });
      }
    });
  },

  rollbackStyle(old) {
    this.setData({
      'settings.soundStyle': old,
      soundStyleName: this.styleName(old)
    });
    sound.setStyle(old);
    wx.showToast({ title: '同步失败，请重试', icon: 'none' });
  },

  // 清除缓存（保留登录态）
  clearCache() {
    wx.showModal({
      title: '提示',
      content: '确定清除本地缓存吗？（不会退出登录）',
      success: (r) => {
        if (!r.confirm) return;
        const userInfo = wx.getStorageSync('userInfo');
        wx.clearStorageSync();
        if (userInfo) {
          wx.setStorageSync('userInfo', userInfo);
        }
        this.loadCacheSize();
        wx.showToast({ title: '缓存已清除', icon: 'none' });
      }
    });
  },

  // 关于
  showAbout() {
    wx.showModal({
      title: '关于',
      content: '高中生物学习助手 v1.0\n课程学习 · 刷题练习 · AI答疑 · 猫咪陪伴',
      showCancel: false
    });
  },

  // 退出登录
  logout() {
    if (!this.data.isLoggedIn) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    wx.showModal({
      title: '提示',
      content: '确定退出登录吗？',
      success: (r) => {
        if (!r.confirm) return;
        wx.removeStorageSync('userInfo');
        app.globalData.userInfo = null;
        this.setData({ isLoggedIn: false });
        wx.showToast({ title: '已退出登录', icon: 'none' });
      }
    });
  }
});
