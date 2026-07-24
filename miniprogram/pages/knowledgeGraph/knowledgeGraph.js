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
    // 画布视图状态（手写拖动/缩放）
    tx: 0,
    ty: 0,
    scale: 1,
    scalePercent: 100,
    // 详情面板
    showDetail: false,
    detailNode: null,
    selectedId: '',
    // 概览模式相关
    overviewMode: true,     // true=概览模式，false=详细图谱模式
    courseTabs: [],         // 课程选项卡列表
    currentCourseTab: '',   // 当前选中的课程 ID，'all'=显示全部，''=必修一
    allDoneCount: 0,        // 总完成数（概览模式用）
    allTotalCount: 0,       // 总数（概览模式用）
    overallPercent: 0,      // 总完成百分比（概览模式用）
    filteredNodes: []       // 当前课程筛选后的考点列表
  },

  onLoad(options) {
    const sys = wx.getSystemInfoSync();
    // 布局坐标为 rpx，transform 平移单位为 px，需换算
    this._rpxToPx = sys.screenWidth / 750;
    this._windowHRpx = (sys.windowHeight || sys.screenHeight || 1334) / sys.screenWidth * 750;
    this._viewInited = false;
    
    // 判断是否进入概览模式：无 kpId 参数或 kpId='all' -> 概览模式；有具体 kpId -> 详细图谱模式
    const isOverviewMode = !options.kpId || options.kpId === 'all';
    
    // 标记是否从概览模式切换到详细图谱（用于 goBack 判断）
    this._fromOverview = false;
    
    this.setData({
      statusBarHeight: sys.statusBarHeight,
      courseId: (options && options.courseId) || 'course_required_1',
      kpId: (options && options.kpId) || '',
      overviewMode: isOverviewMode,
      currentCourseTab: options.courseId || ''
    });
  },

  onReady() {
    // 获取画布可视区位置与尺寸，用于双指缩放的中心补偿
    wx.createSelectorQuery().select('.kg-area').boundingClientRect((rect) => {
      if (rect) {
        this._areaLeft = rect.left;
        this._areaTop = rect.top;
        this._areaW = rect.width;
        this._areaH = rect.height;
      }
    }).exec();
  },

  onShow() {
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录后查看知识图谱', icon: 'none' });
      setTimeout(() => {
        wx.navigateTo({ url: '/pages/login/login' });
      }, 1000);
      return;
    }
    
    if (this.data.overviewMode) {
      // 概览模式：加载所有课程的知识点
      this.loadAllKnowledgePoints();
    } else if (this.data.kpId) {
      // 详细图谱模式：加载指定知识点的子图谱
      this.loadGraph();
    } else {
      this.setData({ loading: false });
      wx.showToast({ title: '缺少知识点参数', icon: 'none' });
    }
  },

  // 概览模式：加载所有课程的知识点
  loadAllKnowledgePoints() {
    this.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'knowledgeMap',
      data: {
        action: 'getAllKnowledgePoints'
      },
      success: (res) => {
        if (res.result && res.result.code === 0) {
          const d = res.result.data;
          const { courseMap, allNodes, totalCount } = d;
          
          // 构建课程选项卡列表
          const tabs = [];
          Object.values(courseMap).forEach(course => {
            let tabTitle = course.chapter || course.title;
            // 根据 chapter 映射为中文名
            if (tabTitle.includes('必修一')) {
              tabTitle = '必修一';
            } else if (tabTitle.includes('必修二')) {
              tabTitle = '必修二';
            } else if (tabTitle.includes('选择性必修') || tabTitle.includes('选必一')) {
              tabTitle = '选必一';
            } else if (tabTitle.includes('选必二')) {
              tabTitle = '选必二';
            } else if (tabTitle.includes('选必三')) {
              tabTitle = '选必三';
            }
            tabs.push({
              id: course._id,
              title: tabTitle,
              tag: course.tag,
              doneCount: course.doneCount || 0,
              totalCount: course.totalCount || 0
            });
          });
          
          // 计算总完成进度
          let allDoneCount = 0;
          allNodes.forEach(n => {
            if (n.status === 'done') allDoneCount++;
          });
          const overallPercent = totalCount > 0 ? Math.round(allDoneCount / totalCount * 100) : 0;
          
          this.setData({
            courseTabs: tabs,
            allNodes,
            allDoneCount,
            allTotalCount: totalCount,
            overallPercent,
            courses: courseMap,
            loading: false
          });
          
          // 如果有传入 courseId，则筛选该课程；否则默认第一个课程
          if (this.data.currentCourseTab && courseMap[this.data.currentCourseTab]) {
            // 已按 currentCourseTab 设置，无需额外处理
          } else if (tabs.length > 0) {
            this.setData({ currentCourseTab: tabs[0].id });
          }
          // 计算筛选后的考点列表
          this._updateFilteredNodes();
        } else {
          this.setData({ loading: false });
          wx.showToast({ title: (res.result && res.result.msg) || '加载失败', icon: 'none' });
        }
      },
      fail: (err) => {
        console.error('getAllKnowledgePoints error:', err);
        this.setData({ loading: false });
        wx.showToast({ title: '网络异常', icon: 'none' });
      }
    });
  },

  // 调用云函数获取子图谱数据（详细图谱模式）
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

  // 渲染图谱：径向布局（思维导图样式）→ 生成连线 → 收集可见节点
  renderGraph() {
    // 1. 统计叶子数（用于角度扇区分配）
    this._rootNodes.forEach(node => this._countLeaves(node));
    const totalLeaves = this._rootNodes.reduce((sum, node) => sum + (node._leafCount || 1), 0) || 1;

    // 2. 计算最大深度
    let maxDepth = 0;
    this._rootNodes.forEach(node => {
      const d = this._maxDepth(node, 1);
      if (d > maxDepth) maxDepth = d;
    });

    // 3. 计算径向半径
    const n = this._rootNodes.length;
    // 第一层半径：保证节点不重叠
    const level1Radius = Math.max(320, (n * (NODE_W + 30)) / (2 * Math.PI));
    // 层级间步长
    const radiusStep = Math.max(280, NODE_W + 60);

    // 4. 画布尺寸（正方形，足以容纳所有层级）
    const maxRadius = level1Radius + radiusStep * Math.max(0, maxDepth - 1);
    const canvasSize = Math.ceil((maxRadius + NODE_W + PAD) * 2);
    const centerX = canvasSize / 2;
    const centerY = canvasSize / 2;

    // 5. 根节点位置（画布正中央）
    const rootX = centerX - ROOT_W / 2;
    const rootY = centerY - ROOT_H / 2;

    // 6. 径向分配第一层子节点
    let currentAngle = -Math.PI / 2; // 从正上方开始
    this._rootNodes.forEach(node => {
      const sectorAngle = (2 * Math.PI) * ((node._leafCount || 1) / totalLeaves);
      const angle = currentAngle + sectorAngle / 2;
      const radius = level1Radius;

      const cx = centerX + radius * Math.cos(angle);
      const cy = centerY + radius * Math.sin(angle);
      node.x = cx - NODE_W / 2;
      node.y = cy - NODE_H / 2;
      node._angle = angle;

      // 递归分配更深层级的子节点
      if (node.children && node.children.length > 0 && !node.collapsed) {
        this._assignRadialPos(node, centerX, centerY, currentAngle, sectorAngle, level1Radius, radiusStep, 2);
      }
      currentAngle += sectorAngle;
    });

    // 7. 生成连线（根→第一层用粗线）
    const lines = [];
    this._rootNodes.forEach(node => {
      this._addLine(lines, rootX + ROOT_W / 2, rootY + ROOT_H / 2,
        node.x + NODE_W / 2, node.y + NODE_H / 2, true);
      this._addChildLinesRadial(lines, node);
    });

    // 8. 收集可见节点
    const visibleNodes = [];
    this._rootNodes.forEach(node => this._collectVisible(node, visibleNodes));

    const setPayload = {
      rootNode: this._rootNode,
      visibleNodes,
      lines,
      rootX,
      rootY,
      canvasWidth: canvasSize,
      canvasHeight: canvasSize,
      doneCount: this._allNodes.filter(n => n.status === 'done').length,
      totalCount: this._allNodes.length,
      loading: false
    };

    // 9. 首次渲染时定位初始视角：根考点居中，缩放至可容纳第一层节点
    if (!this._viewInited) {
      this._viewInited = true;
      const rootCenterX = rootX + ROOT_W / 2;
      const rootCenterY = rootY + ROOT_H / 2;
      const halfScreenWRpx = 375; // 750 / 2
      const areaHeightRpx = (this._windowHRpx || 1300) - 280;
      // 计算初始缩放：使第一层节点环完整可见
      const ringDiameter = 2 * level1Radius + NODE_W + PAD;
      const fitScaleW = 750 / ringDiameter;
      const fitScaleH = areaHeightRpx / ringDiameter;
      const initScale = Math.max(0.4, Math.min(1, Math.min(fitScaleW, fitScaleH)));
      this._initScale = initScale;
      this._initTx = Math.round((halfScreenWRpx - rootCenterX * initScale) * this._rpxToPx);
      this._initTy = Math.round((areaHeightRpx / 2 - rootCenterY * initScale) * this._rpxToPx);
      setPayload.tx = this._initTx;
      setPayload.ty = this._initTy;
      setPayload.scale = initScale;
      setPayload.scalePercent = Math.round(initScale * 100);
    }
    this.setData(setPayload);
  },

  // 触摸开始：区分单指拖动 / 双指缩放
  onTouchStart(e) {
    const touches = e.touches;
    if (touches.length === 1) {
      this._touchStartX = touches[0].clientX;
      this._touchStartY = touches[0].clientY;
      this._startTx = this.data.tx;
      this._startTy = this.data.ty;
      this._moved = false;
    } else if (touches.length === 2) {
      const dx = touches[1].clientX - touches[0].clientX;
      const dy = touches[1].clientY - touches[0].clientY;
      this._pinchStartDist = Math.hypot(dx, dy);
      this._pinchStartScale = this.data.scale || 1;
      // 双指中点（换算为相对画布可视区的坐标，用于缩放中心补偿）
      this._pinchCenterX = (touches[0].clientX + touches[1].clientX) / 2 - (this._areaLeft || 0);
      this._pinchCenterY = (touches[0].clientY + touches[1].clientY) / 2 - (this._areaTop || 0);
    }
  },

  // 触摸移动：单指平移 / 双指捏合缩放（以双指中点为中心）
  onTouchMove(e) {
    const touches = e.touches;
    if (touches.length === 1 && this._pinchStartDist == null) {
      const dx = touches[0].clientX - this._touchStartX;
      const dy = touches[0].clientY - this._touchStartY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) this._moved = true;
      this.setData({ tx: this._startTx + dx, ty: this._startTy + dy });
    } else if (touches.length === 2 && this._pinchStartDist) {
      const dx = touches[1].clientX - touches[0].clientX;
      const dy = touches[1].clientY - touches[0].clientY;
      const dist = Math.hypot(dx, dy);
      let newScale = this._pinchStartScale * (dist / this._pinchStartDist);
      newScale = Math.max(0.4, Math.min(2.5, newScale));
      // 以双指中点为基准缩放，补偿平移使该点保持不动
      const cx = this._pinchCenterX;
      const cy = this._pinchCenterY;
      const bx = (cx - this.data.tx) / this._pinchStartScale;
      const by = (cy - this.data.ty) / this._pinchStartScale;
      this.setData({
        scale: newScale,
        scalePercent: Math.round(newScale * 100),
        tx: cx - bx * newScale,
        ty: cy - by * newScale
      });
    }
  },

  // 触摸结束：双指拆解后重新错定单指起点，避免跳变
  onTouchEnd(e) {
    if (e.touches.length < 2) {
      this._pinchStartDist = null;
    }
    if (e.touches.length === 1) {
      this._touchStartX = e.touches[0].clientX;
      this._touchStartY = e.touches[0].clientY;
      this._startTx = this.data.tx;
      this._startTy = this.data.ty;
    }
  },

  // 复位：恢复初始视角与初始缩放
  resetView() {
    const s = this._initScale || 1;
    this.setData({
      tx: this._initTx || 0,
      ty: this._initTy || 0,
      scale: s,
      scalePercent: Math.round(s * 100)
    });
  },

  // 递归统计叶子节点数（用于角度扇区分配）
  _countLeaves(node) {
    if (!node.children || node.children.length === 0 || node.collapsed) {
      node._leafCount = 1;
      return 1;
    }
    let count = 0;
    node.children.forEach(child => {
      count += this._countLeaves(child);
    });
    node._leafCount = Math.max(count, 1);
    return node._leafCount;
  },

  // 递归分配径向坐标（思维导图样式）
  _assignRadialPos(parent, centerX, centerY, sectorStart, sectorAngle, level1Radius, radiusStep, depth) {
    if (!parent.children || parent.children.length === 0 || parent.collapsed) return;

    const totalLeaves = parent._leafCount || 1;
    const radius = level1Radius + radiusStep * (depth - 1);
    let currentAngle = sectorStart;

    parent.children.forEach(child => {
      const childSector = sectorAngle * ((child._leafCount || 1) / totalLeaves);
      const angle = currentAngle + childSector / 2;

      const cx = centerX + radius * Math.cos(angle);
      const cy = centerY + radius * Math.sin(angle);
      child.x = cx - NODE_W / 2;
      child.y = cy - NODE_H / 2;
      child._angle = angle;

      if (child.children && child.children.length > 0 && !child.collapsed) {
        this._assignRadialPos(child, centerX, centerY, currentAngle, childSector, level1Radius, radiusStep, depth + 1);
      }
      currentAngle += childSector;
    });
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

  // 添加一条连线（thick=true 时为加粗线）
  _addLine(lines, x1, y1, x2, y2, thick) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    lines.push({
      x: x1,
      y: y1,
      length: Math.round(length),
      angle: Math.round(angle * 10) / 10,
      thick: !!thick
    });
  },

  // 递归添加子节点连线（径向布局）
  _addChildLinesRadial(lines, node) {
    if (node.children && node.children.length > 0 && !node.collapsed) {
      node.children.forEach(child => {
        this._addLine(lines, node.x + NODE_W / 2, node.y + NODE_H / 2,
          child.x + NODE_W / 2, child.y + NODE_H / 2, false);
        this._addChildLinesRadial(lines, child);
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
    if (this.data.overviewMode) {
      // 概览模式：返回上一页
      wx.navigateBack();
    } else if (this._fromOverview) {
      // 从概览模式切换来的详细图谱：返回概览模式
      this.switchToOverview();
    } else {
      // 从其他页面直接进入的详细图谱：返回上一页
      wx.navigateBack();
    }
  },

  // 切换到概览模式
  switchToOverview() {
    this._fromOverview = false;
    this._viewInited = false;
    this.setData({ overviewMode: true, kpId: '', loading: true, showDetail: false, selectedId: '' });
    this.loadAllKnowledgePoints();
  },

  // 点击选项卡切换课程
  tapCourseTab(e) {
    const courseId = e.currentTarget.dataset.id;
    if (courseId === this.data.currentCourseTab) return;
    this.setData({ currentCourseTab: courseId });
    this._updateFilteredNodes();
  },

  // 更新筛选后的考点列表
  _updateFilteredNodes() {
    const courseId = this.data.currentCourseTab;
    const filtered = (this.data.allNodes || []).filter(n => n.courseId === courseId);
    this.setData({ filteredNodes: filtered });
  },

  // 点击某个知识点节点 -> 进入详细图谱模式
  tapKpCard(e) {
    const kpId = e.currentTarget.dataset.id;
    const node = e.currentTarget.dataset.node;
    if (!kpId) {
      wx.showToast({ title: '该知识点暂无图解', icon: 'none' });
      return;
    }
    // 标记从概览模式切换来
    this._fromOverview = true;
    this._viewInited = false;
    // 切换到详细图谱模式
    this.setData({ overviewMode: false, kpId, courseId: node.courseId, loading: true, showDetail: false, selectedId: '' });
    this.loadGraph();
  },

  // 从概览模式返回首页
  goHomeFromOverview() {
    wx.switchTab({ url: '/pages/study/study' });
  },
});
