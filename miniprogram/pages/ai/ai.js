// pages/ai/ai.js
Page({
  data: {
    statusBarHeight: 20,
    inputValue: '',
    scrollIntoView: '',
    suggestions: [
      '什么是光合作用？',
      'DNA复制的特点',
      '减数分裂与有丝分裂的区别',
      '生态系统的能量流动'
    ],
    messages: [
      {
        role: 'ai',
        content: '同学你好！我是AI生物老师\n有任何生物问题都可以问我，比如知识点讲解、题目解析、实验设计等～'
      }
    ]
  },

  onLoad() {
    const sys = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: sys.statusBarHeight });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
  },

  onInput(e) {
    this.setData({ inputValue: e.detail.value });
  },

  sendMessage() {
    const text = this.data.inputValue.trim();
    if (!text) return;

    const userMsg = { role: 'user', content: text };
    const aiReply = {
      role: 'ai',
      content: this.getMockReply(text)
    };

    this.setData({
      messages: [...this.data.messages, userMsg, aiReply],
      inputValue: '',
      scrollIntoView: 'msg-' + (this.data.messages.length + 1)
    });
  },

  sendSuggestion(e) {
    const text = e.currentTarget.dataset.text;
    this.setData({ inputValue: text });
    this.sendMessage();
  },

  getMockReply(question) {
    const replies = {
      '光合作用': '光合作用是绿色植物通过叶绿体，利用光能，把二氧化碳和水转化成储存能量的有机物，并释放氧气的过程。\n\n• 场所：叶绿体\n• 反应：光反应（类囊体薄膜）+ 暗反应（叶绿体基质）\n• 意义：制造有机物、转化太阳能、维持碳氧平衡',
      'DNA': 'DNA复制是指以亲代DNA分子为模板合成子代DNA的过程。\n\n• 方式：半保留复制\n• 时间：有丝分裂间期 / 减数第一次分裂前的间期\n• 条件：模板、原料（4种脱氧核苷酸）、酶（解旋酶、DNA聚合酶等）、能量（ATP）\n• 特点：边解旋边复制、半保留复制',
      '减数分裂': '减数分裂与有丝分裂的主要区别：\n\n• 染色体复制：两者都在分裂前的间期复制\n• 分裂次数：减数分裂连续分裂2次，有丝分裂分裂1次\n• 子细胞数：减数分裂产生4个，有丝分裂产生2个\n• 染色体数：减数分裂减半，有丝分裂不变\n• 意义：减数分裂用于有性生殖，有丝分裂用于体细胞增殖'
    };

    for (const key in replies) {
      if (question.includes(key)) {
        return replies[key];
      }
    }

    return '这是一个很好的问题！\n\n让我帮你分析一下：\n1. 首先要明确相关概念的定义\n2. 然后理解其生理过程和机制\n3. 最后联系实际应用和考点\n\n你可以尝试在"刷题练习"中找到相关题目来巩固这个知识点哦～';
  }
});
