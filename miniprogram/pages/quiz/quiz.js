// pages/quiz/quiz.js
const app = getApp();
const sound = require('../../utils/sound.js');

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
    explanation: '',
    // AI 拆解（答错时流式生成针对性解析）
    aiText: '',
    aiLoading: false,
    finishing: false
  },

  onLoad(options) {
    const sys = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: sys.statusBarHeight });

    // 登录拦截：刷题需上传用户数据（错题本/学习记录），未登录则跳转登录页
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

    // 作答记录与计时（不进 data，避免频繁 setData 开销）
    this.details = [];
    this.startTime = Date.now();

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
        this.details = [];
        this.startTime = Date.now();
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
          explanation: '',
          aiText: '',
          aiLoading: false,
          finishing: false
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
    }).catch(_err => {
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
    if (this.data.answered || this.data.finishing) return;
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
        const r = res.result;
        this.setData({
          correct: r.correct,
          correctAnswer: r.answer,
          explanation: r.explanation || ''
        });
        // 答题反馈音效
        sound.play(r.correct ? 'correct' : 'wrong');
        // 记录本题作答结果（供完成时汇总上传与总结页展示）
        this.details[this.data.current] = {
          questionId: question.questionId,
          stem: question.stem,
          options: question.options,
          type: question.type || '选择题',
          chapter: question.chapter || '',
          topic: question.topic || '',
          answer: r.answer,
          userAnswer: userAnswer,
          correct: !!r.correct,
          skipped: false,
          explanation: r.explanation || ''
        };
        if (!r.correct) {
          // 答错：保存错题本 + AI 老师自动生成针对性解析（把题目与用户所选传给 AI）
          this.saveToMistakes(question, userAnswer, r);
          this.generateAIExplain(question, userAnswer, r.answer);
        }
        // 答对：无需 AI 生成，直接展示题库解析
      } else {
        // 云函数返回非 0，回退作答状态
        this.setData({ answered: false, selectedOption: -1 });
        wx.showToast({ title: res.result.msg || '判定失败', icon: 'none' });
      }
    }).catch(_err => {
      // 判定失败，回退作答状态允许重试
      this.setData({ answered: false, selectedOption: -1 });
      wx.showToast({ title: '判定失败', icon: 'none' });
    });
  },

  // 答错时调用 AI 大模型流式生成针对性解析（真实 AI 数据，非题库静态文案）
  // 传入题干、全部选项、用户所选与正确答案，讲解错因与知识点
  generateAIExplain(question, userAnswer, correctAnswer) {
    // 中止上一题可能未完成的生成
    if (this._aiToken) this._aiToken.aborted = true;
    const token = { aborted: false };
    this._aiToken = token;

    // 基础库不支持 AI 能力时静默降级（展示题库解析）
    if (!wx.cloud || !wx.cloud.extend || !wx.cloud.extend.AI) {
      this.setData({ aiText: '', aiLoading: false });
      return;
    }

    this.setData({ aiText: '', aiLoading: true });

    const optionsText = (question.options || [])
      .map(o => o.key + '. ' + o.text)
      .join('\n');
    const picked = (question.options || []).find(o => o.key === userAnswer);
    const qIndex = this.data.current;
    const self = this;
    let fullText = '';
    let lastUpdate = 0;

    // 与 AI 答疑页一致：cloudbase 提供商 + hy3 模型
    const model = wx.cloud.extend.AI.createModel('cloudbase');
    model.streamText({
      data: {
        model: 'hy3',
        messages: [
          {
            role: 'system',
            content: '你是一位高中生物老师。学生答错了一道选择题，请针对性讲解。要求：\n1. 先点出学生错选该项的原因或常见误区\n2. 再讲清正确答案涉及的核心知识点\n3. 中文回答，150字以内，语气亲切鼓励，不使用 Markdown 标题和列表符号'
          },
          {
            role: 'user',
            content: '题目：' + question.stem +
              '\n\n选项：\n' + optionsText +
              '\n\n学生选择：' + userAnswer + (picked ? '（' + picked.text + '）' : '') +
              '\n正确答案：' + correctAnswer
          }
        ]
      },
      onText(delta) {
        if (token.aborted) return;
        fullText += delta;
        // 节流 setData，避免频繁渲染
        const now = Date.now();
        if (now - lastUpdate > 120) {
          lastUpdate = now;
          self.setData({ aiText: fullText });
        }
      },
      onFinish(finalText) {
        if (token.aborted) return;
        fullText = String(finalText || fullText || '').trim();
        self.setData({ aiText: fullText, aiLoading: false });
        if (fullText) {
          // AI 解析写入本题记录，并同步更新错题本解析
          const d = self.details[qIndex];
          if (d && d.questionId === question.questionId) {
            d.explanation = fullText;
            self.updateMistakeExplanation(question, d);
          }
        }
      }
    }).catch(err => {
      if (token.aborted) return;
      console.warn('AI 解析生成失败，降级为题库解析', err);
      self.setData({ aiText: '', aiLoading: false });
    });
  },

  // AI 解析生成完成后回写错题本（add 接口同题防重，走更新分支刷新解析）
  updateMistakeExplanation(question, detail) {
    wx.cloud.callFunction({
      name: 'mistakes',
      data: {
        action: 'add',
        questionId: question.questionId,
        stem: question.stem,
        options: question.options,
        userAnswer: detail.userAnswer,
        answer: detail.answer,
        explanation: detail.explanation,
        chapter: question.chapter,
        topic: question.topic
      }
    }).catch(() => {});
  },

  // 下一题；最后一题时触发完成上传
  nextQuestion() {
    if (this.data.finishing) return;
    // 当前题未作答 → 记为跳过
    if (!this.data.answered) {
      this.recordSkipped();
    }
    const next = this.data.current + 1;
    if (next < this.data.total) {
      sound.play('click');
      // 切换题目前中止 AI 生成
      if (this._aiToken) this._aiToken.aborted = true;
      this.setData({
        current: next,
        currentQuestion: this.data.questions[next],
        answered: false,
        selectedOption: -1,
        correct: false,
        correctAnswer: '',
        explanation: '',
        aiText: '',
        aiLoading: false
      });
      wx.pageScrollTo({ scrollTop: 0, duration: 200 });
    } else {
      this.finishQuiz();
    }
  },

  // 未作答直接下一题/完成 → 记录为跳过
  recordSkipped() {
    const q = this.data.currentQuestion;
    if (!q) return;
    this.details[this.data.current] = {
      questionId: q.questionId,
      stem: q.stem,
      options: q.options,
      type: q.type || '选择题',
      chapter: q.chapter || '',
      topic: q.topic || '',
      answer: '',
      userAnswer: '',
      correct: false,
      skipped: true,
      explanation: ''
    };
  },

  // 完成：汇总成绩 → 上传 study_progress → 跳转总结页
  finishQuiz() {
    if (this.data.finishing) return;
    this.setData({ finishing: true });
    if (this._aiToken) this._aiToken.aborted = true;

    // 按题序整理作答记录
    const details = [];
    for (let i = 0; i < this.data.total; i++) {
      if (this.details[i]) details.push(this.details[i]);
    }

    const answeredList = details.filter(d => !d.skipped);
    const correctCount = answeredList.filter(d => d.correct).length;
    const summary = {
      total: details.length,
      correct: correctCount,
      wrong: answeredList.length - correctCount,
      skipped: details.length - answeredList.length,
      accuracy: answeredList.length ? Math.round(correctCount / answeredList.length * 100) : 0,
      duration: Math.round((Date.now() - this.startTime) / 1000),
      details: details,
      offline: false
    };

    wx.showLoading({ title: '正在上传成绩', mask: true });
    const records = details.map(d => ({
      questionId: d.questionId,
      chapter: d.chapter,
      topic: d.topic,
      correct: d.correct,
      answered: !d.skipped
    }));

    const goSummary = () => {
      wx.hideLoading();
      app.globalData.quizSummary = summary;
      wx.redirectTo({ url: '/pages/quizSummary/quizSummary' });
    };

    wx.cloud.callFunction({
      name: 'quiz',
      data: { action: 'report', records: records }
    }).then(res => {
      if (res.result && res.result.code === 0) {
        // 回填未作答（跳过）题目的答案与解析，供总结页展示与收藏
        const answers = res.result.answers || {};
        summary.details.forEach(d => {
          if (d.skipped && answers[d.questionId]) {
            d.answer = answers[d.questionId].answer || '';
            d.explanation = answers[d.questionId].explanation || '';
          }
        });
      } else {
        // 上传失败不阻塞总结查看，标记离线提示
        summary.offline = true;
      }
      goSummary();
    }).catch(() => {
      summary.offline = true;
      goSummary();
    });
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
