// 云函数 home - 首页数据聚合
// 一次调用返回：用户信息 + 继续学习卡片 + 热门考点
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// study_progress 身份兼容条件：旧数据用 userID，新数据用 _openid
function progressCond(openid, userID, extra) {
  const conds = [Object.assign({ _openid: openid }, extra)];
  if (userID) {
    conds.push(Object.assign({ userID: userID }, extra));
  }
  return conds.length > 1 ? _.or(conds) : conds[0];
}

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
    userID: user.userID || ''
  };
}

/**
 * 获取继续学习卡片数据
 * 1. 查 study_progress 最近一条 type='lesson' 记录 → 得到 courseId
 * 2. 查 courses by courseId → 得到课程信息
 * 3. 统计该课程总课时数与已完成课时数 → 计算进度
 */
async function getContinueLearning(openid, userID) {
  // 取最近一条课时学习记录（兼容 _openid / userID）
  const { data: latestList } = await db.collection('study_progress')
    .where(progressCond(openid, userID, { type: 'lesson' }))
    .orderBy('updatedAt', 'desc')
    .limit(1)
    .get();

  if (latestList.length === 0) return null;

  const latest = latestList[0];
  const courseId = latest.courseId;
  if (!courseId) return null;

  // 查课程信息
  const { data: courseList } = await db.collection('courses')
    .where({ _id: courseId })
    .limit(1)
    .get();

  if (courseList.length === 0) return null;

  const course = courseList[0];

  // 该课程总课时数
  const { total: totalLessons } = await db.collection('lessons')
    .where({ courseId })
    .count();

  // 该课程已完成课时数（仅 type='lesson'，身份兼容）
  const { total: completedCount } = await db.collection('study_progress')
    .where(progressCond(openid, userID, { courseId, type: 'lesson' }))
    .count();

  const progress = totalLessons > 0
    ? Math.min(Math.round((completedCount / totalLessons) * 100), 100)
    : 0;

  return {
    tag: '继续学习',
    title: course.title,
    meta: course.chapter + ' · ' + course.tag + ' · 已学 ' + progress + '%',
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

  const validErr = validateParams(event);
  if (validErr) return validErr;

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
