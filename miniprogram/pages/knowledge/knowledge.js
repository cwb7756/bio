// pages/knowledge/knowledge.js
const app = getApp();
const { parseMarkdown } = require('../../utils/markdown.js');
const { addToNotebook } = require('../../utils/notebook.js');

// 系统提示词 - 定义AI生物老师角色
const SYSTEM_PROMPT = `你是一位专业的高中生物老师，擅长用简洁清晰的方式解答生物问题。
你的任务是帮助学生理解生物概念、分析题目、提供学习建议。

如果下方提供了相关课程数据，请优先参考这些数据给出准确的解答。
如果没有提供相关数据，请基于你的生物学知识回答。

回答要求：
- 使用中文，语言亲切但专业
- 使用 Markdown 格式组织回答：要点用无序列表（- 开头），步骤用有序列表（1. 开头），重要概念用 **加粗**，小节标题用 ## 开头
- 涉及实验过程时描述关键步骤
- 鼓励学生思考，不要直接给出所有答案`;

Page({
  data: {
    statusBarHeight: 20,
    courseId: '',
    kpId: '',
    course: null,
    knowledgePoints: [],
    bookmarked: false,
    loading: true,
    loadError: false,
    // AI 悬浮框
    floatVisible: false,
    floatPhase: 'select',     // 'select' | 'chat'
    floatTop: 0,
    floatLeft: 0,
    floatScrollIntoView: '',
    selectedKpId: '',
    selectedKp: null,
    aiContent: '',
    aiBlocks: [],
    aiStreaming: false,
    aiError: false,
    // 缩放
    floatWidth: 0,
    floatHeight: 0,
    floatResizing: false
  },

  onLoad(options) {
    const sys = wx.getSystemInfoSync();
    // 悬浮框初始位置：状态栏下方居中
    const marginPx = Math.round(18 * sys.windowWidth / 750);
    this.setData({
      statusBarHeight: sys.statusBarHeight,
      // 兜底默认课程，与 map 页面保持一致；避免从首页"知识图解"入口进入时因缺 courseId 直接显示加载失败
      courseId: (options && options.courseId) || 'course_required_1',
      kpId: (options && options.kpId) || '',
      floatTop: sys.statusBarHeight + 50,
      floatLeft: marginPx
    });
    this._windowWidth = sys.windowWidth;
    this._windowHeight = sys.windowHeight;
    // 悬浮框初始尺寸
    this._floatInitWidth = sys.windowWidth - 2 * marginPx;
    this._floatInitHeight = Math.round(sys.windowHeight * 0.6);
    this.setData({
      floatWidth: this._floatInitWidth,
      floatHeight: this._floatInitHeight
    });
    this.loadDetail();
  },

  loadDetail() {
    if (!this.data.courseId) {
      this.setData({ loading: false, loadError: true });
      return;
    }
    this.setData({ loading: true, loadError: false });
    wx.cloud.callFunction({
      name: 'getCourseDetail',
      data: { courseId: this.data.courseId },
      success: (res) => {
        if (res.result && res.result.code === 0) {
          const { course, knowledgePoints } = res.result.data;
          const bookmarks = wx.getStorageSync('bookmarkedKPs') || [];
          const isBookmarked = bookmarks.indexOf(this.data.courseId) > -1;
          this.setData({ course, knowledgePoints, bookmarked: isBookmarked, loading: false }, () => {
            this.scrollToKp();
          });
        } else {
          this.setData({ loading: false, loadError: true });
        }
      },
      fail: (err) => {
        console.error('getCourseDetail error:', err);
        this.setData({ loading: false, loadError: true });
      }
    });
  },

  // kpId 锚点定位
  scrollToKp() {
    if (!this.data.kpId) return;
    setTimeout(() => {
      wx.pageScrollTo({
        selector: '#kp-' + this.data.kpId,
        duration: 300,
        fail: () => {}
      });
    }, 100);
  },

  // 去看课程
  goCourse() {
    wx.navigateTo({
      url: '/pages/course/course?courseId=' + this.data.courseId
    });
  },

  // 点击核心考点卡片 → 进入以该考点为中心的知识图谱画布页
  goKnowledgeGraph(e) {
    const kpId = e.currentTarget.dataset.id;
    if (!kpId) {
      wx.showToast({ title: '该考点暂无图解', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/knowledgeGraph/knowledgeGraph?courseId=' + this.data.courseId + '&kpId=' + kpId,
      fail: (err) => {
        console.error('navigate to knowledgeGraph failed:', err);
        wx.showToast({ title: '页面跳转失败', icon: 'none' });
      }
    });
  },

  goBack() {
    wx.navigateBack();
  },

  toggleBookmark() {
    const id = this.data.courseId;
    let bookmarks = wx.getStorageSync('bookmarkedKPs') || [];
    const index = bookmarks.indexOf(id);
    if (index > -1) {
      bookmarks.splice(index, 1);
      this.setData({ bookmarked: false });
      wx.showToast({ title: '已取消收藏', icon: 'none' });
    } else {
      bookmarks.push(id);
      this.setData({ bookmarked: true });
      wx.showToast({ title: '已收藏', icon: 'none' });
    }
    wx.setStorageSync('bookmarkedKPs', bookmarks);
  },

  addToCards() {
    // 登录拦截：闪卡为用户数据，未登录提示并跳转登录页
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录后再添加闪卡', icon: 'none' });
      setTimeout(() => {
        wx.navigateTo({ url: '/pages/login/login' });
      }, 1000);
      return;
    }
    const kp = this.data.knowledgePoints[0];
    const kpTitle = kp ? kp.title : (this.data.course ? this.data.course.title : '');
    const kpContent = kp ? kp.desc : '';
    if (!kpTitle) {
      wx.showToast({ title: '暂无可添加的知识点', icon: 'none' });
      return;
    }
    wx.cloud.callFunction({
      name: 'flashcards',
      data: {
        action: 'add',
        title: kpTitle,
        content: kpContent,
        chapter: ''
      },
      success: (res) => {
        if (res.result && res.result.code === 0) {
          wx.showToast({ title: '已添加到闪卡', icon: 'none' });
        } else {
          wx.showToast({ title: (res.result && res.result.msg) || '添加失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.showToast({ title: '网络异常', icon: 'none' });
      }
    });
  },

  // ========== AI 悬浮框 ==========

  askAI() {
    // 登录拦截
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录后再使用AI讲解', icon: 'none' });
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
    this.setData({
      floatVisible: true,
      floatPhase: 'select',
      selectedKpId: '',
      selectedKp: null,
      aiContent: '',
      aiBlocks: [],
      aiStreaming: false,
      aiError: false,
      floatWidth: this._floatInitWidth,
      floatHeight: this._floatInitHeight,
      floatResizing: false
    });
  },

  // 选择考点
  onSelectKp(e) {
    const id = e.currentTarget.dataset.id;
    const idx = e.currentTarget.dataset.index;
    const kp = this.data.knowledgePoints[idx];
    this.setData({ selectedKpId: id, selectedKp: kp });
  },

  // 点击"AI讲"按钮，开始流式讲解
  async onStartAIExplain() {
    if (!this.data.selectedKp) return;
    this.setData({
      floatPhase: 'chat',
      aiContent: '',
      aiBlocks: [],
      aiStreaming: true,
      aiError: false,
      floatScrollIntoView: ''
    });

    const kp = this.data.selectedKp;
    const question = '请详细讲解以下高中生物考点：\n\n考点名称：' + kp.title + '\n考点描述：' + (kp.desc || '') + '\n\n请从基本概念、关键要点、常见考点和易错点等方面进行讲解。';

    // RAG: 调用云函数匹配上下文
    const contextData = await this.matchContext(kp.title);
    const systemMsg = SYSTEM_PROMPT + (contextData || '');

    let fullText = '';
    const self = this;
    const token = { aborted: false };
    this._floatToken = token;
    this._floatLastUpdate = 0;

    try {
      const model = wx.cloud.extend.AI.createModel('cloudbase');
      await model.streamText({
        data: {
          model: 'hy3',
          messages: [
            { role: 'system', content: systemMsg },
            { role: 'user', content: question }
          ]
        },
        onText: function(delta) {
          if (token.aborted) return;
          fullText += delta;
          var t = Date.now();
          if (t - self._floatLastUpdate > 150) {
            self._floatLastUpdate = t;
            self.setData({ aiContent: fullText });
            self._scrollFloatChat();
          }
        },
        onFinish: function(finalText) {
          if (token.aborted) return;
          fullText = finalText || fullText;
          self.setData({
            aiContent: fullText,
            aiBlocks: parseMarkdown(fullText),
            aiStreaming: false
          });
          self._scrollFloatChat();
        }
      });

      if (token.aborted) {
        if (self._floatToken === token) {
          self.setData({ aiStreaming: false });
        }
        return;
      }
      self.setData({
        aiContent: fullText,
        aiBlocks: parseMarkdown(fullText),
        aiStreaming: false
      });
    } catch (err) {
      console.error('float AI stream error:', err);
      if (token.aborted) return;
      const errStr = String(err && (err.errMsg || err.message) || '');
      let hint = '';
      if (errStr.includes('429')) {
        hint = '\n\n（429请求过多：免费额度可能已用尽，请稍后重试）';
      }
      const errorMsg = fullText ? fullText : '抱歉，讲解出错了，请稍后重试~' + hint;
      self.setData({
        aiContent: errorMsg,
        aiBlocks: parseMarkdown(errorMsg),
        aiStreaming: false,
        aiError: true
      });
    }
  },

  // 悬浮框对话区滚动到底部
  _scrollFloatChat() {
    setTimeout(() => {
      this.setData({ floatScrollIntoView: 'float-chat-bottom' });
    }, 50);
  },

  // 停止生成
  onStopFloatAI() {
    if (this._floatToken) {
      this._floatToken.aborted = true;
    }
    this.setData({ aiStreaming: false });
  },

  // 关闭悬浮框
  onCloseFloat() {
    if (this._floatToken) {
      this._floatToken.aborted = true;
    }
    this.setData({ floatVisible: false, aiStreaming: false });
  },

  // 从对话返回选考点
  onFloatBack() {
    if (this._floatToken) {
      this._floatToken.aborted = true;
    }
    this.setData({
      floatPhase: 'select',
      aiContent: '',
      aiBlocks: [],
      aiStreaming: false,
      aiError: false
    });
  },

  // 拖拽：触摸开始
  onFloatTouchStart(e) {
    const touch = e.touches[0];
    this._floatTouch = {
      startX: touch.clientX,
      startY: touch.clientY,
      panelTop: this.data.floatTop,
      panelLeft: this.data.floatLeft
    };
  },

  // 拖拽：触摸移动
  onFloatTouchMove(e) {
    if (!this._floatTouch) return;
    const touch = e.touches[0];
    const dx = touch.clientX - this._floatTouch.startX;
    const dy = touch.clientY - this._floatTouch.startY;
    let newTop = this._floatTouch.panelTop + dy;
    let newLeft = this._floatTouch.panelLeft + dx;
    // 约束在视口范围内
    const marginPx = Math.round(18 * this._windowWidth / 750);
    const panelWidth = this._windowWidth - 2 * marginPx;
    newTop = Math.max(this.data.statusBarHeight + 5, Math.min(this._windowHeight - 80, newTop));
    newLeft = Math.max(0, Math.min(this._windowWidth - panelWidth, newLeft));
    this.setData({ floatTop: newTop, floatLeft: newLeft });
  },

  // 拖拽：触摸结束
  onFloatTouchEnd() {
    this._floatTouch = null;
  },

  // ========== 缩放 ==========

  // 缩放：触摸开始
  onResizeStart(e) {
    const touch = e.touches[0];
    this._resizeTouch = {
      startX: touch.clientX,
      startY: touch.clientY,
      startWidth: this.data.floatWidth,
      startHeight: this.data.floatHeight
    };
    this.setData({ floatResizing: true });
  },

  // 缩放：触摸移动
  onResizeMove(e) {
    if (!this._resizeTouch) return;
    const touch = e.touches[0];
    const dx = touch.clientX - this._resizeTouch.startX;
    const dy = touch.clientY - this._resizeTouch.startY;
    let newWidth = this._resizeTouch.startWidth + dx;
    let newHeight = this._resizeTouch.startHeight + dy;
    // 最小约束
    const minW = 280;
    const minH = 300;
    // 最大约束
    const maxW = this._windowWidth - 10;
    const maxH = this._windowHeight - this.data.statusBarHeight - 20;
    newWidth = Math.max(minW, Math.min(maxW, newWidth));
    newHeight = Math.max(minH, Math.min(maxH, newHeight));
    this.setData({ floatWidth: newWidth, floatHeight: newHeight });
  },

  // 缩放：触摸结束
  onResizeEnd() {
    this._resizeTouch = null;
    this.setData({ floatResizing: false });
  },

  // RAG 上下文匹配（复用 ai.js 逻辑）
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

  // 收录知识点到笔记本
  addKpToNotebook(e) {
    var id = e.currentTarget.dataset.id;
    var kp = null;
    for (var i = 0; i < this.data.knowledgePoints.length; i++) {
      if (this.data.knowledgePoints[i]._id === id) {
        kp = this.data.knowledgePoints[i];
        break;
      }
    }
    if (!kp) return;
    addToNotebook({
      type: 'knowledge',
      source: 'knowledge',
      refId: kp._id,
      title: kp.title,
      content: kp.desc || '',
      meta: { courseId: this.data.courseId, chapter: this.data.course ? this.data.course.chapter : '' }
    });
  },

  // 收录AI回答到笔记本
  addAiToNotebook() {
    if (!this.data.aiContent || this.data.aiStreaming) return;
    var kp = this.data.selectedKp;
    addToNotebook({
      type: 'ai',
      source: 'knowledge',
      refId: 'kpai_' + (kp ? kp._id : this.data.courseId),
      title: kp ? ('AI讲解：' + kp.title) : 'AI知识点讲解',
      content: this.data.aiContent,
      meta: { courseId: this.data.courseId }
    });
  }
});
