// 云函数 knowledgeMap - 知识地图（闯关式点亮）
// action: undefined/'getMap' → 返回课程课时节点 + 掌握度
// action: 'getSubGraph' → 返回知识点子图谱（节点+边+课程绑定+进度）
const cloud = require('wx-server-sdk');
const { seedNodes, seedEdges } = require('./seedData');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 从种子数据构建 kpId → lessonIds 映射（用于推导知识点掌握状态）
const kpLessonMap = {};
seedNodes.forEach(n => {
  if (!kpLessonMap[n.kpId]) kpLessonMap[n.kpId] = [];
  (n.lessonIds || []).forEach(id => {
    if (!kpLessonMap[n.kpId].includes(id)) kpLessonMap[n.kpId].push(id);
  });
});

// 参数校验：字符串长度不超过10000，数组长度不超过100
function validateParams(obj) {
  for (const key in obj) {
    const val = obj[key];
    if (typeof val === 'string' && val.length > 10000) {
      return { code: 400, msg: '参数 ' + key + ' 过长' };
    }
    if (Array.isArray(val) && val.length > 100) {
      return { code: 400, msg: '参数 ' + key + ' 数量超限' };
    }
  }
  return null;
}

// ========== Action: getMap（原有逻辑） ==========
async function getMap(event, OPENID) {
  const { courseId = 'course_required_1' } = event;

  try {
    // 1. 课程信息
    const { data: courseList } = await db.collection('courses')
      .where({ _id: courseId })
      .limit(1)
      .get();
    if (courseList.length === 0) {
      return { code: 404, msg: '课程不存在' };
    }
    const course = courseList[0];

    // 2. 知识点列表（作为地图节点，而非课时）
    const { data: knowledgePoints } = await db.collection('knowledge_points')
      .where({ courseId })
      .orderBy('sort', 'asc')
      .limit(50)
      .get();

    // 3. 用户该课程已完成课时 ID（兼容 lessonId 和 itemIndex 两种记录格式）
    let completedLessonIds = [];
    if (OPENID) {
      const { data: progress } = await db.collection('study_progress')
        .where({ _openid: OPENID, courseId, type: 'lesson' })
        .limit(100)
        .get();
      completedLessonIds = progress.map(p => p.lessonId || '').filter(Boolean);
      // 兼容旧记录：通过 itemIndex 匹配课时 _id
      if (completedLessonIds.length === 0) {
        const completedIndexes = progress.map(p => p.itemIndex);
        const { data: lessons } = await db.collection('lessons')
          .where({ courseId })
          .orderBy('sort', 'asc')
          .limit(50)
          .get();
        completedLessonIds = lessons
          .filter((l, i) => completedIndexes.includes(l.index || i + 1) || completedIndexes.includes(i))
          .map(l => l._id);
      }
    }

    // 4. 组装知识点节点（通过关联课时推导掌握状态）
    const nodes = knowledgePoints.map((kp) => {
      const linkedIds = kpLessonMap[kp._id] || [];
      let mastery = 0;
      let status = 'todo';
      if (linkedIds.length > 0) {
        const doneCnt = linkedIds.filter(id => completedLessonIds.includes(id)).length;
        if (doneCnt === linkedIds.length) {
          mastery = 100;
          status = 'done';
        }
      }
      return { kpId: kp._id, courseId: courseId, title: kp.title, mastery, status };
    });

    // 5. 总览
    const doneCount = nodes.filter((n) => n.status === 'done').length;
    const totalCount = nodes.length;
    const overallPercent = totalCount > 0
      ? Math.round(nodes.reduce((s, n) => s + n.mastery, 0) / totalCount)
      : 0;
    return {
      code: 0,
      data: {
        isDemo: false,
        course: {
          _id: course._id,
          title: course.title,
          chapter: course.chapter,
          tag: course.tag || ''
        },
        nodes,
        doneCount,
        totalCount,
        overallPercent
      }
    };
  } catch (err) {
    console.error('knowledgeMap getMap error:', err);
    return { code: -1, msg: '获取知识地图失败' };
  }
}

// ========== 自动种子化：首次调用时将种子数据写入数据库 ==========
async function seedDatabase() {
  try {
    const { total } = await db.collection('knowledge_graph_nodes').count();
    if (total > 0) return false; // 已有数据，跳过
    const now = Date.now();
    // 批量插入节点（每批 20 个并行写入）
    for (let i = 0; i < seedNodes.length; i += 20) {
      const batch = seedNodes.slice(i, i + 20);
      await Promise.all(batch.map(n =>
        db.collection('knowledge_graph_nodes').add({ data: { ...n, createdAt: now, updatedAt: now } })
      ));
    }
    // 批量插入边
    for (let i = 0; i < seedEdges.length; i += 20) {
      const batch = seedEdges.slice(i, i + 20);
      await Promise.all(batch.map(e =>
        db.collection('knowledge_graph_edges').add({ data: { ...e, createdAt: now } })
      ));
    }
    console.log('knowledge_graph seeded:', seedNodes.length, 'nodes,', seedEdges.length, 'edges');
    return true;
  } catch (err) {
    console.error('seedDatabase error:', err);
    return false;
  }
}

