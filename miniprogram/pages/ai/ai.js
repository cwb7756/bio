// pages/ai/ai.js
const { parseMarkdown } = require('../../utils/markdown.js');

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
    // 会话管理
    sessionId: '',        // 当前会话 _id，空串表示未保存的新会话
    sessions: [],         // 会话列表 [{_id, title, updatedAt, timeText}]
    showHistory: false    // 历史抽屉显隐
  },

  onLoad(options) {
    const sys = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: sys.statusBarHeight });
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

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
  },

  onInput(e) {
    this.setData({ inputValue: e.detail.value });
  },

  // ---------- 会话管理 ----------

  // 加载会话列表；openLatest=true 时自动打开最近会话（仅页面首载）
  async loadSessions(openLatest) {
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
          blocks: m.role === 'ai' ? parseMarkdown(m.content) : null
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
      const model = wx.cloud.extend.AI.createModel('hunyuan-v3');
      let title = '';
      await model.streamText({
        data: {
          model: 'hy3-preview',
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
      messages: [...this.data.messages, userMsg, { role: 'ai', content: '', blocks: [], ts: 0 }],
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
          if (token.aborted) return;
          fullText += delta;
          // 节流：仅每 150ms setData 一次 content，期间不调用 parseMarkdown
          var t = Date.now();
          if (t - self._lastUpdateTime > 150) {
            self._lastUpdateTime = t;
            self.setData({
              ['messages[' + aiMsgIndex + '].content']: fullText
            });
          }
        },
        onFinish: function(finalText) {
          if (token.aborted) return;
          // onFinish 全量解析
          fullText = finalText || fullText;
          self.setData({
            ['messages[' + aiMsgIndex + '].content']: fullText,
            ['messages[' + aiMsgIndex + '].blocks']: parseMarkdown(fullText)
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
        hint = '\n\n（403权限不足：请到云开发控制台→AI+模块→大模型页面，配置API Key或开通资源包）';
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

  // 点击 Markdown 链接：复制 URL 到剪贴板
  onTapLink(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.setClipboardData({
      data: url,
      success: function() {
        wx.showToast({ title: '链接已复制', icon: 'success' });
      }
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
