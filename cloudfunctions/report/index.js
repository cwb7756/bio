// 云函数 report - 学习报告
// 聚合 users / study_progress：打卡、刷题、正确率、时长、近7天分布、章节掌握度
// 用户无学习记录时返回 demo 示例数据
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const CHAPTERS = ['必修一', '必修二', '选择性必修一', '选择性必修二', '选择性必修三'];

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
  const { userID = '' } = event;

  try {
    // 1. 用户基础数据
    let user = null;
    if (OPENID) {
      const { data } = await db.collection('users').where({ _openid: OPENID }).limit(1).get();
      user = data[0] || null;
    }
    if (!user && userID) {
      const { data } = await db.collection('users').where({ userID }).limit(1).get();
      user = data[0] || null;
    }

    // 2. 学习记录（仅拼接存在的标识，避免空对象匹配全部文档）
    const clauses = [];
    if (OPENID) clauses.push({ _openid: OPENID });
    if (userID) clauses.push({ userID });
    if (clauses.length === 0) {
      return { code: 0, data: demoReport() };
    }
    const condition = clauses.length === 1 ? clauses[0] : _.or(clauses);
    const { data: records } = await db.collection('study_progress')
      .where(condition)
      .limit(1000)
      .get();

    if (records.length === 0) {
      return { code: 0, data: demoReport() };
    }

    // 3. 刷题统计
    const quizRecords = records.filter((r) => r.type === 'quiz');
    const quizTotal = quizRecords.length;
    const quizCorrect = quizRecords.filter((r) => r.correct).length;
    const quizRate = quizTotal > 0 ? Math.round((quizCorrect / quizTotal) * 100) : 0;

    // 4. 近7天学习分布（按记录数）
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekLabels = ['日', '一', '二', '三', '四', '五', '六'];
    const week = [];
    for (let i = 6; i >= 0; i--) {
      const start = dayStart - i * 86400000;
      const end = start + 86400000;
      const count = records.filter((r) => r.updatedAt >= start && r.updatedAt < end).length;
      const d = new Date(start);
      week.push({ label: weekLabels[d.getDay()], count });
    }

    // 5. 章节掌握度：该章节 已掌握flashcard + 答对quiz / 总记录
    const chapters = CHAPTERS.map((chapter) => {
      const chRecords = records.filter((r) => r.chapter === chapter);
      if (chRecords.length === 0) return { chapter, mastery: 0 };
      const mastered = chRecords.filter((r) =>
        (r.type === 'flashcard' && r.status === 'mastered') ||
        (r.type === 'quiz' && r.correct) ||
        (r.type === 'lesson')
      ).length;
      return { chapter, mastery: Math.min(Math.round((mastered / chRecords.length) * 100), 100) };
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
