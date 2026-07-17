// 云函数 getCourseDetail - 课程详情（课程信息 + 推荐视频 + 核心考点 + 已学课时）
// 课程详情页与考点页共用
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
  const { courseId } = event;

  const validErr = validateParams(event);
  if (validErr) return validErr;

  if (!courseId) {
    return { code: 400, msg: '缺少 courseId' };
  }

  try {
    // 1. 课程信息
    const { data: courseList } = await db.collection('courses')
      .where({ _id: courseId })
      .get();
    if (courseList.length === 0) {
      return { code: 404, msg: '课程不存在' };
    }
    const course = courseList[0];

    // 2. 推荐视频：按 course.videoIds 顺序保序返回
    const videoIds = course.videoIds || [];
    let videos = [];
    if (videoIds.length > 0) {
      const { data: videoList } = await db.collection('videos')
        .where({ _id: _.in(videoIds) })
        .get();
      const videoMap = {};
      videoList.forEach((v) => { videoMap[v._id] = v; });
      videos = videoIds.map((id) => videoMap[id]).filter(Boolean);
    }

    // 3. 核心考点（sort 升序）
    const { data: knowledgePoints } = await db.collection('knowledge_points')
      .where({ courseId })
      .orderBy('sort', 'asc')
      .get();

    // 4. 已学课时 ID 列表（查 study_progress）
    let learnedLessonIds = [];
    if (OPENID) {
      const { data: progress } = await db.collection('study_progress')
        .where({ _openid: OPENID, courseId, type: 'lesson' })
        .get();

      if (progress.length > 0) {
        // 优先使用 lessonId / itemId 字段
        const directIds = progress
          .map((p) => p.lessonId || p.itemId || '')
          .filter(Boolean);

        if (directIds.length > 0) {
          learnedLessonIds = directIds;
        } else {
          // 回退：通过 itemIndex 匹配 lessons 集合获取课时 ID
          const { data: lessons } = await db.collection('lessons')
            .where({ courseId })
            .orderBy('sort', 'asc')
            .get();
          const completedIndexes = progress.map((p) => p.itemIndex);
          learnedLessonIds = lessons
            .filter((l, i) => {
              const idx = l.index || i + 1;
              return completedIndexes.includes(idx) || completedIndexes.includes(i);
            })
            .map((l) => l._id);
        }
      }
    }

    return { code: 0, data: { course, videos, knowledgePoints, learnedLessonIds } };
  } catch (err) {
    console.error('getCourseDetail error:', err);
    return { code: -1, msg: '获取课程详情失败' };
  }
};
