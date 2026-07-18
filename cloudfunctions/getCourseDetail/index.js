// 云函数 getCourseDetail - 课程详情（课程信息 + 推荐视频 + 核心考点 + 已学课时）
// 课程详情页与考点页共用；action='completeCourse' 标记课程所有课时为已学
// action='completeLesson' 标记单个课时为已学，并联动宠物奖励/学习时长/连续打卡
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 单课时奖励常量
const LESSON_FISH_REWARD = 10; // 每课时小鱼干
const LESSON_XP_REWARD = 20;   // 每课时宠物经验

// 经验与升级（与 pet 云函数一致：xpMax = level * 100）
function applyXpGain(pet, gain) {
  let level = pet.level || 1;
  let xp = (pet.xp || 0) + gain;
  let xpMax = pet.xpMax || level * 100;
  while (xp >= xpMax) {
    xp -= xpMax;
    level += 1;
    xpMax = level * 100;
  }
  return { level, xp, xpMax };
}

// 东八区日期字符串 yyyy-MM-dd（云函数容器为 UTC 时区）
function dateStr(offsetDays) {
  const d = new Date(Date.now() + 8 * 3600000 + (offsetDays || 0) * 86400000);
  return d.toISOString().slice(0, 10);
}

// 宠物联动：发小鱼干 + 经验 + 写成长日记（无档案则先建档）
async function rewardPet(OPENID, text, fishGain, xpGain) {
  const now = Date.now();
  const { data } = await db.collection('pet').where({ _openid: OPENID }).limit(1).get();
  let pet;
  let docId;
  if (data.length > 0) {
    pet = data[0];
    docId = pet._id;
  } else {
    pet = { name: '球球', level: 1, xp: 0, xpMax: 100, mood: 80, fullness: 70, intimacy: 1, fish: 50, todayEarned: 0, accompanyDays: 1 };
    const res = await db.collection('pet').add({ data: { _openid: OPENID, ...pet, createdAt: now, updatedAt: now } });
    docId = res._id;
  }
  const r = applyXpGain(pet, xpGain);
  await db.collection('pet').doc(docId).update({
    data: {
      fish: (pet.fish || 0) + fishGain,
      level: r.level,
      xp: r.xp,
      xpMax: r.xpMax,
      updatedAt: now
    }
  });
  const t = new Date(now + 8 * 3600000);
  const time = String(t.getUTCHours()).padStart(2, '0') + ':' + String(t.getUTCMinutes()).padStart(2, '0');
  await db.collection('pet_diary').add({
    data: { _openid: OPENID, time, text, createdAt: now }
  });
}

