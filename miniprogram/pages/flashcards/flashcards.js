// pages/flashcards/flashcards.js
const app = getApp();
const sound = require('../../utils/sound.js');
const { addToNotebook } = require('../../utils/notebook.js');

Page({
  data: {
    statusBarHeight: 20,
    loading: true,
    cards: [],
    chapters: ['全部', '必修一', '必修二', '选择性必修一', '选择性必修二', '选择性必修三'],
    pickerChapters: ['必修一', '必修二', '选择性必修一', '选择性必修二', '选择性必修三'],
    activeChapter: 0,
    // 新建卡片弹窗
    showAdd: false,
    newTitle: '',
    newContent: '',
    newChapter: '必修一',
    submitting: false
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
    this.loadCards();
  },

  // 调用 flashcards 云函数获取卡片列表
  loadCards(done) {
    this.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'flashcards',
      data: { action: 'list' },
      success: (res) => {
        if (res.result && res.result.code === 0) {
          this.setData({ cards: res.result.data.cards, loading: false });
        } else {
          this.setData({ loading: false });
          wx.showToast({ title: '加载失败', icon: 'none' });
        }
        if (done) done();
      },
      fail: (err) => {
        console.error('flashcards error:', err);
        this.setData({ loading: false });
        wx.showToast({ title: '网络异常', icon: 'none' });
        if (done) done();
      }
    });
  },

  onPullDownRefresh() {
    this.loadCards(() => {
      wx.stopPullDownRefresh();
    });
  },

  goBack() {
    wx.navigateBack();
  },

  noop() {},

  switchChapter(e) {
    if (e.currentTarget.dataset.index !== this.data.activeChapter) {
      sound.play('click');
    }
    this.setData({ activeChapter: e.currentTarget.dataset.index });
  },

  // 打开/关闭新建弹窗
  openAdd() {
    this.setData({ showAdd: true });
  },
  closeAdd() {
    this.setData({ showAdd: false, newTitle: '', newContent: '' });
  },
  onTitleInput(e) {
    this.setData({ newTitle: e.detail.value });
  },
  onContentInput(e) {
    this.setData({ newContent: e.detail.value });
  },
  onChapterPick(e) {
    this.setData({ newChapter: this.data.pickerChapters[e.detail.value] });
  },

  // 提交新建卡片
  submitAdd() {
    const { newTitle, newContent, newChapter, submitting } = this.data;
    if (submitting) return;
    if (!newTitle.trim() || !newContent.trim()) {
      wx.showToast({ title: '请填写标题和内容', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    wx.cloud.callFunction({
      name: 'flashcards',
      data: {
        action: 'add',
        title: newTitle.trim(),
        content: newContent.trim(),
        chapter: newChapter
      },
      success: (res) => {
        this.setData({ submitting: false });
        if (res.result && res.result.code === 0) {
          sound.play('pop');
          wx.showToast({ title: '已添加', icon: 'success' });
          this.closeAdd();
          this.loadCards();
        } else {
          wx.showToast({ title: (res.result && res.result.msg) || '添加失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ submitting: false });
        wx.showToast({ title: '网络异常', icon: 'none' });
      }
    });
  },

  // 删除自建卡片
  removeCard(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '提示',
      content: '确定删除这张卡片吗？',
      success: (r) => {
        if (!r.confirm) return;
        wx.cloud.callFunction({
          name: 'flashcards',
          data: { action: 'remove', cardId: id },
          success: (res) => {
            if (res.result && res.result.code === 0) {
              wx.showToast({ title: '已删除', icon: 'none' });
              this.loadCards();
            } else {
              wx.showToast({ title: (res.result && res.result.msg) || '删除失败', icon: 'none' });
            }
          },
          fail: () => wx.showToast({ title: '网络异常', icon: 'none' })
        });
      }
    });
  },

  onShareAppMessage() {
    return { title: 'Bio - 高中生物学习助手', path: '/pages/home/home' };
  },

  // 收录到笔记本
  addToNotebook(e) {
    var id = e.currentTarget.dataset.id;
    var card = null;
    for (var i = 0; i < this.data.cards.length; i++) {
      if (this.data.cards[i]._id === id) {
        card = this.data.cards[i];
        break;
      }
    }
    if (!card) return;
    addToNotebook({
      type: 'knowledge',
      source: 'flashcards',
      refId: card._id,
      title: card.title,
      content: card.content,
      meta: { chapter: card.chapter }
    });
  },

  onShareTimeline() {
    return { title: 'Bio - 高中生物学习助手' };
  }
});
