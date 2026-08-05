// pages/notebook/notebook.js
const app = getApp();

// rpx 与 px 互转系数（在 onLoad 中按屏宽计算）
var RPT = 1;

// 网格吸附步长（rpx）
var GRID = 40;

Page({
  data: {
    statusBarHeight: 20,
    loading: true,
    notes: [],          // 含 pxX/pxY（像素坐标）的笔记列表
    isDemo: false,
    scrollHeight: 600,
    canvasWidth: 300,   // px
    canvasHeight: 1200, // px
    // 拖拽状态
    draggingId: '',
    // 类型映射
    typeLabel: {
      knowledge: '知识点',
      course: '课程',
      ai: 'AI回答',
      mistake: '错题'
    },
    typeIcon: {
      knowledge: 'ic-dna',
      course: 'ic-folder',
      ai: 'ic-bot',
      mistake: 'ic-close'
    },
    sourceLabel: {
      mistakes: '错题本',
      flashcards: '速记卡片',
      knowledge: '知识卡片',
      ai: 'AI答疑',
      study: '课程列表',
      course: '课程详情'
    }
  },

  onLoad() {
    var sys = wx.getSystemInfoSync();
    RPT = sys.windowWidth / 750;
    var navH = sys.statusBarHeight + 50; // 导航栏约50px
    var scrollH = sys.windowHeight - navH - 56; // 减工具栏约56px
    this.setData({
      statusBarHeight: sys.statusBarHeight,
      scrollHeight: scrollH,
      canvasWidth: sys.windowWidth
    });
    this._windowWidth = sys.windowWidth;
    this._windowHeight = sys.windowHeight;
  },

  onShow() {
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    this.loadNotes();
  },

  // 加载笔记列表
  loadNotes() {
    this.setData({ loading: true });
    var self = this;
    wx.cloud.callFunction({
      name: 'notebook',
      data: { action: 'list' },
      success: function (res) {
        if (res.result && res.result.code === 0) {
          var notes = (res.result.data && res.result.data.notes) || [];
          notes = notes.map(function (n) {
            n.pxX = Math.round(n.x * RPT);
            n.pxY = Math.round(n.y * RPT);
            return n;
          });
          self.setData({
            notes: notes,
            isDemo: res.result.data.isDemo,
            loading: false
          });
          self.updateCanvasHeight();
        } else {
          self.setData({ loading: false });
          wx.showToast({ title: '加载失败', icon: 'none' });
        }
      },
      fail: function (err) {
        console.error('notebook list error:', err);
        self.setData({ loading: false });
        wx.showToast({ title: '网络异常', icon: 'none' });
      }
    });
  },

  // 根据最低卡片动态扩展画布高度
  updateCanvasHeight() {
    var notes = this.data.notes;
    var maxY = 400;
    for (var i = 0; i < notes.length; i++) {
      var bottom = notes[i].pxY + 320; // 卡片预估高度
      if (bottom > maxY) maxY = bottom;
    }
    var h = Math.round(maxY * RPT);
    if (h < this.data.scrollHeight) h = this.data.scrollHeight;
    this.setData({ canvasHeight: h });
  },

  goBack() {
    wx.navigateBack();
  },

  // ===== 拖拽逻辑 =====

  onCardTouchStart(e) {
    var id = e.currentTarget.dataset.id;
    var note = this._findNote(id);
    if (!note) return;
    // 示例笔记不可拖动
    var isDemo = !!note.isDemo;

    var touch = e.touches[0];
    this._touchStart = {
      x: touch.clientX,
      y: touch.clientY,
      cardX: note.pxX,
      cardY: note.pxY,
      id: id,
      moved: false,
      timer: null
    };
    var self = this;
    // 长按 350ms 进入拖拽
    this._touchStart.timer = setTimeout(function () {
      if (!self._touchStart || self._touchStart.moved) return;
      if (isDemo) return; // 示例笔记不进入拖拽
      wx.vibrateShort({ type: 'light' });
      self.setData({ draggingId: id });
    }, 350);
  },

  onCardTouchMove(e) {
    if (!this._touchStart) return;
    var touch = e.touches[0];
    var dx = touch.clientX - this._touchStart.x;
    var dy = touch.clientY - this._touchStart.y;

    // 判断是否产生位移（区分点击与拖拽）
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
      this._touchStart.moved = true;
      // 清除长按定时器
      if (this._touchStart.timer) {
        clearTimeout(this._touchStart.timer);
        this._touchStart.timer = null;
      }
    }

    // 未进入拖拽模式时不处理
    if (!this.data.draggingId) return;

    var newX = this._touchStart.cardX + dx;
    var newY = this._touchStart.cardY + dy;
    // 边界限制
    if (newX < 0) newX = 0;
    if (newX > this._windowWidth - 160) newX = this._windowWidth - 160;
    if (newY < 0) newY = 0;

    // 实时更新位置
    var key = '';
    for (var i = 0; i < this.data.notes.length; i++) {
      if (this.data.notes[i]._id === this._touchStart.id) {
        key = 'notes[' + i + '].pxX';
        this.setData({
          [key]: Math.round(newX),
          ['notes[' + i + '].pxY']: Math.round(newY)
        });
        break;
      }
    }
  },

  onCardTouchEnd(_e) {
    if (!this._touchStart) return;
    // 清除长按定时器
    if (this._touchStart.timer) {
      clearTimeout(this._touchStart.timer);
      this._touchStart.timer = null;
    }

    var id = this._touchStart.id;
    var wasDragging = this.data.draggingId === id;
    var wasTap = !wasDragging && !this._touchStart.moved;
    this.setData({ draggingId: '' });

    if (wasDragging) {
      // 网格吸附：将 px 坐标按 GRID rpx 步长取整
      var note = this._findNote(id);
      if (!note) {
        this._touchStart = null;
        return;
      }
      var snapPx = GRID * RPT;
      var snappedX = Math.round(note.pxX / snapPx) * snapPx;
      var snappedY = Math.round(note.pxY / snapPx) * snapPx;
      if (snappedX < 0) snappedX = 0;
      if (snappedY < 0) snappedY = 0;

      // 更新 px 坐标 + rpx 坐标
      var rpxX = Math.round(snappedX / RPT);
      var rpxY = Math.round(snappedY / RPT);
      for (var i = 0; i < this.data.notes.length; i++) {
        if (this.data.notes[i]._id === id) {
          this.setData({
            ['notes[' + i + '].pxX']: snappedX,
            ['notes[' + i + '].pxY']: snappedY,
            ['notes[' + i + '].x']: rpxX,
            ['notes[' + i + '].y']: rpxY
          });
          break;
        }
      }
      // 防抖保存
      this._scheduleSave();
      this.updateCanvasHeight();
    }

    this._touchStart = null;

    // 轻点（无位移、未进入拖拽）→ 跳转至笔记出处
    if (wasTap) {
      this.goSourceById(id);
    }
  },

  // 防抖保存布局
  _scheduleSave() {
    var self = this;
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(function () {
      self.saveLayout();
    }, 800);
  },

  saveLayout() {
    var items = this.data.notes
      .filter(function (n) { return !n.isDemo; })
      .map(function (n) {
        return { id: n._id, x: n.x, y: n.y };
      });
    if (items.length === 0) return;
    wx.cloud.callFunction({
      name: 'notebook',
      data: { action: 'updateLayout', items: items },
      success: function () {},
      fail: function (err) { console.error('saveLayout error:', err); }
    });
  },

  // 自动整理：两列瀑布网格
  autoArrange() {
    var PAD = 30;
    var CARD_W = 320;
    var COL_GAP = 20;
    var ROW_H = 360;
    var notes = this.data.notes;
    var userNotes = notes.filter(function (n) { return !n.isDemo; });
    var demoNotes = notes.filter(function (n) { return n.isDemo; });
    var all = demoNotes.concat(userNotes);

    for (var i = 0; i < all.length; i++) {
      var col = i % 2;
      var row = Math.floor(i / 2);
      all[i].x = PAD + col * (CARD_W + COL_GAP);
      all[i].y = PAD + row * ROW_H;
      all[i].pxX = Math.round(all[i].x * RPT);
      all[i].pxY = Math.round(all[i].y * RPT);
    }

    this.setData({ notes: all });
    this.updateCanvasHeight();
    this.saveLayout();
    wx.showToast({ title: '已整理', icon: 'success' });
  },

  // 删除笔记
  removeNote(e) {
    var id = e.currentTarget.dataset.id;
    var self = this;
    wx.showModal({
      title: '提示',
      content: '确定从笔记本移除这条笔记吗？',
      success: function (r) {
        if (!r.confirm) return;
        wx.cloud.callFunction({
          name: 'notebook',
          data: { action: 'remove', noteId: id },
          success: function (res) {
            if (res.result && res.result.code === 0) {
              wx.showToast({ title: '已移除', icon: 'none' });
              self.loadNotes();
            } else {
              wx.showToast({ title: (res.result && res.result.msg) || '移除失败', icon: 'none' });
            }
          },
          fail: function () { wx.showToast({ title: '网络异常', icon: 'none' }); }
        });
      }
    });
  },

  // 课程笔记跳转
  goCourse(e) {
    var courseId = e.currentTarget.dataset.courseid;
    if (courseId) {
      wx.navigateTo({ url: '/pages/course/course?courseId=' + courseId });
    }
  },

  // 点击卡片 → 跳转至笔记出处页面
  goSourceById(id) {
    var note = this._findNote(id);
    if (!note) return;
    if (note.isDemo) {
      wx.showToast({ title: '示例笔记，收录真实内容后可跳转', icon: 'none' });
      return;
    }
    var url = this._buildSourceUrl(note);
    if (!url) {
      wx.showToast({ title: '暂无跳转出处', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: url,
      fail: function () { wx.showToast({ title: '页面跳转失败', icon: 'none' }); }
    });
  },

  // 根据笔记来源构建出处页面 URL
  _buildSourceUrl(note) {
    var meta = note.meta || {};
    if (note.source === 'course' || note.source === 'study') {
      var courseId = meta.courseId || note.refId;
      if (courseId) return '/pages/course/course?courseId=' + courseId;
    }
    if (note.source === 'knowledge') {
      var kUrl = '/pages/knowledge/knowledge?courseId=' + (meta.courseId || 'course_required_1');
      if (note.type === 'knowledge' && note.refId) kUrl += '&kpId=' + note.refId;
      return kUrl;
    }
    if (note.source === 'flashcards') {
      var fUrl = '/pages/flashcards/flashcards';
      if (meta.chapter) fUrl += '?chapter=' + encodeURIComponent(meta.chapter);
      return fUrl;
    }
    if (note.source === 'mistakes') {
      var mUrl = '/pages/mistakes/mistakes';
      if (note.refId) mUrl += '?questionId=' + note.refId;
      return mUrl;
    }
    return '';
  },

  // 无操作占位（拦截按钮触摸冒泡，避免触发卡片拖拽/跳转判定）
  noop() {},

  _findNote(id) {
    for (var i = 0; i < this.data.notes.length; i++) {
      if (this.data.notes[i]._id === id) return this.data.notes[i];
    }
    return null;
  },

  onShareAppMessage() {
    return { title: 'Bio - 高中生物学习助手', path: '/pages/home/home' };
  }
});