// 用户联动：累计学习时长 + 连续打卡（lastStudyDate 为东八区日期串）
async function rewardUser(OPENID, minutes) {
  const { data } = await db.collection('users').where({ _openid: OPENID }).limit(1).get();
  if (data.length === 0) return { streakDays: 0 };
  const user = data[0];
  const today = dateStr(0);
  const yesterday = dateStr(-1);
  let streakDays = user.streakDays || 0;
  if (user.lastStudyDate === today) {
    // 今天已打卡，连续天数不变
  } else if (user.lastStudyDate === yesterday) {
    streakDays += 1;
  } else {
    streakDays = 1;
  }
  await db.collection('users').doc(user._id).update({
    data: {
      totalStudyMinutes: (user.totalStudyMinutes || 0) + minutes,
      streakDays,
      lastStudyDate: today,
      updatedAt: Date.now()
    }
  });
  return { streakDays };
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

// 课程详情
async function getDetail(event, OPENID) {
  const { courseId } = event;

  const validErr = validateParams(event);
  if (validErr) return validErr;

  if (!courseId) {
    return { code: 400, msg: '缺少 courseId' };
  }

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

  // 4. 课时列表 + 已学课时 ID
  const { data: lessons } = await db.collection('lessons')
    .where({ courseId })
    .orderBy('sort', 'asc')
    .get();
  const totalLessons = lessons.length;

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

  const courseCompleted = totalLessons > 0 && learnedLessonIds.length >= totalLessons;

  return { code: 0, data: { course, videos, knowledgePoints, lessons, learnedLessonIds, totalLessons, courseCompleted } };
}

// 完成课程学习：将该课程所有课时写入 study_progress（type='lesson'）
async function completeCourse(event, OPENID) {
  const { courseId } = event;

  const validErr = validateParams(event);
  if (validErr) return validErr;

  if (!courseId) {
    return { code: 400, msg: '缺少 courseId' };
  }
  if (!OPENID) {
    return { code: 401, msg: '未登录' };
  }

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

  if (lessons.length === 0) {
    return { code: 0, data: { completedCount: 0, totalLessons: 0, added: 0 } };
  }

  // 3. 查询已有记录，避免重复写入
  const { data: existing } = await db.collection('study_progress')
    .where({ _openid: OPENID, courseId, type: 'lesson' })
    .limit(100)
    .get();
  const existingLessonIds = existing.map((p) => p.lessonId).filter(Boolean);

  // 4. 为未记录的课时写入 study_progress
  const now = Date.now();
  let added = 0;
  let addedMinutes = 0;
  for (let i = 0; i < lessons.length; i++) {
    const l = lessons[i];
    if (existingLessonIds.includes(l._id)) continue;
    await db.collection('study_progress').add({
      data: {
        _openid: OPENID,
        courseId,
        type: 'lesson',
        lessonId: l._id,
        itemIndex: l.index || (i + 1),
        chapter: course.chapter,
        createdAt: now,
        updatedAt: now
      }
    });
    added++;
    addedMinutes += l.durationMinutes || 0;
  }

  // 5. 联动奖励：按新增课时累计小鱼干/经验/时长，打卡只算一次
  let streakDays = 0;
  if (added > 0) {
    await rewardPet(
      OPENID,
      '你学完了《' + (course.title || '课程') + '》' + added + ' 个课时，奖励 ' + added * LESSON_FISH_REWARD + ' 小鱼干，球球开心极了！',
      added * LESSON_FISH_REWARD,
      added * LESSON_XP_REWARD
    );
    const r = await rewardUser(OPENID, addedMinutes);
    streakDays = r.streakDays;
  }

  return {
    code: 0,
    data: {
      completedCount: lessons.length,
      totalLessons: lessons.length,
      added,
      fishReward: added * LESSON_FISH_REWARD,
      xpReward: added * LESSON_XP_REWARD,
      streakDays
    }
  };
}

// 完成单个课时：写 study_progress（type='lesson'）+ 宠物/时长/打卡联动
async function completeLesson(event, OPENID) {
  const { courseId, lessonId } = event;

  const validErr = validateParams(event);
  if (validErr) return validErr;

  if (!courseId || !lessonId) {
    return { code: 400, msg: '缺少 courseId 或 lessonId' };
  }
  if (!OPENID) {
    return { code: 401, msg: '未登录' };
  }

  // 1. 课程信息
  const { data: courseList } = await db.collection('courses')
    .where({ _id: courseId })
    .limit(1)
    .get();
  if (courseList.length === 0) {
    return { code: 404, msg: '课程不存在' };
  }
  const course = courseList[0];

  // 2. 课时信息（校验属于该课程）
  const { data: lessonList } = await db.collection('lessons')
    .where({ _id: lessonId, courseId })
    .limit(1)
    .get();
  if (lessonList.length === 0) {
    return { code: 404, msg: '课时不存在' };
  }
  const lesson = lessonList[0];

  // 3. 查重：已记录则直接返回
  const { data: existing } = await db.collection('study_progress')
    .where({ _openid: OPENID, courseId, type: 'lesson', lessonId })
    .limit(1)
    .get();
  if (existing.length > 0) {
    return { code: 0, data: { added: 0, already: true, fishReward: 0, xpReward: 0 } };
  }

  // 4. 写学习记录
  const now = Date.now();
  await db.collection('study_progress').add({
    data: {
      _openid: OPENID,
      courseId,
      type: 'lesson',
      lessonId,
      itemIndex: lesson.index || lesson.sort || 0,
      chapter: course.chapter,
      createdAt: now,
      updatedAt: now
    }
  });

  // 5. 联动奖励：宠物小鱼干/经验 + 学习时长 + 连续打卡
  await rewardPet(
    OPENID,
    '你学完了《' + lesson.title + '》，奖励 ' + LESSON_FISH_REWARD + ' 小鱼干，球球为你骄傲！',
    LESSON_FISH_REWARD,
    LESSON_XP_REWARD
  );
  const { streakDays } = await rewardUser(OPENID, lesson.durationMinutes || 0);

  // 6. 课程完成度
  const { total: learnedCount } = await db.collection('study_progress')
    .where({ _openid: OPENID, courseId, type: 'lesson' })
    .count();
  const { total: totalLessons } = await db.collection('lessons')
    .where({ courseId })
    .count();
  const courseCompleted = totalLessons > 0 && learnedCount >= totalLessons;

  return {
    code: 0,
    data: {
      added: 1,
      fishReward: LESSON_FISH_REWARD,
      xpReward: LESSON_XP_REWARD,
      streakDays,
      learnedCount,
      totalLessons,
      courseCompleted
    }
  };
}

// ---------- 云函数入口 ----------
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const action = event.action || 'detail';

  try {
    switch (action) {
      case 'detail':
        return await getDetail(event, OPENID);
      case 'completeCourse':
        return await completeCourse(event, OPENID);
      case 'completeLesson':
        return await completeLesson(event, OPENID);
      default:
        return { code: -1, msg: '未知的操作类型' };
    }
  } catch (err) {
    console.error('getCourseDetail error:', err);
    return { code: -1, msg: '操作失败' };
  }
};
