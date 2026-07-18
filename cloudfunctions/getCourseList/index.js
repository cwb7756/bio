// 云函数 getCourseList - 学习页面课程列表
// 按教材（chapter）查询课程，返回章节列表 + 学习概览
// 新用户无 study_progress 记录时，使用 course.demoCompleted 展示示例进度
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

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

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { textbook = '全部' } = event;

  const validErr = validateParams(event);
  if (validErr) return validErr;

  try {
    // 构建查询条件："选择性必修" 匹配所有选择性必修课程；"全部" 不加教材条件
    let query = db.collection('courses');
    if (textbook && textbook !== '全部') {
      let chapterCondition;
      if (textbook === '选择性必修') {
        chapterCondition = db.RegExp({ regexp: '^选择性必修', options: 'i' });
      } else {
        chapterCondition = textbook;
      }
      query = query.where({ chapter: chapterCondition });
    }

    // 查询课程，按 sort 排序
    const { data: courses } = await query.orderBy('sort', 'asc').get();

    if (courses.length === 0) {
      return { code: 0, data: { chapters: [], overview: { completedLessons: 0, totalLessons: 0, completionRate: 0 } } };
    }

    // 判断用户是否有 lesson 类型的学习记录（决定是否使用 demo 数据）
    const { data: userProgressAll } = await db.collection('study_progress')
      .where({ _openid: OPENID, type: 'lesson' })
      .limit(1)
      .get();
    const useDemo = userProgressAll.length === 0;

    // N+1 优化：收集所有 courseId，批量查询 lessons 和 study_progress
    const courseIds = courses.map((c) => c._id);

    // 批量查询所有课程的课时
    const { data: allLessons } = await db.collection('lessons')
      .where({ courseId: _.in(courseIds) })
      .limit(1000)
      .get();

    // 按 courseId 分组统计课时数
    const lessonsByCourse = {};
    allLessons.forEach((l) => {
      if (!lessonsByCourse[l.courseId]) lessonsByCourse[l.courseId] = 0;
      lessonsByCourse[l.courseId]++;
    });

    // 批量查询用户学习进度（仅非 demo 时）
    const progressByCourse = {};
    if (!useDemo && OPENID) {
      const { data: allProgress } = await db.collection('study_progress')
        .where({ courseId: _.in(courseIds), _openid: OPENID, type: 'lesson' })
        .limit(1000)
        .get();
      allProgress.forEach((p) => {
        if (!progressByCourse[p.courseId]) progressByCourse[p.courseId] = 0;
        progressByCourse[p.courseId]++;
      });
    }

    // 为每个课程计算进度
    const chapters = courses.map((course) => {
      const totalLessons = lessonsByCourse[course._id] || course.totalLessons || 0;

      let completed;
      if (useDemo) {
        completed = course.demoCompleted || 0;
      } else {
        completed = progressByCourse[course._id] || 0;
      }

      const progressPercent = totalLessons > 0
        ? Math.min(Math.round((completed / totalLessons) * 100), 100)
        : 0;

      return {
        _id: course._id,
        title: course.title,
        lessons: totalLessons,
        completed,
        progress: progressPercent,
        icon: course.icon || 'ic-microscope',
        tag: course.tag || '',
        level: course.level || ''
      };
    });

    // 锁逻辑：前一章节未完成（progress < 100）则后续锁定
    chapters.forEach((ch, i) => {
      if (i === 0) {
        ch.color = ch.progress === 100 ? 'done' : 'green';
      } else {
        const prevDone = chapters[i - 1].progress === 100;
        if (!prevDone) {
          ch.color = 'lock';
        } else {
          ch.color = ch.progress === 100 ? 'done' : 'green';
        }
      }
    });

    // 概览统计
    const totalLessonsAll = chapters.reduce((s, c) => s + c.lessons, 0);
    const completedAll = chapters.reduce((s, c) => s + c.completed, 0);
    const completionRate = totalLessonsAll > 0
      ? Math.round((completedAll / totalLessonsAll) * 100)
      : 0;

    return {
      code: 0,
      data: {
        chapters,
        overview: {
          completedLessons: completedAll,
          totalLessons: totalLessonsAll,
          completionRate
        }
      }
    };
  } catch (err) {
    console.error('getCourseList error:', err);
    return { code: -1, msg: '获取课程列表失败' };
  }
};
