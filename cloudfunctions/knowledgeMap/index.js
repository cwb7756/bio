// 云函数 knowledgeMap - 知识地图（闯关式点亮）
// 返回课程课时节点 + 掌握度；按用户真实学习记录组装，无记录时全部为未开始状态
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

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

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { courseId = 'course_required_1' } = event;

  const validErr = validateParams(event);
  if (validErr) return validErr;

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

    // 3. 用户该课程学习记录（仅用 _openid）
    let completedIndexes = [];
    if (OPENID) {
      const { data: progress } = await db.collection('study_progress')
        .where({ _openid: OPENID, courseId, type: 'lesson' })
        .limit(100)
        .get();
      completedIndexes = progress.map((p) => p.itemIndex);
    }

    // 4. 组装节点（无解锁限制：已学 done / 未学 todo，看了哪些就点亮哪些）
    const nodes = lessons.map((l, i) => {
      const done = completedIndexes.includes(l.index || i + 1) || completedIndexes.includes(i);
      if (done) {
        return { lessonId: l._id, courseId: courseId, index: l.index || i + 1, title: l.title, mastery: 100, status: 'done' };
      }
      return { lessonId: l._id, courseId: courseId, index: l.index || i + 1, title: l.title, mastery: 0, status: 'todo' };
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
    console.error('knowledgeMap error:', err);
    return { code: -1, msg: '获取知识地图失败' };
  }
};
