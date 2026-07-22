// pages/ai/ai.js
const app = getApp();
const { parseMarkdown } = require('../../utils/markdown.js');
const { addToNotebook } = require('../../utils/notebook.js');

// 系统提示词 - 定义AI生物老师角色（基于上下文数据回答）
const SYSTEM_PROMPT = `你是一位专业的高中生物老师，擅长用简洁清晰的方式解答生物问题。
你的任务是帮助学生理解生物概念、分析题目、提供学习建议。

如果下方提供了相关课程数据，请优先参考这些数据给出准确的解答。
如果没有提供相关数据，请基于你的生物学知识回答。

回答要求：
- 使用中文，语言亲切但专业
- 使用 Markdown 格式组织回答：要点用无序列表（- 开头），步骤用有序列表（1. 开头），重要概念用 **加粗**，小节标题用 ## 开头
- 涉及实验过程时描述关键步骤
- 鼓励学生思考，不要直接给出所有答案`;

// 工具调用界面标签映射
const TOOL_LABELS = {
  search_courses_lessons: '搜索课程',
  query_progress: '查询进度',
  query_mistakes: '查询错题',
  get_quiz: '获取题目',
  generate_quiz: '出题'
};

// 构建工具调用配置（Function Calling）
// 需传入 page 实例 self 与当前 AI 消息索引 aiMsgIndex，
// 以便工具执行时实时更新该消息的工具调用状态框（calling → done）
// 提供商必须为 cloudbase（hunyuan-v3 免费体验版不支持工具调用）
function buildAITools(self, aiMsgIndex) {
  // 设置当前消息的工具调用状态，status: 'calling' | 'done'
  function setTool(name, status) {
    self.setData({
      ['messages[' + aiMsgIndex + '].toolCall']: {
        name: name,
        label: TOOL_LABELS[name] || name,
        status: status
      }
    });
  }
  return {
    autoExecute: true,
    maxStep: 5,
    list: [
      {
        name: 'search_courses_lessons',
        description: '搜索课程和课时信息。当用户询问某个知识点、课程或章节相关内容时调用，返回匹配的课程和课时列表。',
        parameters: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: '搜索关键词，如知识点名称、课程名或章节名' }
          },
          required: ['keyword']
        },
        fn: function (args) {
          var keyword = (args && args.keyword) || '';
          setTool('search_courses_lessons', 'calling');
          return wx.cloud.callFunction({
            name: 'aiChat',
            data: { action: 'toolQuery', tool: 'search_courses_lessons', keyword: keyword }
          }).then(function (res) {
            setTool('search_courses_lessons', 'done');
            return JSON.stringify(res.result || {});
          }).catch(function (err) {
            setTool('search_courses_lessons', 'done');
            throw err;
          });
        }
      },
      {
        name: 'query_progress',
        description: '查询当前登录用户的学习进度，包括已学课时数、总课时数、完成百分比、最近学习的章节。',
        parameters: { type: 'object', properties: {} },
        fn: function () {
          setTool('query_progress', 'calling');
          return wx.cloud.callFunction({
            name: 'aiChat',
            data: { action: 'toolQuery', tool: 'query_progress' }
          }).then(function (res) {
            setTool('query_progress', 'done');
            return JSON.stringify(res.result || {});
          }).catch(function (err) {
            setTool('query_progress', 'done');
            throw err;
          });
        }
      },
      {
        name: 'query_mistakes',
        description: '查询当前用户的错题本，返回最近的错题列表（含用户作答、正确答案和解析）。',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: '返回错题数量，默认5，最多20' }
          }
        },
        fn: function (args) {
          var limit = (args && args.limit) || 5;
          setTool('query_mistakes', 'calling');
          return wx.cloud.callFunction({
            name: 'aiChat',
            data: { action: 'toolQuery', tool: 'query_mistakes', limit: limit }
          }).then(function (res) {
            setTool('query_mistakes', 'done');
            return JSON.stringify(res.result || {});
          }).catch(function (err) {
            setTool('query_mistakes', 'done');
            throw err;
          });
        }
      },
      {
        name: 'get_quiz',
        description: '按章节或考点获取练习题（含答案与解析），供讲解分析题目使用。',
        parameters: {
          type: 'object',
          properties: {
            chapter: { type: 'string', description: '章节名称，如"必修一"' },
            topic: { type: 'string', description: '考点名称' },
            limit: { type: 'number', description: '题目数量，默认3，最多10' }
          }
        },
        fn: function (args) {
          args = args || {};
          setTool('get_quiz', 'calling');
          return wx.cloud.callFunction({
            name: 'aiChat',
            data: { action: 'toolQuery', tool: 'get_quiz', chapter: args.chapter || '', topic: args.topic || '', limit: args.limit || 3 }
          }).then(function (res) {
            setTool('get_quiz', 'done');
            return JSON.stringify(res.result || {});
          }).catch(function (err) {
            setTool('get_quiz', 'done');
            throw err;
          });
        }
      },
      {
        name: 'generate_quiz',
        description: '根据知识点为学生出练习题（从题库随机抽取）。当学生说"出题""做题""练一练"时调用。',
        parameters: {
          type: 'object',
          properties: {
            topic: { type: 'string', description: '考点/知识点名称' },
            chapter: { type: 'string', description: '所属章节' },
            count: { type: 'number', description: '出题数量，默认3，最多10' }
          }
        },
        fn: function (args) {
          args = args || {};
          setTool('generate_quiz', 'calling');
          return wx.cloud.callFunction({
            name: 'aiChat',
            data: { action: 'toolQuery', tool: 'generate_quiz', topic: args.topic || '', chapter: args.chapter || '', count: args.count || 3 }
          }).then(function (res) {
            setTool('generate_quiz', 'done');
            return JSON.stringify(res.result || {});
          }).catch(function (err) {
            setTool('generate_quiz', 'done');
            throw err;
          });
        }
      }
    ],
    onToolEvent: function (e) {
      console.log('[AI tool]', e);
    }
  };
}

