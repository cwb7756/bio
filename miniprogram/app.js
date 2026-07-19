// app.js
App({
  onLaunch: function () {
    this.globalData = {
      // env 参数说明：
      // env 参数决定接下来小程序发起的云开发调用（wx.cloud.xxx）会请求到哪个云环境的资源
      // 此处请填入环境 ID, 环境 ID 可在微信开发者工具右上顶部工具栏点击云开发按钮打开获取
      env: "bio-d9gzmnqrif819033f",
      userInfo: null,
      isLoggedIn: false,
      // 刷题完成后的总结数据暂存（quiz 页写入，quizSummary 页读取后清空）
      quizSummary: null
    };
    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
    } else {
      wx.cloud.init({
        env: this.globalData.env,
        traceUser: true,
      });
    }
    // 从本地缓存恢复登录态
    const cached = wx.getStorageSync('userInfo');
    if (cached && cached.nickname) {
      this.globalData.isLoggedIn = true;
      this.globalData.userInfo = cached;
    }
  },

  // 检查登录态：未登录则跳转登录页并返回 false，已登录返回 true
  checkLogin: function () {
    if (!this.globalData.isLoggedIn) {
      wx.navigateTo({ url: '/pages/login/login' });
      return false;
    }
    return true;
  }
});
