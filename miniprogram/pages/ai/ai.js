// pages/ai/ai.js

// 系统提示词 - 定义AI生物老师角色（基于上下文数据回答）
const SYSTEM_PROMPT = `你是一位专业的高中生物老师，擅长用简洁清晰的方式解答生物问题。
你的任务是帮助学生理解生物概念、分析题目、提供学习建议。

如果下方提供了相关课程数据，请优先参考这些数据给出准确的解答。
如果没有提供相关数据，请基于你的生物学知识回答。

回答要求：
- 使用中文，语言亲切但专业
- 适当使用要点列表和换行提升可读性
- 涉及实验过程时描述关键步骤
- 鼓励学生思考，不要直接给出所有答案`;

// 最大保留的对话轮数（避免token超限）
const MAX_HISTORY_ROUNDS = 10;

Page({
  data: {
    statusBarHeight: 20,
    inputValue: '',
    scrollIntoView: '',
    isStreaming: false,
    suggestions: [
      '什么是光合作用？',
      'DNA复制的特点',
      '减数分裂与有丝分裂的区别',
      '我想做几道细胞相关的题',
      '我的学习进度怎么样？',
      '生态系统的能量流动'
    ],
    messages: [
      {
        role: 'ai',
        content: '同学你好！我是AI生物老师\n有任何生物问题都可以问我，比如知识点讲解、题目解析、实验设计等～'
      }
    ],
    chatHistory: []
  },

  onLoad() {
    const sys = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: sys.statusBarHeight });
    this.prefetchData();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
  },

  onInput(e) {
    this.setData({ inputValue: e.detail.value });
  },

  // 页面加载时预取课程/课时/题目数据
  async prefetchData() {
    try {
      const db = wx.cloud.database();
      const results = await Promise.all([
        db.collection('courses').limit(10).get(),
        db.collection('lessons').limit(50).get(),
        db.collection('quiz_questions').limit(20).get()
      ]);
      this.dbData = {
        courses: results[0].data,
        lessons: results[1].data,
        quizzes: results[2].data
      };
      console.log('prefetch done:', this.dbData.courses.length, 'courses,',
        this.dbData.lessons.length, 'lessons,', this.dbData.quizzes.length, 'quizzes');
    } catch (err) {
      console.error('prefetch error:', err);
      this.dbData = { courses: [], lessons: [], quizzes: [] };
    }
  },

  // 根据用户输入匹配相关课程/课时/题目，返回上下文字符串
  // 匹配策略：检查数据字段值是否作为关键词出现在用户输入中
  matchContext(text) {
    if (!this.dbData) return '';
    const lower = text.toLowerCase();
    const parts = [];

    // 辅助函数：检查字段值是否出现在用户输入中（至少2个字才匹配，避免单字误匹配）
    function fieldInText(fieldVal) {
      if (!fieldVal || fieldVal.length < 2) return false;
      return lower.indexOf(fieldVal.toLowerCase()) >= 0;
    }

    // 匹配课程（检查课程标题/标签/章节是否被用户提到）
    const mc = this.dbData.courses.filter(function(c) {
      return fieldInText(c.tag) || fieldInText(c.chapter) ||
             (c.title && c.title.length >= 2 && lower.indexOf(c.title.toLowerCase()) >= 0);
    });
    if (mc.length) {
      parts.push('相关课程：' + mc.map(function(c) {
        return c.title + '（' + c.chapter + '·' + c.tag + '，共' + c.totalLessons + '课时）';
      }).join('、'));
    }

    // 匹配课时（检查课时标题关键词是否被用户提到）
    const ml = this.dbData.lessons.filter(function(l) {
      if (!l.title) return false;
      // 去掉"第X课"前缀，提取核心关键词
      var kw = l.title.replace(/^第\d+课\s*/, '');
      return kw.length >= 2 && lower.indexOf(kw.toLowerCase()) >= 0;
    });
    if (ml.length) {
      parts.push('相关课时：' + ml.map(function(l) { return l.title; }).join('、'));
    }

    // 匹配题目（检查题目主题/章节是否被用户提到）
    const mq = this.dbData.quizzes.filter(function(q) {
      return fieldInText(q.topic) || fieldInText(q.chapter);
    });
    if (mq.length) {
      parts.push('相关练习题（共' + mq.length + '道）：\n' + mq.map(function(q, i) {
        var opts = q.options.map(function(o) { return o.key + '.' + o.text; }).join('  ');
        return (i + 1) + '. ' + q.stem + '\n   ' + opts + '\n   答案：' + q.answer + '，解析：' + q.explanation;
      }).join('\n'));
    }

    if (parts.length === 0) return '';
    return '\n\n以下是与本问题相关的课程内容数据，请参考：\n' + parts.join('\n');
  },

  async sendMessage() {
    const text = this.data.inputValue.trim();
    if (!text || this.data.isStreaming) return;

    // 检查AI能力是否可用
    if (!wx.cloud || !wx.cloud.extend || !wx.cloud.extend.AI) {
      wx.showToast({ title: '当前基础库版本不支持AI能力，需≥3.15.1', icon: 'none', duration: 3000 });
      return;
    }

    // 添加用户消息 + AI占位消息到界面
    const userMsg = { role: 'user', content: text };
    const aiMsgIndex = this.data.messages.length + 1;

    this.setData({
      messages: [...this.data.messages, userMsg, { role: 'ai', content: '' }],
      inputValue: '',
      isStreaming: true,
      scrollIntoView: 'msg-' + aiMsgIndex
    });

    // 匹配上下文数据并注入到 system prompt
    const contextData = this.matchContext(text);
    const systemMsg = SYSTEM_PROMPT + contextData;

    // 构建对话历史（system + 最近N轮 + 当前消息）
    const recentHistory = this.data.chatHistory.slice(-MAX_HISTORY_ROUNDS * 2);
    const messages = [
      { role: 'system', content: systemMsg },
      ...recentHistory,
      { role: 'user', content: text }
    ];

    let fullText = '';
    const self = this;

    try {
      // 模型提供商选择：
      // 'hunyuan-v3' - 仅供体验的模型（免费），支持 hy3-preview
      // 'cloudbase'  - 云开发售卖的模型（需开通资源包/配置API Key），支持 deepseek-v4-flash 等
      const model = wx.cloud.extend.AI.createModel('hunyuan-v3');

      await model.streamText({
        data: {
          model: 'hy3-preview',
          messages
        },
        onText: function(delta) {
          fullText += delta;
          self.setData({
            ['messages[' + aiMsgIndex + '].content']: fullText
          });
        },
        onFinish: function(finalText) {
          fullText = finalText || fullText;
          self.setData({
            ['messages[' + aiMsgIndex + '].content']: fullText
          });
        }
      });

      // 流式完成 - 更新状态和历史
      self.setData({ isStreaming: false });

      if (fullText) {
        let newHistory = self.data.chatHistory.concat([
          { role: 'user', content: text },
          { role: 'assistant', content: fullText }
        ]);
        if (newHistory.length > MAX_HISTORY_ROUNDS * 2) {
          newHistory = newHistory.slice(-MAX_HISTORY_ROUNDS * 2);
        }
        self.setData({ chatHistory: newHistory });
      }
    } catch (err) {
      console.error('AI stream error:', err);
      const errStr = String(err && (err.errMsg || err.message) || '');
      let hint = '';
      if (errStr.includes('403')) {
        hint = '\n\n（403权限不足：请到云开发控制台→AI+模块→大模型页面，配置API Key或开通资源包）';
      } else if (errStr.includes('429')) {
        hint = '\n\n（429请求过多：免费额度可能已用尽，请稍后重试或配置API Key）';
      }
      const errorMsg = fullText
        ? fullText
        : '抱歉，回复出错了，请稍后重试~' + hint;
      self.setData({
        ['messages[' + aiMsgIndex + '].content']: errorMsg,
        isStreaming: false
      });
    }
  },

  sendSuggestion(e) {
    const text = e.currentTarget.dataset.text;
    if (this.data.isStreaming) return;
    this.setData({ inputValue: text });
    this.sendMessage();
  }
});
