// 云函数 achievements - 成就中心
// list/getUserAchievements: 返回成就定义 + 当前用户解锁进度（分页）；用户无记录时返回空列表 + isDemo
// refresh: 基于用户真实学习数据重新计算并更新所有成就进度，返回最新列表 + newlyUnlocked
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const CHAPTERS = ['必修一', '必修二', '选择性必修一', '选择性必修二', '选择性必修三'];

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

// 读取成就列表（从 user_achievements 表）
async function listAchievements(OPENID, skip, limit) {
  // 1. 全部成就定义
  const { data: defs } = await db.collection('achievements')
    .orderBy('sort', 'asc')
    .limit(100)
    .get();

  // 2. 用户解锁记录（仅用 _openid）
  let userRecords = [];
  if (OPENID) {
    const { data } = await db.collection('user_achievements')
      .where({ _openid: OPENID })
      .limit(100)
      .get();
    userRecords = data;
  }

  // 3. 无记录返回空列表 + isDemo
  if (userRecords.length === 0) {
    return { code: 0, list: [], total: 0, isDemo: true };
  }

  // 4. 合并定义与进度
  const progressMap = {};
  userRecords.forEach((r) => { progressMap[r.achievementId] = r; });

  const allAchievements = defs.map((d) => {
    const p = progressMap[d._id] || {};
    const progress = p.progress || 0;
    const unlocked = !!p.unlocked;
    return {
      _id: d._id,
      name: d.name,
      desc: d.desc,
      icon: d.icon || 'ic-trophy',
      target: d.target || 1,
      progress,
      unlocked,
      percent: d.target > 0 ? Math.min(Math.round((progress / d.target) * 100), 100) : 0
    };
  });

  const unlockedCount = allAchievements.filter((a) => a.unlocked).length;
  const total = allAchievements.length;
  const paged = allAchievements.slice(skip, skip + limit);

  return { code: 0, list: paged, total, isDemo: false, unlockedCount };
}

