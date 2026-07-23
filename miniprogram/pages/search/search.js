// pages/search/search.js
// 全局搜索结果页：课程/考点 + 知识点 + 题目分组展示，带本地搜索历史
const app = getApp();

const HISTORY_KEY = 'searchHistory';
const HISTORY_MAX = 10;

Page({
  data: {
    statusBarHeight: 20,
    keyword: '',         // 输入框当前值
    searchedKeyword: '', // 已执行搜索的关键词
    searching: false,
    searched: false,
    courses: [],
    knowledgePoints: [],
    questions: [],
    history: []
  },

  onLoad(options) {
    const sys = wx.getSystemInfoSync();
    const history = wx.getStorageSync(HISTORY_KEY) || [];
    this.setData({ statusBarHeight: sys.statusBarHeight, history });

    const keyword = decodeURIComponent((options && options.keyword) || '').trim();
    if (keyword) {
      this.setData({ keyword });
      this.doSearch(keyword);
    }
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearchConfirm() {
    this.doSearch(this.data.keyword);
  },

  // 点击历史词直接搜索
  onTapHistory(e) {
    const word = e.currentTarget.dataset.word;
    this.setData({ keyword: word });
    this.doSearch(word);
  },

  // 清空输入，回到历史视图
  clearKeyword() {
    this.setData({
      keyword: '',
      searched: false,
      searchedKeyword: '',
      courses: [],
      knowledgePoints: [],
      questions: []
    });
  },

  clearHistory() {
    wx.removeStorageSync(HISTORY_KEY);
    this.setData({ history: [] });
  },

  // 历史记录：新词置顶、去重、最多 HISTORY_MAX 条
  saveHistory(word) {
    let history = wx.getStorageSync(HISTORY_KEY) || [];
    history = history.filter((w) => w !== word);
    history.unshift(word);
    history = history.slice(0, HISTORY_MAX);
    wx.setStorageSync(HISTORY_KEY, history);
    this.setData({ history });
  },

  // 调用 search 云函数执行全局搜索
  doSearch(rawKeyword) {
    const keyword = String(rawKeyword || '').trim();
    if (!keyword) {
      wx.showToast({ title: '请输入搜索内容', icon: 'none' });
      return;
    }
    this.setData({ searching: true, searched: false, keyword, searchedKeyword: keyword });

    wx.cloud.callFunction({
      name: 'search',
      data: { action: 'global', keyword }
    }).then((res) => {
      if (res.result && res.result.code === 0) {
        const d = res.result.data || {};
        this.setData({
          searching: false,
          searched: true,
          courses: d.courses || [],
          knowledgePoints: d.knowledgePoints || [],
          questions: d.questions || []
        });
        this.saveHistory(keyword);
      } else {
        this.setData({ searching: false, searched: true, courses: [], knowledgePoints: [], questions: [] });
        wx.showToast({ title: (res.result && res.result.msg) || '搜索失败', icon: 'none' });
      }
    }).catch((err) => {
      console.error('search error:', err);
      this.setData({ searching: false });
      wx.showToast({ title: '网络异常', icon: 'none' });
    });
  },

  // 课程 → 课程详情页
  goCourse(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/course/course?courseId=' + encodeURIComponent(id) });
  },

  // 知识点 → 知识图解页（该页支持 courseId + kpId 参数）
  goKnowledgePoint(e) {
    const ds = e.currentTarget.dataset;
    wx.navigateTo({
      url: '/pages/knowledge/knowledge?courseId=' + encodeURIComponent(ds.courseId || '') +
           '&kpId=' + encodeURIComponent(ds.kpId || '')
    });
  },

  // 题目 → 该考点刷题（需登录，与 quizEntry 一致）
  goQuestion(e) {
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录后再刷题', icon: 'none' });
      setTimeout(() => {
        wx.navigateTo({ url: '/pages/login/login' });
      }, 1000);
      return;
    }
    const ds = e.currentTarget.dataset;
    wx.navigateTo({
      url: '/pages/quiz/quiz?chapter=' + encodeURIComponent(ds.chapter || '') +
           '&topic=' + encodeURIComponent(ds.topic || '')
    });
  },

  goBack() {
    wx.navigateBack();
  },

  onShareAppMessage() {
    return { title: 'Bio - 高中生物学习助手', path: '/pages/home/home' };
  },

  onShareTimeline() {
    return { title: 'Bio - 高中生物学习助手' };
  }
});
