// pages/quiz/quiz.js
const app = getApp();

Page({
  data: {
    statusBarHeight: 20,
    navTitle: '刷题',
    loading: true,
    loadError: false,
    emptyHint: '',

    questions: [],
    current: 0,
    total: 0,
    currentQuestion: null,
    selectedOption: -1,
    answered: false,
    correct: false,
    correctAnswer: '',
    explanation: ''
  },

  onLoad(options) {
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

    this.chapter = decodeURIComponent(options.chapter || '');
    this.topic = decodeURIComponent(options.topic || '');

    let navTitle = '刷题';
    if (this.topic) navTitle = this.topic + ' · 刷题';
    else if (this.chapter) navTitle = this.chapter + ' · 刷题';

    this.setData({ navTitle });
    this.loadQuestions(this.chapter, this.topic);
  },

  // 调用 quiz 云函数加载题目列表（不返回答案/解析）
  loadQuestions(chapter, topic) {
    this.setData({ loading: true, loadError: false });
    wx.showLoading({ title: '加载中' });
    wx.cloud.callFunction({
      name: 'quiz',
      data: { action: 'list', chapter: chapter || '', topic: topic || '' }
    }).then(res => {
      wx.hideLoading();
      if (res.result.code === 0 && res.result.questions.length > 0) {
        this.setData({
          loading: false,
          questions: res.result.questions,
          current: 0,
          total: res.result.questions.length,
          currentQuestion: res.result.questions[0],
          answered: false,
          selectedOption: -1,
          correct: false,
          correctAnswer: '',
          explanation: ''
        });
      } else {
        this.setData({
          loading: false,
          loadError: false,
          emptyHint: '暂无题目',
          questions: [],
          total: 0,
          currentQuestion: null
        });
        wx.showToast({ title: '暂无题目', icon: 'none' });
      }
    }).catch(err => {
      wx.hideLoading();
      this.setData({
        loading: false,
        loadError: true,
        emptyHint: '加载失败',
        questions: [],
        total: 0,
        currentQuestion: null
      });
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  // 选择选项 → 调用 quiz 云函数 submit 判定正误
  selectOption(e) {
    if (this.data.answered) return;
    const index = e.currentTarget.dataset.index;
    const question = this.data.currentQuestion;
    if (!question || !question.options[index]) return;
    const userAnswer = question.options[index].key;

    this.setData({ selectedOption: index, answered: true });

    wx.cloud.callFunction({
      name: 'quiz',
      data: { action: 'submit', questionId: question.questionId, userAnswer }
    }).then(res => {
      if (res.result.code === 0) {
        this.setData({
          correct: res.result.correct,
          correctAnswer: res.result.answer,
          explanation: res.result.explanation
        });
        // 答错时自动保存到错题本
        if (!res.result.correct) {
          this.saveToMistakes(question, userAnswer, res.result);
        }
      } else {
        // 云函数返回非 0，回退作答状态
        this.setData({ answered: false, selectedOption: -1 });
        wx.showToast({ title: res.result.msg || '判定失败', icon: 'none' });
      }
    }).catch(err => {
      // 判定失败，回退作答状态允许重试
      this.setData({ answered: false, selectedOption: -1 });
      wx.showToast({ title: '判定失败', icon: 'none' });
    });
  },

  // 下一题（从已加载的列表中取）
  nextQuestion() {
    const next = this.data.current + 1;
    if (next < this.data.total) {
      this.setData({
        current: next,
        currentQuestion: this.data.questions[next],
        answered: false,
        selectedOption: -1,
        correct: false,
        correctAnswer: '',
        explanation: ''
      });
      wx.pageScrollTo({ scrollTop: 0, duration: 200 });
    } else {
      wx.showToast({ title: '已是最后一题', icon: 'none' });
    }
  },

  // 答错时自动保存到错题本（使用真实 questionId，不传 userID）
  saveToMistakes(question, userAnswer, result) {
    wx.cloud.callFunction({
      name: 'mistakes',
      data: {
        action: 'add',
        questionId: question.questionId,
        stem: question.stem,
        options: question.options,
        userAnswer: userAnswer,
        answer: result.answer,
        explanation: result.explanation,
        chapter: question.chapter,
        topic: question.topic
      }
    }).then(res => {
      if (res.result.code === 0) {
        wx.showToast({ title: '已加入错题本', icon: 'success' });
      }
    }).catch(() => {});
  },

  goBack() {
    wx.navigateBack();
  },

  // 下拉重试
  onRetry() {
    this.loadQuestions(this.chapter || '', this.topic || '');
  },

  // 更多操作
  showMore() {
    const that = this;
    wx.showActionSheet({
      itemList: ['查看解析', '分享题目', '举报错误'],
      success: function (res) {
        if (res.tapIndex === 0) {
          // 查看解析：若未作答则提示，已作答则滚动到解析区
          if (!that.data.answered) {
            wx.showToast({ title: '作答后即可查看解析', icon: 'none' });
          } else {
            wx.pageScrollTo({ scrollTop: 9999, duration: 200 });
          }
        } else {
          wx.showToast({ title: '功能开发中...', icon: 'none' });
        }
      }
    });
  },

  onShareAppMessage() {
    return { title: 'Bio - 高中生物学习助手', path: '/pages/home/home' };
  },

  onShareTimeline() {
    return { title: 'Bio - 高中生物学习助手' };
  }
});
