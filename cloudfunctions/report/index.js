// 云函数 report - 学习报告
// 聚合 users / study_progress：打卡、刷题、正确率、时长、近7天分布、章节掌握度
// 用户无学习记录时返回 demo 示例数据
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const CHAPTERS = ['必修一', '必修二', '选择性必修一', '选择性必修二', '选择性必修三'];

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

// demo 示例（新用户无记录时展示）
function demoReport() {
  return {
    isDemo: true,
    streakDays: 12,
    quizTotal: 286,
    quizRate: 82,
    studyHours: 38,
    week: [
      { label: '一', count: 4 }, { label: '二', count: 6 }, { label: '三', count: 3 },
      { label: '四', count: 8 }, { label: '五', count: 5 }, { label: '六', count: 2 },
      { label: '日', count: 0 }
    ],
    chapters: [
      { chapter: '必修一', mastery: 62 },
      { chapter: '必修二', mastery: 35 },
      { chapter: '选择性必修一', mastery: 10 },
      { chapter: '选择性必修二', mastery: 0 },
      { chapter: '选择性必修三', mastery: 0 }
    ]
  };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();

  const validErr = validateParams(event);
  if (validErr) return validErr;

  try {
    // 1. 用户基础数据（仅用 _openid）
    let user = null;
    if (OPENID) {
      const { data } = await db.collection('users').where({ _openid: OPENID }).limit(1).get();
      user = data[0] || null;
    }

    if (!OPENID) {
      return { code: 0, data: demoReport() };
    }

    // 旧数据使用 userID 字段，查询需兼容两种身份
    const userID = (user && user.userID) || '';

    // 2. 检查是否有学习记录（count 替代全量 get）
    const { total: recordCount } = await db.collection('study_progress')
      .where(progressCond(OPENID, userID, {}))
      .count();

    if (recordCount === 0) {
      return { code: 0, data: demoReport() };
    }

    // 3. 统计数据（优先 aggregate，不兼容则退回 _.in() 批量查询 + 内存统计）
    let quizTotal = 0;
    let quizCorrect = 0;
    let chapterStats = {};

    try {
      const $ = db.command.aggregate;

      // 刷题统计：$match → $group
      const quizAgg = await db.collection('study_progress').aggregate()
        .match(progressCond(OPENID, userID, { type: 'quiz' }))
        .group({
          _id: null,
          total: $.sum(1),
          correct: $.sum($.cond({ if: '$correct', then: 1, else: 0 }))
        })
        .end();
      if (quizAgg.list.length > 0) {
        quizTotal = quizAgg.list[0].total || 0;
        quizCorrect = quizAgg.list[0].correct || 0;
      }

      // 章节掌握度：按 chapter + type 分组统计
      const chapterAgg = await db.collection('study_progress').aggregate()
        .match(progressCond(OPENID, userID, {}))
        .group({
          _id: { chapter: '$chapter', type: '$type' },
          total: $.sum(1),
          correct: $.sum($.cond({ if: '$correct', then: 1, else: 0 })),
          mastered: $.sum($.cond({ if: $.eq(['$status', 'mastered']), then: 1, else: 0 }))
        })
        .end();

      chapterAgg.list.forEach((item) => {
        const ch = item._id.chapter;
        if (!chapterStats[ch]) chapterStats[ch] = { total: 0, mastered: 0 };
        chapterStats[ch].total += item.total;
        if (item._id.type === 'flashcard') {
          chapterStats[ch].mastered += item.mastered;
        } else if (item._id.type === 'quiz') {
          chapterStats[ch].mastered += item.correct;
        } else if (item._id.type === 'lesson') {
          chapterStats[ch].mastered += item.total;
        }
      });
    } catch (aggErr) {
      console.warn('report aggregate fallback:', aggErr.message);
      // 退回 _.in() 批量查询 + 内存统计
      const { data: records } = await db.collection('study_progress')
        .where(progressCond(OPENID, userID, {}))
        .limit(1000)
        .get();

      const quizRecords = records.filter((r) => r.type === 'quiz');
      quizTotal = quizRecords.length;
      quizCorrect = quizRecords.filter((r) => r.correct).length;

      CHAPTERS.forEach((chapter) => {
        const chRecords = records.filter((r) => r.chapter === chapter);
        if (chRecords.length > 0) {
          const mastered = chRecords.filter((r) =>
            (r.type === 'flashcard' && r.status === 'mastered') ||
            (r.type === 'quiz' && r.correct) ||
            (r.type === 'lesson')
          ).length;
          chapterStats[chapter] = { total: chRecords.length, mastered };
        }
      });
    }

    const quizRate = quizTotal > 0 ? Math.round((quizCorrect / quizTotal) * 100) : 0;

    // 4. 近7天学习分布（并行 count 查询，避免全量加载）
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekLabels = ['日', '一', '二', '三', '四', '五', '六'];
    const weekPromises = [];
    for (let i = 6; i >= 0; i--) {
      const start = dayStart - i * 86400000;
      const end = start + 86400000;
      weekPromises.push(
        db.collection('study_progress')
          .where(progressCond(OPENID, userID, { updatedAt: _.gte(start).and(_.lt(end)) }))
          .count()
          .then(({ total }) => ({ label: weekLabels[new Date(start).getDay()], count: total }))
      );
    }
    const week = await Promise.all(weekPromises);

    // 5. 组装章节掌握度
    const chapters = CHAPTERS.map((chapter) => {
      const stats = chapterStats[chapter];
      if (!stats || stats.total === 0) return { chapter, mastery: 0 };
      return { chapter, mastery: Math.min(Math.round((stats.mastered / stats.total) * 100), 100) };
    });

    return {
      code: 0,
      data: {
        isDemo: false,
        streakDays: (user && user.streakDays) || 0,
        quizTotal,
        quizRate,
        studyHours: Math.round(((user && user.totalStudyMinutes) || 0) / 6) / 10,
        week,
        chapters
      }
    };
  } catch (err) {
    console.error('report error:', err);
    return { code: -1, msg: '获取学习报告失败' };
  }
};
