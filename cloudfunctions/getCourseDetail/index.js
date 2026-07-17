// 云函数 getCourseDetail - 课程详情（课程信息 + 推荐视频 + 核心考点）
// 课程详情页与考点页共用
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { courseId } = event;
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

    return { code: 0, data: { course, videos, knowledgePoints } };
  } catch (err) {
    console.error('getCourseDetail error:', err);
    return { code: -1, msg: '获取课程详情失败' };
  }
};
