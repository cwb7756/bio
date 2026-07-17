// 云函数 knowledgeMap - 知识地图（闯关式点亮）
// 返回课程课时节点 + 掌握度；用户无学习记录时返回 demo 示例进度
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// demo 节点掌握度（新用户示例）：前3课已掌握，第4课闯关中，第5课学习中，其余锁定
const DEMO_MASTERIES = [95, 88, 82, 45, 12];

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { courseId = 'course_required_1', userID = '' } = event;

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

    // 2. 课时列表
    const { data: lessons } = await db.collection('lessons')
      .where({ courseId })
      .orderBy('sort', 'asc')
      .limit(50)
      .get();

    // 3. 用户该课程学习记录（仅拼接存在的标识，避免空对象匹配全部文档）
    let completedIndexes = [];
    let isDemo = true;
    const clauses = [];
    if (OPENID) clauses.push({ _openid: OPENID, courseId, type: 'lesson' });
    if (userID) clauses.push({ userID, courseId, type: 'lesson' });
    if (clauses.length > 0) {
      const condition = clauses.length === 1 ? clauses[0] : _.or(clauses);
      const { data: progress } = await db.collection('study_progress')
        .where(condition)
        .limit(100)
        .get();
      if (progress.length > 0) {
        isDemo = false;
        completedIndexes = progress.map((p) => p.itemIndex);
      }
    }

    // 4. 组装节点
    let nodes = [];
    if (isDemo) {
      // demo：前 N 课按示例掌握度，其余锁定
      nodes = lessons.map((l, i) => {
        let mastery = 0;
        let status = 'lock';
        if (i < DEMO_MASTERIES.length) {
          mastery = DEMO_MASTERIES[i];
          status = mastery >= 80 ? 'done' : (i === 3 ? 'current' : 'learning');
        }
        return {
          lessonId: l._id,
          index: l.index || i + 1,
          title: l.title,
          mastery,
          status
        };
      });
    } else {
      // 真实：已完成课时 100；下一个未完成课时为当前关卡；再往后锁定
      let currentAssigned = false;
      nodes = lessons.map((l, i) => {
        const done = completedIndexes.includes(l.index || i + 1) || completedIndexes.includes(i);
        if (done) {
          return { lessonId: l._id, index: l.index || i + 1, title: l.title, mastery: 100, status: 'done' };
        }
        if (!currentAssigned) {
          currentAssigned = true;
          return { lessonId: l._id, index: l.index || i + 1, title: l.title, mastery: 0, status: 'current' };
        }
        return { lessonId: l._id, index: l.index || i + 1, title: l.title, mastery: 0, status: 'lock' };
      });
    }

    // 5. 总览
    const doneCount = nodes.filter((n) => n.status === 'done').length;
    const totalCount = nodes.length;
    const overallPercent = totalCount > 0
      ? Math.round(nodes.reduce((s, n) => s + n.mastery, 0) / totalCount)
      : 0;
    const currentNode = nodes.find((n) => n.status === 'current') || nodes.find((n) => n.status === 'learning') || null;

    return {
      code: 0,
      data: {
        isDemo,
        course: {
          _id: course._id,
          title: course.title,
          chapter: course.chapter,
          tag: course.tag || ''
        },
        nodes,
        doneCount,
        totalCount,
        overallPercent,
        currentLessonTitle: currentNode ? currentNode.title : ''
      }
    };
  } catch (err) {
    console.error('knowledgeMap error:', err);
    return { code: -1, msg: '获取知识地图失败' };
  }
};
