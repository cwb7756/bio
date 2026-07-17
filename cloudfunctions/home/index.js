// 云函数 home - 首页数据聚合
// 一次调用返回：用户信息 + 继续学习卡片 + 热门考点
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/**
 * 获取用户信息
 */
async function getUserInfo(openid) {
  if (!openid) return null;

  const { data } = await db.collection('users')
    .where({ _openid: openid })
    .get();

  if (data.length === 0) return null;

  const user = data[0];
  return {
    nickname: user.nickname || '同学',
    avatar: user.avatar || '',
    grade: user.grade || '',
    userID: user.userID || user._id
  };
}

/**
 * 获取继续学习卡片数据
 * 1. 查 study_progress 最近一条记录 → 得到 chapter
 * 2. 查 courses by chapter → 得到课程信息
 * 3. 查 lessons by courseId → 得到总课时
 * 4. 统计该 chapter 下 study_progress 总数 → 计算进度
 */
async function getContinueLearning(openid, userId) {
  // 兼容 userID 和 _openid 两种标识
  const queryCondition = _.or([
    { userID: userId },
    { _openid: openid }
  ]);

  // 取最近一条学习记录
  const { data: latestList } = await db.collection('study_progress')
    .where(queryCondition)
    .orderBy('updatedAt', 'desc')
    .limit(1)
    .get();

  if (latestList.length === 0) return null;

  const latest = latestList[0];
  const chapter = latest.chapter;

  // 查课程信息
  const { data: courseList } = await db.collection('courses')
    .where({ chapter })
    .get();

  if (courseList.length === 0) return null;

  const course = courseList[0];

  // 查该课程的总课时数
  const { data: lessons } = await db.collection('lessons')
    .where({ courseId: course._id })
    .get();

  const totalLessons = lessons.length;

  // 统计该章节下用户的学习记录总数
  const { data: allProgress } = await db.collection('study_progress')
    .where(queryCondition)
    .get();

  const completedCount = allProgress.length;
  const progress = totalLessons > 0
    ? Math.min(Math.round((completedCount / totalLessons) * 100), 100)
    : 0;

  return {
    tag: '继续学习',
    title: course.title,
    meta: chapter + ' · ' + course.tag + ' · 已学 ' + progress + '%',
    progress: progress,
    courseId: course._id
  };
}

/**
 * 获取热门考点（取 courses 前 3 条）
 */
async function getHotTopics() {
  const { data: courses } = await db.collection('courses')
    .orderBy('sort', 'asc')
    .limit(3)
    .get();

  return courses.map((c, i) => ({
    no: i + 1,
    title: c.tag,
    desc: c.chapter + ' · ' + c.level + ' · ' + c.totalLessons + '课时',
    fire: c.duration,
    hot: i === 1,
    courseId: c._id
  }));
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  try {
    // 并行获取用户信息 + 热门考点（无依赖关系）
    const [userInfo, hotTopics] = await Promise.all([
      getUserInfo(OPENID),
      getHotTopics()
    ]);

    // 继续学习依赖用户信息
    let continueLearning = null;
    if (userInfo) {
      continueLearning = await getContinueLearning(OPENID, userInfo.userID);
    }

    return {
      code: 0,
      data: {
        user: userInfo,
        continueLearning,
        hotTopics
      }
    };
  } catch (err) {
    console.error('home cloud function error:', err);
    return { code: -1, msg: '获取首页数据失败' };
  }
};