// 最大保留的对话轮数（避免token超限）
const MAX_HISTORY_ROUNDS = 10;
// 单会话云端最多保留的消息条数（超出截断最旧）
const MAX_SESSION_MESSAGES = 100;
// 会话列表加载数量
const SESSIONS_LIMIT = 20;
// 欢迎语文案（不持久化，无 ts 标记）
const WELCOME_TEXT = '同学你好！我是AI生物老师\n有任何生物问题都可以问我，比如知识点讲解、题目解析、实验设计等～';

// 生成带 Markdown 块的欢迎语消息（ts:-1 表示不持久化的欢迎语，避免与流式占位 ts:0 冲突）
function welcomeMsg() {
  return { role: 'ai', content: WELCOME_TEXT, blocks: parseMarkdown(WELCOME_TEXT), ts: -1 };
}

// 相对时间格式化：刚刚 / x分钟前 / x小时前 / 昨天 / MM-DD
function formatRelativeTime(ts) {
  if (!ts) return '';
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / 3600000) + '小时前';
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (d >= yesterday) return '昨天';
  const pad = function(n) { return n < 10 ? '0' + n : '' + n; };
  return pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

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
    messages: [welcomeMsg()],
    chatHistory: [],
    userAvatar: '',       // 当前登录用户头像（云文件 fileID 或网络 URL），空则显示默认图标
    // 会话管理
    sessionId: '',        // 当前会话 _id，空串表示未保存的新会话
    sessions: [],         // 会话列表 [{_id, title, updatedAt, timeText}]
    showHistory: false    // 历史抽屉显隐
  },

  onLoad(options) {
    const sys = wx.getSystemInfoSync();
    const info = wx.getStorageSync('userInfo');
    this.setData({
      statusBarHeight: sys.statusBarHeight,
      userAvatar: (info && info.avatar) || ''
    });
    // 预填问题（从知识点页面 askAI 跳转传来）
    if (options && options.question) {
      const question = decodeURIComponent(options.question);
      this.setData({ inputValue: question });
      this.loadSessions(false);
      this.sendMessage();
    } else {
      this.loadSessions(true);
    }
  },

  // 返回上一页；页面栈为空时兜底回 AI 入口页
  onBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack();
    } else {
      wx.switchTab({ url: '/pages/home/home' });
    }
  },

  onInput(e) {
    this.setData({ inputValue: e.detail.value });
  },

  // ---------- 会话管理 ----------

  // 加载会话列表；openLatest=true 时自动打开最近会话（仅页面首载）
  async loadSessions(openLatest) {
    // 会话列表为用户数据：未登录不加载
    if (!app.globalData.isLoggedIn) {
      this.setData({ sessions: [] });
      return;
    }
    try {
      const res = await wx.cloud.callFunction({
        name: 'aiChat',
        data: { action: 'listSessions' }
      });
      const rawSessions = (res.result && res.result.sessions) || [];
      const sessions = rawSessions.map(function(s) {
        return {
          _id: s._id,
          title: s.title || '未命名对话',
          updatedAt: s.updatedAt,
          timeText: formatRelativeTime(s.updatedAt)
        };
      });
      this.setData({ sessions });
      if (openLatest && sessions.length > 0) {
        this.openSessionById(sessions[0]._id);
      }
    } catch (err) {
      console.error('loadSessions error:', err);
    }
  },

  // 打开指定会话：加载消息并重建模型上下文
  async openSessionById(id) {
    if (this.data.isStreaming) return;
    try {
      const res = await wx.cloud.callFunction({
        name: 'aiChat',
        data: { action: 'getSession', sessionId: id }
      });
      const session = (res.result && res.result.session) || {};
      const cloudMsgs = session.messages || [];
      const messages = cloudMsgs.map(function(m) {
        return {
          role: m.role,
          content: m.content,
          ts: m.ts,
          blocks: m.role === 'ai' ? parseMarkdown(m.content) : null,
          toolCall: null
        };
      });
      // 重建模型对话上下文（ai -> assistant）
      const chatHistory = cloudMsgs.map(function(m) {
        return { role: m.role === 'ai' ? 'assistant' : 'user', content: m.content };
      }).slice(-MAX_HISTORY_ROUNDS * 2);

      this.setData({
        sessionId: id,
        messages: messages.length ? messages : [welcomeMsg()],
        chatHistory: chatHistory,
        showHistory: false,
        scrollIntoView: ''
      });
      if (messages.length) this.scrollToBottom();
    } catch (err) {
      console.error('openSession error:', err);
      wx.showToast({ title: '会话加载失败', icon: 'none' });
    }
  },

  // 点击会话列表项
  onTapSession(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || id === this.data.sessionId) {
      this.setData({ showHistory: false });
      return;
    }
    this.openSessionById(id);
  },

  // 新建对话
  onNewChat() {
    if (this.data.isStreaming) return;
    this.setData({
      sessionId: '',
      messages: [welcomeMsg()],
      chatHistory: [],
      showHistory: false,
      scrollIntoView: ''
    });
  },

  // 历史抽屉开关（打开时刷新列表）
  onToggleHistory() {
    const show = !this.data.showHistory;
    this.setData({ showHistory: show });
    if (show) this.loadSessions(false);
  },

  onCloseHistory() {
    this.setData({ showHistory: false });
  },

  // 清空当前会话消息（会话保留）
  onClearChat() {
    if (this.data.isStreaming) return;
    const hasRealMsg = this.data.messages.some(function(m) { return !!m.ts; });
    if (!hasRealMsg) return;
    wx.showModal({
      title: '清空对话',
      content: '确定清空当前对话的所有消息吗？',
      confirmText: '清空',
      confirmColor: '#EE8888',
      success: (res) => {
        if (!res.confirm) return;
        this.setData({
          messages: [welcomeMsg()],
          chatHistory: [],
          scrollIntoView: ''
        });
        if (this.data.sessionId) {
          wx.cloud.callFunction({
            name: 'aiChat',
            data: { action: 'clearSession', sessionId: this.data.sessionId }
          }).catch(function(err) {
            console.error('clear session error:', err);
          });
        }
      }
    });
  },

  // 将本地真实消息（带 ts）整体同步到云端；返回是否为新创建的会话
  async persistSession() {
    const realMsgs = this.data.messages
      .filter(function(m) { return !!m.ts; })
      .map(function(m) { return { role: m.role, content: m.content, ts: m.ts }; })
      .slice(-MAX_SESSION_MESSAGES);
    try {
      const res = await wx.cloud.callFunction({
        name: 'aiChat',
        data: {
          action: 'saveSession',
          sessionId: this.data.sessionId || '',
          title: this.data.sessionId ? '' : '新对话',
          messages: realMsgs
        }
      });
      if (res.result && res.result.code === 0) {
        if (!this.data.sessionId) {
          this.setData({ sessionId: res.result.sessionId });
          return true;
        }
      }
      return false;
    } catch (err) {
      console.error('persistSession error:', err);
      return false;
    }
  },

  // AI 总结会话标题（首轮对话后调用），失败降级为截取问题
  async summarizeTitle(question) {
    const fallback = question.slice(0, 15);
    try {
      const model = wx.cloud.extend.AI.createModel('cloudbase');
      let title = '';
      await model.streamText({
        data: {
          model: 'hy3',
          messages: [
            { role: 'system', content: '你是标题生成器。根据用户的问题生成一个10个字以内的简短主题标题，只输出标题本身，不要标点符号和任何解释。' },
            { role: 'user', content: question }
          ]
        },
        onText: function(delta) { title += delta; },
        onFinish: function(finalText) { title = finalText || title; }
      });
      title = String(title || '').trim().replace(/[\s"'“”《》.。,，!！?？:：]/g, '').slice(0, 15);
      return title || fallback;
    } catch (err) {
      console.error('summarizeTitle error:', err);
      return fallback;
    }
  },

  // 更新会话标题（云端 + 本地列表）
  async updateSessionTitle(title) {
    if (!this.data.sessionId) return;
    try {
      const res = await wx.cloud.callFunction({
        name: 'aiChat',
        data: { action: 'updateTitle', sessionId: this.data.sessionId, title: title }
      });
      if (res.result && res.result.code === 0) {
        const sessions = this.data.sessions.map(function(s) {
          return s._id === this.data.sessionId ? Object.assign({}, s, { title: title }) : s;
        }, this);
        this.setData({ sessions });
      }
    } catch (err) {
      console.error('updateSessionTitle error:', err);
    }
  },

  scrollToBottom() {
    const lastIndex = this.data.messages.length - 1;
    if (lastIndex < 0) return;
    setTimeout(() => {
      this.setData({ scrollIntoView: 'msg-' + lastIndex });
    }, 50);
  },

  // ---------- RAG 上下文匹配 ----------

  // 调用云函数匹配相关课程/课时/题目，返回增强 system prompt 字符串
  async matchContext(text) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'aiChat',
        data: { action: 'matchContext', text: text }
      });
      if (res.result && res.result.code === 0) {
        return res.result.systemPrompt || '';
      }
      return '';
    } catch (err) {
      console.error('matchContext error:', err);
      return '';
    }
  },

  // ---------- 消息发送 ----------

  async sendMessage() {
    const text = this.data.inputValue.trim();
    if (!text || this.data.isStreaming) return;

    // 登录拦截：AI 会话会持久化为用户数据，未登录提示并跳转登录页
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录后再提问', icon: 'none' });
      setTimeout(() => {
        wx.navigateTo({ url: '/pages/login/login' });
      }, 1000);
      return;
    }

    // 检查AI能力是否可用
    if (!wx.cloud || !wx.cloud.extend || !wx.cloud.extend.AI) {
      wx.showToast({ title: '当前基础库版本不支持AI能力，需≥3.15.1', icon: 'none', duration: 3000 });
      return;
    }

    // 添加用户消息 + AI占位消息到界面
    const now = Date.now();
    const userMsg = { role: 'user', content: text, ts: now };
    const aiMsgIndex = this.data.messages.length + 1;

    this.setData({
      messages: [...this.data.messages, userMsg, { role: 'ai', content: '', blocks: [], ts: 0, toolCall: null }],
      inputValue: '',
      isStreaming: true,
      scrollIntoView: 'msg-' + aiMsgIndex
    });

    // RAG: 调用云函数匹配上下文，获取增强 system prompt
    const contextData = await this.matchContext(text);
    const systemMsg = SYSTEM_PROMPT + (contextData || '');

    // 构建对话历史（system + 最近N轮 + 当前消息）
    const recentHistory = this.data.chatHistory.slice(-MAX_HISTORY_ROUNDS * 2);
    const messages = [
      { role: 'system', content: systemMsg },
      ...recentHistory,
      { role: 'user', content: text }
    ];

    let fullText = '';
    const self = this;
    const token = { aborted: false };
    this._activeToken = token;
    this._lastUpdateTime = 0;

    try {
      // 模型提供商：cloudbase（支持 Function Calling 工具调用）
      // hy3 为混元模型，需在云开发控制台→AI+→大模型页面开通
      const model = wx.cloud.extend.AI.createModel('cloudbase');

      await model.streamText({
        data: {
          model: 'hy3',
          messages
        },
        tools: buildAITools(self, aiMsgIndex),
        onText: function(delta) {
          if (token.aborted) return;
          var wasEmpty = !fullText;
          fullText += delta;
          // 节流：仅每 150ms setData 一次 content，期间不调用 parseMarkdown
          var t = Date.now();
          if (t - self._lastUpdateTime > 150) {
            self._lastUpdateTime = t;
            var update = { ['messages[' + aiMsgIndex + '].content']: fullText };
            // 文本首次开始输出时，隐藏工具调用框
            if (wasEmpty) {
              update['messages[' + aiMsgIndex + '].toolCall'] = null;
            }
            self.setData(update);
          }
        },
        onFinish: function(finalText) {
          if (token.aborted) return;
          // onFinish 全量解析
          fullText = finalText || fullText;
          self.setData({
            ['messages[' + aiMsgIndex + '].content']: fullText,
            ['messages[' + aiMsgIndex + '].blocks']: parseMarkdown(fullText),
            ['messages[' + aiMsgIndex + '].toolCall']: null
          });
        }
      });

      // 流式完成 - 全量解析并更新状态和历史
      if (token.aborted) {
        if (self._activeToken === token) {
          self.setData({ isStreaming: false });
        }
        return;
      }
      self.setData({
        ['messages[' + aiMsgIndex + '].content']: fullText,
        ['messages[' + aiMsgIndex + '].blocks']: parseMarkdown(fullText),
        ['messages[' + aiMsgIndex + '].ts']: Date.now(),
        ['messages[' + aiMsgIndex + '].toolCall']: null,
        isStreaming: false
      });

      if (fullText) {
        let newHistory = self.data.chatHistory.concat([
          { role: 'user', content: text },
          { role: 'assistant', content: fullText }
        ]);
        if (newHistory.length > MAX_HISTORY_ROUNDS * 2) {
          newHistory = newHistory.slice(-MAX_HISTORY_ROUNDS * 2);
        }
        self.setData({ chatHistory: newHistory });

        // 持久化到云端；新会话则异步生成 AI 标题
        const isNewSession = await self.persistSession();
        if (isNewSession) {
          const title = await self.summarizeTitle(text);
          await self.updateSessionTitle(title);
          self.loadSessions(false);
        }
      }
    } catch (err) {
      console.error('AI stream error:', err);
      const errStr = String(err && (err.errMsg || err.message) || '');
      let hint = '';
      if (errStr.includes('403')) {
        hint = '\n\n（403权限不足：工具调用需使用 cloudbase 提供商的 hy3 模型，请到云开发控制台→AI+→大模型页面开通）';
      } else if (errStr.includes('429')) {
        hint = '\n\n（429请求过多：免费额度可能已用尽，请稍后重试或配置API Key）';
      }
      const errorMsg = fullText
        ? fullText
        : '抱歉，回复出错了，请稍后重试~' + hint;
      if (token.aborted) {
        if (self._activeToken === token) {
          self.setData({ isStreaming: false });
        }
        return;
      }
      self.setData({
        ['messages[' + aiMsgIndex + '].content']: errorMsg,
        ['messages[' + aiMsgIndex + '].blocks']: parseMarkdown(errorMsg),
        ['messages[' + aiMsgIndex + '].ts']: Date.now(),
        ['messages[' + aiMsgIndex + '].toolCall']: null,
        isStreaming: false
      });
    }
  },

  // 停止生成：设置取消标志位，onText 将不再处理新文本
  onStopGenerate() {
    if (this._activeToken) {
      this._activeToken.aborted = true;
    }
    this.setData({ isStreaming: false });
  },

  // 点击 Markdown 链接：小程序内不支持打开外部链接
  onTapLink(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.showToast({ title: '小程序内暂不支持打开链接', icon: 'none' });
  },

  // 收录AI回答到笔记本
  addAiMsgToNotebook(e) {
    var idx = e.currentTarget.dataset.index;
    var msg = this.data.messages[idx];
    if (!msg || msg.role !== 'ai' || !msg.content) return;
    // 取上一条用户提问作为标题
    var title = 'AI回答';
    if (idx > 0 && this.data.messages[idx - 1] && this.data.messages[idx - 1].role === 'user') {
      title = this.data.messages[idx - 1].content.slice(0, 50);
    }
    addToNotebook({
      type: 'ai',
      source: 'ai',
      refId: 'aimsg_' + msg.ts,
      title: title,
      content: msg.content
    });
  },

  sendSuggestion(e) {
    const text = e.currentTarget.dataset.text;
    if (this.data.isStreaming) return;
    this.setData({ inputValue: text });
    this.sendMessage();
  },

  onShareAppMessage() {
    return { title: 'Bio - 高中生物学习助手', path: '/pages/home/home' };
  },

  onShareTimeline() {
    return { title: 'Bio - 高中生物学习助手' };
  }
});
