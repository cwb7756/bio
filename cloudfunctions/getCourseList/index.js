// 云函数 getCourseList - 学习页面课程列表
// 按教材（chapter）查询课程，返回章节列表 + 学习概览
// 新用户无 study_progress 记录时，使用 course.demoCompleted 展示示例进度
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { textbook = '必修一' } = event;

  try {
    // 构建查询条件："选择性必修" 匹配所有选择性必修课程
    let chapterCondition;
    if (textbook === '选择性必修') {
      chapterCondition = db.RegExp({ regexp: '^选择性必修', options: 'i' });
    } else {
      chapterCondition = textbook;
    }

    // 查询该教材下所有课程，按 sort 排序
    const { data: courses } = await db.collection('courses')
      .where({ chapter: chapterCondition })
      .orderBy('sort', 'asc')
      .get();

    if (courses.length === 0) {
      return { code: 0, data: { chapters: [], overview: { completedLessons: 0, totalLessons: 0, completionRate: 0 } } };
    }

    // 判断用户是否有 lesson 类型的学习记录（决定是否使用 demo 数据）
    const { data: userProgressAll } = await db.collection('study_progress')
      .where({ _openid: OPENID, type: 'lesson' })
      .limit(1)
      .get();
    const useDemo = userProgressAll.length === 0;

    // 为每个课程计算进度
    const chapters = [];
    for (const course of courses) {
      // 从 lessons 集合获取总课时（兜底用 course.totalLessons）
      const { data: lessons } = await db.collection('lessons')
        .where({ courseId: course._id })
        .get();
      const totalLessons = lessons.length || course.totalLessons || 0;

      // 统计已完成课时
      let completed;
      if (useDemo) {
        completed = course.demoCompleted || 0;
      } else {
        const { data: progress } = await db.collection('study_progress')
          .where({ courseId: course._id, _openid: OPENID, type: 'lesson' })
          .get();
        completed = progress.length;
      }

      const progressPercent = totalLessons > 0
        ? Math.min(Math.round((completed / totalLessons) * 100), 100)
        : 0;

      chapters.push({
        _id: course._id,
        title: course.title,
        lessons: totalLessons,
        completed,
        progress: progressPercent,
        icon: course.icon || 'ic-microscope',
        tag: course.tag || '',
        level: course.level || ''
      });
    }

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