// 刷新成就进度（基于真实学习数据重新计算并写入 user_achievements）
async function refreshAchievements(OPENID) {
  if (!OPENID) {
    return { code: 401, msg: '请先登录' };
  }

  // 1. 获取用户信息（streakDays 等）
  const { data: userData } = await db.collection('users')
    .where({ _openid: OPENID })
    .limit(1)
    .get();
  const user = userData[0] || {};

  // 2. 构建查询条件（兼容 _openid 和 userID 两种字段）
  // 安全前提：userID 必须且只能来自服务端 users 表（按 _openid 查询），绝不可源自客户端 event；
  // main 入口已加防御断言拦截客户端传入的 userID，以防越权查询他人数据。
  const userID = user.userID || user._id || '';
  let spQuery = { _openid: OPENID };
  if (userID) {
    spQuery = _.or([{ _openid: OPENID }, { userID: userID }]);
  }
  let mistakeQuery = { _openid: OPENID };
  if (userID) {
    mistakeQuery = _.or([{ _openid: OPENID }, { userID: userID }]);
  }

  // 3. 并行获取各类数据
  const [progressRes, petRes, mistakeCountRes, aiChatCountRes, defsRes, existingRes] = await Promise.all([
    db.collection('study_progress').where(spQuery).limit(1000).get(),
    db.collection('pet').where({ _openid: OPENID }).limit(1).get(),
    db.collection('mistakes').where(mistakeQuery).count(),
    db.collection('ai_chat_sessions').where({ _openid: OPENID }).count(),
    db.collection('achievements').orderBy('sort', 'asc').limit(100).get(),
    db.collection('user_achievements').where({ _openid: OPENID }).limit(100).get()
  ]);

  const progressRecords = progressRes.data;
  const petLevel = (petRes.data[0] || {}).level || 0;
  // Note: mistakeCount is calculated but not used in achievements calculation
  // Keeping the query for potential future use
  const _mistakeCount = mistakeCountRes.total;
  const aiChatCount = aiChatCountRes.total;
  const defs = defsRes.data;
  const existingRecords = existingRes.data;

  // 4. 计算各项指标
  const quizRecords = progressRecords.filter(function (r) { return r.type === 'quiz'; });
  const quizTotal = quizRecords.length;
  const quizCorrect = quizRecords.filter(function (r) { return r.correct; }).length;
  const quizRate = quizTotal > 0 ? Math.round((quizCorrect / quizTotal) * 100) : 0;

  const flashcardMastered = progressRecords.filter(function (r) {
    return r.type === 'flashcard' && r.status === 'mastered';
  }).length;
  const lessonCount = progressRecords.filter(function (r) { return r.type === 'lesson'; }).length;

  // 章节掌握度（平均值）
  const chapterStats = {};
  progressRecords.forEach(function (r) {
    const ch = r.chapter;
    if (!ch) return;
    if (!chapterStats[ch]) chapterStats[ch] = { total: 0, mastered: 0 };
    chapterStats[ch].total++;
    if ((r.type === 'flashcard' && r.status === 'mastered') ||
        (r.type === 'quiz' && r.correct) ||
        (r.type === 'lesson')) {
      chapterStats[ch].mastered++;
    }
  });
  const chapterMasteries = CHAPTERS.map(function (ch) {
    const s = chapterStats[ch];
    if (!s || s.total === 0) return 0;
    return Math.min(Math.round((s.mastered / s.total) * 100), 100);
  });
  const avgMastery = chapterMasteries.length > 0
    ? Math.round(chapterMasteries.reduce(function (a, b) { return a + b; }, 0) / chapterMasteries.length)
    : 0;

  // 早起学习天数（8点前有学习记录的不同日期数）
  const earlyDays = {};
  progressRecords.forEach(function (r) {
    if (r.createdAt) {
      const d = new Date(r.createdAt);
      if (d.getHours() < 8) {
        earlyDays[d.toDateString()] = true;
      }
    }
  });
  const earlyCount = Object.keys(earlyDays).length;

  const streakDays = user.streakDays || 0;

  // 5. 计算每个成就的进度
  const progressValues = {
    'ach_first_step': lessonCount > 0 ? 1 : 0,
    'ach_streak_7': streakDays,
    'ach_streak_20': streakDays,
    'ach_quiz_100': quizTotal,
    'ach_quiz_400': quizTotal,
    'ach_mistake_90': quizRate,
    'ach_card_10': flashcardMastered,
    'ach_pet_5': petLevel,
    'ach_map_half': avgMastery,
    'ach_ai_10': aiChatCount,
    'ach_early': earlyCount,
    'ach_full': 0
  };

  // 6. 计算已解锁数量（不含大满贯）
  let otherUnlocked = 0;
  defs.forEach(function (d) {
    if (d._id === 'ach_full') return;
    const progress = progressValues[d._id] || 0;
    if (progress >= (d.target || 1)) otherUnlocked++;
  });
  progressValues['ach_full'] = otherUnlocked;

  // 7. 更新/创建 user_achievements 记录
  const existingMap = {};
  existingRecords.forEach(function (r) { existingMap[r.achievementId] = r; });

  const now = Date.now();
  const newlyUnlocked = [];

  for (let i = 0; i < defs.length; i++) {
    const d = defs[i];
    const progress = progressValues[d._id] || 0;
    const target = d.target || 1;
    const shouldUnlock = progress >= target;
    const existing = existingMap[d._id];

    if (existing) {
      const update = { progress: progress, updatedAt: now };
      if (shouldUnlock && !existing.unlocked) {
        update.unlocked = true;
        update.unlockedAt = now;
        newlyUnlocked.push({ _id: d._id, name: d.name, icon: d.icon || 'ic-trophy' });
      }
      await db.collection('user_achievements').doc(existing._id).update({ data: update });
    } else {
      const doc = {
        _openid: OPENID,
        achievementId: d._id,
        progress: progress,
        unlocked: shouldUnlock,
        updatedAt: now
      };
      if (shouldUnlock) {
        doc.unlockedAt = now;
        newlyUnlocked.push({ _id: d._id, name: d.name, icon: d.icon || 'ic-trophy' });
      }
      await db.collection('user_achievements').add({ data: doc });
    }
  }

  // 8. 组装返回数据
  const allAchievements = defs.map(function (d) {
    const progress = progressValues[d._id] || 0;
    const unlocked = progress >= (d.target || 1);
    return {
      _id: d._id,
      name: d.name,
      desc: d.desc,
      icon: d.icon || 'ic-trophy',
      target: d.target || 1,
      progress: progress,
      unlocked: unlocked,
      percent: d.target > 0 ? Math.min(Math.round((progress / d.target) * 100), 100) : 0
    };
  });

  const totalUnlocked = allAchievements.filter(function (a) { return a.unlocked; }).length;

  return {
    code: 0,
    list: allAchievements,
    total: allAchievements.length,
    isDemo: false,
    unlockedCount: totalUnlocked,
    newlyUnlocked: newlyUnlocked
  };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();

  // 防御性断言：拒绝客户端传入 userID
  // study_progress/mistakes 旧数据按 userID 关联用户，但该值只能由服务端 users 表查询得到；
  // 客户端直接传入 userID 属越权请求，必须拦截以防回归。
  if (event.userID) {
    console.warn('achievements: rejected client-supplied userID');
    return { code: 403, msg: '非法请求' };
  }

  const { action = 'list', skip = 0, limit = 50 } = event;

  const validErr = validateParams(event);
  if (validErr) return validErr;

  // 分页参数校验与规范化
  const pageNum = Math.max(0, parseInt(skip, 10) || 0);
  const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

  try {
    if (action === 'list' || action === 'getUserAchievements') {
      return await listAchievements(OPENID, pageNum, pageSize);
    }

    if (action === 'refresh') {
      return await refreshAchievements(OPENID);
    }

    return { code: -1, msg: '未知的操作类型' };
  } catch (err) {
    console.error('achievements error:', err);
    return { code: -1, msg: '获取成就失败' };
  }
};
