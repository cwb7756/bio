// pages/knowledgeGraph/knowledgeGraph.js
// 知识图谱详情页：以选中的知识点为核心，画布式展开子知识点树形图
const app = getApp();

// 布局常量（单位 rpx）
const NODE_W = 220;
const NODE_H = 128;
const ROOT_W = 300;
const ROOT_H = 140;
const HGAP = 24;
const VGAP = 56;
const PAD = 50;

Page({
  data: {
    statusBarHeight: 20,
    courseId: '',
    kpId: '',
    loading: true,
    rootNode: null,
    visibleNodes: [],
    lines: [],
    rootX: 0,
    rootY: 0,
    canvasWidth: 750,
    canvasHeight: 600,
    doneCount: 0,
    totalCount: 0,
    // 详情面板
    showDetail: false,
    detailNode: null,
    selectedId: ''
  },

  onLoad(options) {
    const sys = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: sys.statusBarHeight,
      courseId: (options && options.courseId) || 'course_required_1',
      kpId: (options && options.kpId) || ''
    });
  },

  onShow() {
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录后查看知识图谱', icon: 'none' });
      setTimeout(() => {
        wx.navigateTo({ url: '/pages/login/login' });
      }, 1000);
      return;
    }
    if (this.data.kpId) {
      this.loadGraph();
    } else {
      this.setData({ loading: false });
      wx.showToast({ title: '缺少知识点参数', icon: 'none' });
    }
  },

  // 调用云函数获取子图谱数据
  loadGraph() {
    this.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'knowledgeMap',
      data: {
        action: 'getSubGraph',
        courseId: this.data.courseId,
        kpId: this.data.kpId
      },
      success: (res) => {
        if (res.result && res.result.code === 0) {
          const d = res.result.data;
          this._buildTree(d);
          this.renderGraph();
        } else {
          this.setData({ loading: false });
          wx.showToast({ title: (res.result && res.result.msg) || '加载失败', icon: 'none' });
        }
      },
      fail: (err) => {
        console.error('getSubGraph error:', err);
        this.setData({ loading: false });
        wx.showToast({ title: '网络异常', icon: 'none' });
      }
    });
  },

  // 从扁平节点数组构建树结构
  _buildTree(data) {
    this._rootNode = data.rootNode;
    this._nodeMap = {};
    data.nodes.forEach(n => {
      n.collapsed = false;
      n.children = [];
      this._nodeMap[n._id] = n;
    });
    // 建立 parent → children 关系
    data.nodes.forEach(n => {
      if (n.parentId && this._nodeMap[n.parentId]) {
        this._nodeMap[n.parentId].children.push(n);
      }
    });
    // 根级子节点（depth=0 且 parentId=null）
    this._rootNodes = (data.rootNodes || []).map(id => this._nodeMap[id]).filter(Boolean);
    this._allNodes = data.nodes;
  },

  // 渲染图谱：计算布局 → 生成连线 → 收集可见节点
  renderGraph() {
    // 1. 计算子树宽度
    this._rootNodes.forEach(node => this._calcSubtreeWidth(node));

    // 2. 计算总宽度
    const totalWidth = this._rootNodes.reduce((sum, node, i) => {
      return sum + node._subtreeWidth + (i > 0 ? HGAP : 0);
    }, 0);

    // 3. 根节点位置（顶部居中）
    const contentWidth = Math.max(totalWidth, ROOT_W);
    const rootCenterX = contentWidth / 2;
    const rootX = rootCenterX - ROOT_W / 2;
    const rootY = PAD;

    // 4. 子节点位置分配
    let startX = rootCenterX - totalWidth / 2;
    this._rootNodes.forEach((node, i) => {
      if (i > 0) startX += HGAP;
      const childCenterX = startX + node._subtreeWidth / 2;
      this._assignPos(node, childCenterX, rootY + ROOT_H + VGAP);
      startX += node._subtreeWidth;
    });

    // 5. 计算画布尺寸
    let maxDepth = 0;
    this._rootNodes.forEach(node => {
      const d = this._maxDepth(node, 1);
      if (d > maxDepth) maxDepth = d;
    });
    const canvasWidth = contentWidth + PAD * 2;
    const canvasHeight = rootY + ROOT_H + VGAP + maxDepth * (NODE_H + VGAP) + PAD + 60;

    // 6. 生成连线
    const lines = [];
    this._rootNodes.forEach(node => {
      this._addLine(lines, rootX + ROOT_W / 2, rootY + ROOT_H,
        node.x + NODE_W / 2, node.y);
    });
    this._rootNodes.forEach(node => this._addChildLines(lines, node));

    // 7. 收集可见节点
    const visibleNodes = [];
    this._rootNodes.forEach(node => this._collectVisible(node, visibleNodes));

    this.setData({
      rootNode: this._rootNode,
      visibleNodes,
      lines,
      rootX,
      rootY,
      canvasWidth,
      canvasHeight,
      doneCount: this._allNodes.filter(n => n.status === 'done').length,
      totalCount: this._allNodes.length,
      loading: false
    });
  },

  // 递归计算子树宽度
  _calcSubtreeWidth(node) {
    if (!node.children || node.children.length === 0 || node.collapsed) {
      node._subtreeWidth = NODE_W;
      return NODE_W;
    }
    let total = 0;
    node.children.forEach((child, i) => {
      this._calcSubtreeWidth(child);
      total += child._subtreeWidth;
      if (i > 0) total += HGAP;
    });
    node._subtreeWidth = Math.max(NODE_W, total);
    return node._subtreeWidth;
  },

  // 递归分配坐标
  _assignPos(node, centerX, y) {
    node.x = centerX - NODE_W / 2;
    node.y = y;
    if (node.children && node.children.length > 0 && !node.collapsed) {
      let startX = centerX - node._subtreeWidth / 2;
      node.children.forEach((child, i) => {
        if (i > 0) startX += HGAP;
        const childCenterX = startX + child._subtreeWidth / 2;
        this._assignPos(child, childCenterX, y + NODE_H + VGAP);
        startX += child._subtreeWidth;
      });
    }
  },

  // 递归求最大深度
  _maxDepth(node, depth) {
    if (!node.children || node.children.length === 0 || node.collapsed) return depth;
    let max = depth;
    node.children.forEach(child => {
      const d = this._maxDepth(child, depth + 1);
      if (d > max) max = d;
    });
    return max;
  },

  // 添加一条连线
  _addLine(lines, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    lines.push({ x: x1, y: y1, length: Math.round(length), angle: Math.round(angle * 10) / 10 });
  },

  // 递归添加子节点连线
  _addChildLines(lines, node) {
    if (node.children && node.children.length > 0 && !node.collapsed) {
      node.children.forEach(child => {
        this._addLine(lines, node.x + NODE_W / 2, node.y + NODE_H,
          child.x + NODE_W / 2, child.y);
        this._addChildLines(lines, child);
      });
    }
  },

  // 收集可见节点（跳过折叠子树）
  _collectVisible(node, visible) {
    visible.push({
      _id: node._id,
      title: node.title,
      description: node.description,
      tags: node.tags || [],
      difficulty: node.difficulty || 1,
      status: node.status,
      icon: node.icon,
      hasChildren: !!(node.children && node.children.length > 0),
      childCount: node.children ? node.children.length : 0,
      collapsed: node.collapsed,
      x: Math.round(node.x),
      y: Math.round(node.y),
      lessons: node.lessons || []
    });
    if (node.children && node.children.length > 0 && !node.collapsed) {
      node.children.forEach(child => this._collectVisible(child, visible));
    }
  },

  // 点击子节点
  tapNode(e) {
    const id = e.currentTarget.dataset.id;
    const node = this._nodeMap && this._nodeMap[id];
    if (!node) return;

    // 选中节点，弹出详情面板
    this.setData({
      showDetail: true,
      selectedId: id,
      detailNode: {
        _id: node._id,
        title: node.title,
        description: node.description || '',
        tags: node.tags || [],
        difficulty: node.difficulty || 1,
        status: node.status,
        icon: node.icon,
        hasChildren: !!(node.children && node.children.length > 0),
        childCount: node.children ? node.children.length : 0,
        collapsed: node.collapsed,
        lessons: node.lessons || [],
        prerequisites: node.prerequisites || []
      }
    });
  },

  // 点击根节点
  tapRootNode() {
    wx.navigateTo({
      url: '/pages/course/course?courseId=' + this.data.courseId
    });
  },

  // 展开/收起子节点
  toggleExpand() {
    const id = this.data.selectedId;
    const node = this._nodeMap[id];
    if (!node || !node.children || node.children.length === 0) return;
    node.collapsed = !node.collapsed;
    this.setData({ showDetail: false });
    this.renderGraph();
  },

  // 从详情面板跳转课程
  goCourseFromDetail() {
    const node = this.data.detailNode;
    if (!node || !node.lessons || node.lessons.length === 0) return;
    wx.navigateTo({
      url: '/pages/course/course?courseId=' + (node.lessons[0].courseId || this.data.courseId)
    });
  },

  // 关闭详情面板
  closeDetail() {
    this.setData({ showDetail: false, selectedId: '' });
  },

  // 展开全部
  expandAll() {
    this._allNodes.forEach(n => { n.collapsed = false; });
    this.renderGraph();
  },

  // 收起全部子节点（仅保留第一层展开）
  collapseAll() {
    this._allNodes.forEach(n => {
      if (n.children && n.children.length > 0) {
        n.collapsed = true;
      }
    });
    this.renderGraph();
  },

  goBack() {
    wx.navigateBack();
  }
});
