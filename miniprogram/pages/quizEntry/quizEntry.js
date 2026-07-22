// pages/quizEntry/quizEntry.js
// 刷题前置分类页：按章节 / 按考点 分段切换，选择分类后跳转答题页
const app = getApp();

Page({
  data: {
    statusBarHeight: 20,
    loading: true,
    loadError: false,
    activeTab: 0,       // 0=按章节 1=按考点
    chapters: [],       // [{ name, count, topics: [{ name, count }] }]
    topics: [],         // [{ name, chapter, count }]
    expanded: {}        // 章节展开态，key=章节名
  },

  onLoad() {
    const sys = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: sys.statusBarHeight });

    // 登录拦截：刷题需上传用户数据（错题本），未登录则跳转登录页
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录后再刷题', icon: 'none' });
      setTimeout(() => {
        wx.navigateTo({ url: '/pages/login/login' });
      }, 1000);
      return;
    }

    this.loadCategories();
  },

  // 调用 quiz 云函数 categories 接口加载分类结构
  loadCategories() {
    this.setData({ loading: true, loadError: false });
    wx.cloud.callFunction({
      name: 'quiz',
      data: { action: 'categories' }
    }).then(res => {
      if (res.result && res.result.code === 0) {
        const { chapters, topics } = res.result.data;
        // 默认展开第一个章节
        const expanded = {};
        if (chapters && chapters.length > 0) {
          expanded[chapters[0].name] = true;
        }
        this.setData({
          loading: false,
          chapters: chapters || [],
          topics: topics || [],
          expanded
        });
      } else {
        this.setData({ loading: false, loadError: true });
        wx.showToast({ title: (res.result && res.result.msg) || '加载失败', icon: 'none' });
      }
    }).catch(() => {
      this.setData({ loading: false, loadError: true });
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  // 切换「按章节 / 按考点」
  switchCategory(e) {
    this.setData({ activeTab: e.currentTarget.dataset.index });
  },

  // 展开 / 收起章节考点列表
  toggleChapter(e) {
    const name = e.currentTarget.dataset.name;
    const key = 'expanded.' + name;
    this.setData({ [key]: !this.data.expanded[name] });
  },

  // 整章练习：跳转答题页，仅传 chapter（该章全部考点）
  startChapter(e) {
    const chapter = e.currentTarget.dataset.chapter;
    wx.navigateTo({
      url: '/pages/quiz/quiz?chapter=' + encodeURIComponent(chapter)
    });
  },

  // 单考点练习：跳转答题页，传 chapter + topic
  startTopic(e) {
    const chapter = e.currentTarget.dataset.chapter;
    const topic = e.currentTarget.dataset.topic;
    wx.navigateTo({
      url: '/pages/quiz/quiz?chapter=' + encodeURIComponent(chapter) +
           '&topic=' + encodeURIComponent(topic)
    });
  },

  goBack() {
    wx.navigateBack();
  },

  onRetry() {
    this.loadCategories();
  },

  onShareAppMessage() {
    return { title: 'Bio - 高中生物学习助手', path: '/pages/home/home' };
  },

  onShareTimeline() {
    return { title: 'Bio - 高中生物学习助手' };
  }
});
