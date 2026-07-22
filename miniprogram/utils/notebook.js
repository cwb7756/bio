// utils/notebook.js - 笔记本收录共享工具
const app = getApp();

/**
 * 收录内容到我的笔记本
 * @param {Object} payload { type, source, refId, title, content, meta }
 * @param {Function} cb 可选回调 callback(ok, duplicated)
 */
function addToNotebook(payload, cb) {
  if (!app.globalData.isLoggedIn) {
    wx.showToast({ title: '请先登录', icon: 'none' });
    setTimeout(function () {
      wx.navigateTo({ url: '/pages/login/login' });
    }, 1000);
    if (cb) cb(false);
    return;
  }
  wx.cloud.callFunction({
    name: 'notebook',
    data: Object.assign({ action: 'add' }, payload),
    success: function (res) {
      if (res.result && res.result.code === 0) {
        var dup = res.result.data && res.result.data.duplicated;
        wx.showToast({
          title: dup ? '已在笔记本中' : '已加入笔记本',
          icon: dup ? 'none' : 'success'
        });
        if (cb) cb(true, dup);
      } else {
        wx.showToast({ title: (res.result && res.result.msg) || '收录失败', icon: 'none' });
        if (cb) cb(false);
      }
    },
    fail: function () {
      wx.showToast({ title: '网络异常', icon: 'none' });
      if (cb) cb(false);
    }
  });
}

module.exports = {
  addToNotebook: addToNotebook
};