// ========== Action: getSubGraph（知识点子图谱） ==========
// 入参: courseId, kpId(知识点ID)
// 返回: rootNode(知识点信息) + nodes(子知识点节点列表) + edges(边列表) + 进度信息
async function getSubGraph(event, OPENID) {
  const { courseId = 'course_required_1', kpId } = event;

  if (!kpId) {
    return { code: 400, msg: '缺少 kpId 参数' };
  }

  try {
    // 1. 知识点信息
    const { data: kpList } = await db.collection('knowledge_points')
      .where({ _id: kpId })
      .limit(1)
      .get();
    if (kpList.length === 0) {
      return { code: 404, msg: '知识点不存在' };
    }
    const kp = kpList[0];

    // 2. 查询子知识点节点（优先从数据库读取，兜底用种子数据）
    let nodes = [];
    try {
      const res = await db.collection('knowledge_graph_nodes')
        .where({ kpId })
        .orderBy('sort', 'asc')
        .limit(100)
        .get();
      nodes = res.data || [];
    } catch (e) {
      // 集合不存在时回退到种子数据
      nodes = [];
    }
    if (nodes.length === 0) {
      // 首次访问：触发自动种子化，然后重新查询
      await seedDatabase();
      try {
        const res2 = await db.collection('knowledge_graph_nodes')
          .where({ kpId })
          .orderBy('sort', 'asc')
          .limit(100)
          .get();
        nodes = res2.data || [];
      } catch (e) { nodes = []; }
      // 种子化后仍为空（该知识点无子节点），用内存种子数据兑底
      if (nodes.length === 0) {
        nodes = seedNodes.filter(n => n.kpId === kpId);
      }
    }

    if (nodes.length === 0) {
      return { code: 0, data: { rootNode: formatRootNode(kp), nodes: [], edges: [], rootNodes: [], doneCount: 0, totalCount: 0 } };
    }

    // 3. 查询边（包含关系 + 前置依赖关系）
    const nodeIdSet = new Set(nodes.map(n => n._id));
    nodeIdSet.add(kpId);
    let edges = [];
    try {
      const res = await db.collection('knowledge_graph_edges')
        .where(_.or([
          { sourceId: _.in(Array.from(nodeIdSet)) },
          { targetId: _.in(Array.from(nodeIdSet)) }
        ]))
        .limit(200)
        .get();
      edges = res.data || [];
    } catch (e) {
      edges = [];
    }
    if (edges.length === 0) {
      edges = seedEdges.filter(e => nodeIdSet.has(e.sourceId) && nodeIdSet.has(e.targetId));
    }

    // 4. 用户已完成课时（用于推导子知识点掌握状态）
    let completedLessonIds = [];
    if (OPENID) {
      const { data: progress } = await db.collection('study_progress')
        .where({ _openid: OPENID, courseId, type: 'lesson' })
        .limit(100)
        .get();
      completedLessonIds = progress.map(p => p.lessonId || '').filter(Boolean);
    }

    // 5. 批量获取关联课时信息（去重查询）
    const allLessonIds = [];
    const seen = new Set();
    nodes.forEach(n => {
      (n.lessonIds || []).forEach(id => {
        if (!seen.has(id)) { seen.add(id); allLessonIds.push(id); }
      });
    });
    let lessonMap = {};
    if (allLessonIds.length > 0) {
      const { data: lessons } = await db.collection('lessons')
        .where({ _id: _.in(allLessonIds) })
        .get();
      lessonMap = lessons.reduce((acc, l) => {
        acc[l._id] = { _id: l._id, title: l.title, index: l.index, courseId: l.courseId };
        return acc;
      }, {});
    }

    // 6. 组装节点（含状态与关联课程信息）
    const nodesWithStatus = nodes.map(n => {
      const linkedLessons = (n.lessonIds || []).map(id => lessonMap[id]).filter(Boolean);
      // 掌握状态：关联课时全部完成 → done，否则 → todo
      let status = 'todo';
      if (linkedLessons.length > 0) {
        status = linkedLessons.every(l => completedLessonIds.includes(l._id)) ? 'done' : 'todo';
      }
      return {
        _id: n._id,
        kpId: n.kpId,
        courseId: n.courseId,
        parentId: n.parentId || null,
        title: n.title,
        description: n.description || '',
        tags: n.tags || [],
        difficulty: n.difficulty || 1,
        prerequisites: n.prerequisites || [],
        depth: n.depth || 0,
        pathLength: n.pathLength || 0,
        lessonIds: n.lessonIds || [],
        videoIds: n.videoIds || [],
        sort: n.sort || 0,
        icon: n.icon || 'ic-book',
        status,
        lessons: linkedLessons
      };
    });

    // 7. 识别根节点（depth=0 且 parentId=null）
    const rootNodeIds = nodesWithStatus.filter(n => !n.parentId).map(n => n._id);
    const doneCount = nodesWithStatus.filter(n => n.status === 'done').length;

    return {
      code: 0,
      data: {
        rootNode: formatRootNode(kp),
        nodes: nodesWithStatus,
        edges,
        rootNodes: rootNodeIds,
        doneCount,
        totalCount: nodesWithStatus.length
      }
    };
  } catch (err) {
    console.error('knowledgeMap getSubGraph error:', err);
    return { code: -1, msg: '获取知识图谱失败' };
  }
}

// 格式化根节点信息
function formatRootNode(kp) {
  return {
    _id: kp._id,
    title: kp.title,
    desc: kp.desc,
    icon: kp.icon,
    courseId: kp.courseId,
    chapter: kp.chapter
  };
}

// ========== 云函数入口 ==========
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const action = event.action || 'getMap';

  const validErr = validateParams(event);
  if (validErr) return validErr;

  switch (action) {
    case 'getMap':
      return await getMap(event, OPENID);
    case 'getSubGraph':
      return await getSubGraph(event, OPENID);
    default:
      return { code: -1, msg: '未知的操作类型' };
  }
};
