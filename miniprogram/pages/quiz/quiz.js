// pages/quiz/quiz.js
Page({
  data: {
    statusBarHeight: 20,
    current: 3,
    total: 10,
    answered: true, // 是否已作答
    selectedOption: 2, // 用户选了C (index 2)
    question: {
      type: '选择题 · 自由组合定律',
      stem: '豌豆黄色(Y)对绿色(y)为显性，圆粒(R)对皱粒(r)为显性，两对基因独立遗传。基因型为 YyRr 的豌豆自交，后代中 黄圆：绿圆：黄皱：绿皱 的比例为？'
    },
    options: [
      { key: 'A', text: '1 : 1 : 1 : 1', correct: false },
      { key: 'B', text: '9 : 3 : 3 : 1', correct: true },
      { key: 'C', text: '3 : 1 : 3 : 1', correct: false },
      { key: 'D', text: '9 : 3 : 1 : 3', correct: false }
    ],
    aiSteps: [
      { num: 1, text: '两对等位基因独立遗传，遵循自由组合定律——诀窍是"先分开、再相乘"。' },
      { num: 2, text: 'Yy×Yy → 黄：绿 = 3：1；Rr×Rr → 圆：皱 = 3：1。' },
      { num: 3, text: '按题目顺序相乘：黄圆(3×3)：绿圆(1×3)：黄皱(3×1)：绿皱(1×1)。' }
    ],
    aiAnswer: '所以为 9 : 3 : 3 : 1，选 B。你错选了 C，是把两对性状的顺序弄反啦~'
  },

  onLoad() {
    const sys = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: sys.statusBarHeight });
  },

  goBack() {
    wx.navigateBack();
  },

  selectOption(e) {
    if (this.data.answered) return;
    const idx = e.currentTarget.dataset.index;
    this.setData({
      selectedOption: idx,
      answered: true
    });
  },

  // 收藏到错题本：调用 mistakes 云函数真实写入
  saveToMistakes() {
    const { question, options, selectedOption } = this.data;
    const info = wx.getStorageSync('userInfo') || {};
    const correctOpt = options.find((o) => o.correct);
    wx.cloud.callFunction({
      name: 'mistakes',
      data: {
        action: 'add',
        userID: info.userID || '',
        questionId: 'quiz_demo_1',
        chapter: '必修二',
        topic: '自由组合定律',
        stem: question.stem,
        options: options.map((o) => ({ key: o.key, text: o.text })),
        answer: correctOpt ? correctOpt.key : '',
        userAnswer: selectedOption >= 0 ? options[selectedOption].key : '',
        explanation: this.data.aiAnswer
      },
      success: (res) => {
        if (res.result && res.result.code === 0) {
          wx.showToast({ title: '已收藏到错题本', icon: 'none' });
        } else {
          wx.showToast({ title: (res.result && res.result.msg) || '收藏失败', icon: 'none' });
        }
      },
      fail: () => wx.showToast({ title: '网络异常', icon: 'none' })
    });
  },

  nextQuestion() {
    if (this.data.current < this.data.total) {
      wx.showToast({ title: '加载下一题...', icon: 'none' });
      // 模拟加载下一题
      this.setData({
        current: this.data.current + 1,
        answered: false,
        selectedOption: -1
      });
    } else {
      wx.showToast({ title: '已完成全部题目！', icon: 'none' });
    }
  },

  showMore() {
    wx.showActionSheet({
      itemList: ['查看解析', '分享题目', '举报错误'],
      success: function(res) {
        wx.showToast({ title: '功能开发中...', icon: 'none' });
      }
    });
  }
});
