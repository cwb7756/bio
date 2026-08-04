// pages/feedback/feedback.js
const app = getApp();

const MAX_CONTENT_LEN = 2000;

Page({
  data: {
    statusBarHeight: 20,
    types: [
      { id: 'suggest', name: '功能建议' },
      { id: 'bug', name: 'Bug反馈' },
      { id: 'other', name: '其他' }
    ],
    type: 'suggest',
    content: '',
    contentLen: 0,
    contact: '',
    submitting: false,
    history: [],
    historyLoaded: false
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
    this.loadHistory();
  },

  goBack() {
    wx.navigateBack();
  },

  // 选择反馈类型
  chooseType(e) {
    this.setData({ type: e.currentTarget.dataset.id });
  },

  onContentInput(e) {
    const val = e.detail.value || '';
    this.setData({ content: val, contentLen: val.length });
  },

  onContactInput(e) {
    this.setData({ contact: e.detail.value || '' });
  },

  // 预览历史反馈图片
  previewImage(e) {
    const { url, urls } = e.currentTarget.dataset;
    wx.previewImage({ current: url, urls: urls || [url] });
  },

  // 提交反馈
  async submit() {
    if (this.data.submitting) return;

    const content = (this.data.content || '').trim();
    if (!content) {
      wx.showToast({ title: '请填写反馈内容', icon: 'none' });
      return;
    }
    if (content.length > MAX_CONTENT_LEN) {
      wx.showToast({ title: '内容最多' + MAX_CONTENT_LEN + '字', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中...', mask: true });

    try {
      // 调用云函数写入反馈
      const res = await new Promise((resolve, reject) => {
        wx.cloud.callFunction({
          name: 'feedback',
          data: {
            action: 'submit',
            type: this.data.type,
            content: content,
            contact: (this.data.contact || '').trim(),
            images: []
          },
          success: (r) => resolve(r),
          fail: reject
        });
      });

      wx.hideLoading();
      this.setData({ submitting: false });

      if (res.result && res.result.code === 0) {
        wx.showToast({ title: '提交成功，感谢反馈', icon: 'none' });
        this.setData({ content: '', contentLen: 0, contact: '', type: 'suggest' });
        this.loadHistory();
      } else if (res.result && res.result.code === 401) {
        wx.showToast({ title: '请先登录', icon: 'none' });
        wx.navigateTo({ url: '/pages/login/login' });
      } else {
        wx.showToast({ title: (res.result && res.result.msg) || '提交失败，请重试', icon: 'none' });
      }
    } catch (err) {
      console.error('feedback submit error:', err);
      wx.hideLoading();
      this.setData({ submitting: false });
      wx.showToast({ title: '提交失败，请重试', icon: 'none' });
    }
  },

  // 加载我的历史反馈
  loadHistory() {
    wx.cloud.callFunction({
      name: 'feedback',
      data: { action: 'list', page: 1, pageSize: 20 },
      success: (res) => {
        if (res.result && res.result.code === 0) {
          const list = (res.result.data.list || []).map((item) => ({
            ...item,
            typeName: this.typeName(item.type),
            statusText: this.statusText(item.status),
            timeText: this.formatTime(item.createdAt),
            replyTimeText: this.formatTime(item.repliedAt)
          }));
          this.setData({ history: list, historyLoaded: true });
        } else {
          this.setData({ history: [], historyLoaded: true });
        }
      },
      fail: (err) => {
        console.error('feedback list error:', err);
        this.setData({ history: [], historyLoaded: true });
      }
    });
  },

  typeName(id) {
    const hit = this.data.types.find((t) => t.id === id);
    return hit ? hit.name : '其他';
  },

  // 状态 → 中文文案
  statusText(status) {
    const map = {
      pending: '待处理',
      replied: '已回复',
      resolved: '已解决',
      closed: '已关闭'
    };
    return map[status] || '待处理';
  },

  // 时间戳 → MM-DD HH:mm
  formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
});
