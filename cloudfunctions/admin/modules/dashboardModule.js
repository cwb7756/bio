// cloudfunctions/admin/modules/dashboardModule.js
const { todayStart, lastNDays } = require('../lib/helpers');

// dashboard.stats: 核心统计数据
async function stats(db, _event, _admin) {
  const _ = db.command;
  const ts = todayStart();
  const sevenDaysAgo = ts - 6 * 86400000;

  // 并行查询所有统计
  const [
    usersCount,
    todayNewUsers,
    activeUsers,
    quizTotal,
    coursesCount,
    quizQuestionsCount,
    feedbackPending
  ] = await Promise.all([
    // 总用户数
    db.collection('users').count(),

    // 今日新增用户
    db.collection('users').where({ createdAt: _.gte(ts) }).count(),

    // 活跃用户（近 7 天有 study_progress 记录的用户数）
    db.collection('study_progress')
      .aggregate()
      .match({ updatedAt: _.gte(sevenDaysAgo) })
      .group({ _id: '$_openid' })
      .count('total')
      .end()
      .then((r) => (r.list.length > 0 ? r.list[0].total : 0))
      .catch(() => 0),

    // 刷题总量
    db.collection('study_progress').where({ type: 'quiz' }).count(),

    // 课程总数
    db.collection('courses').count(),

    // 题目总数
    db.collection('quiz_questions').count(),

    // 待处理反馈数
    db.collection('feedbacks').where({ status: 'pending' }).count()
  ]);

  // 近 7 天每日活跃折线数据
  const days = lastNDays(7);
  const weekLabels = ['日', '一', '二', '三', '四', '五', '六'];
  const weekData = await Promise.all(
    days.map((start) =>
      db.collection('study_progress')
        .where({ updatedAt: _.gte(start).and(_.lt(start + 86400000)) })
        .count()
        .then(({ total }) => ({ label: weekLabels[new Date(start).getDay()], count: total }))
    )
  );

  // 刷题正确率
  let quizRate = 0;
  try {
    const $ = db.command.aggregate;
    const quizAgg = await db.collection('study_progress')
      .aggregate()
      .match({ type: 'quiz' })
      .group({
        _id: null,
        total: $.sum(1),
        correct: $.sum($.cond({ if: '$correct', then: 1, else: 0 }))
      })
      .end();
    if (quizAgg.list.length > 0) {
      const item = quizAgg.list[0];
      quizRate = item.total > 0 ? Math.round((item.correct / item.total) * 100) : 0;
    }
  } catch (e) {
    // 聚合失败时跳过
  }

  return {
    code: 0,
    data: {
      totalUsers: usersCount.total,
      todayNew: todayNewUsers.total,
      activeUsers: activeUsers,
      totalQuizzes: quizTotal.total,
      accuracyRate: quizRate,
      courseCount: coursesCount.total,
      quizCount: quizQuestionsCount.total,
      feedbackPending: feedbackPending.total,
      weekActivity: weekData
    }
  };
}

module.exports = { stats };
