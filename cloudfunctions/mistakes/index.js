// 云函数 mistakes - 错题本
// list: 用户错题列表（无记录时返回 demo 示例）；add: 收藏错题（防重）；remove: 删除错题
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 构建用户查询条件：仅拼接存在的标识，避免空对象匹配全部文档
function userCondition(openid, userId, extra) {
  const clauses = [];
  if (openid) clauses.push({ _openid: openid, ...(extra || {}) });
  if (userId) clauses.push({ userID: userId, ...(extra || {}) });
  if (clauses.length === 0) return null;
  return clauses.length === 1 ? clauses[0] : _.or(clauses);
}

function formatMistake(m, isDemo) {
  return {
    _id: m._id,
    questionId: m.questionId || '',
    chapter: m.chapter || '',
    topic: m.topic || '',
    stem: m.stem,
    options: m.options || [],
    answer: m.answer,
    userAnswer: m.userAnswer || '',
    explanation: m.explanation || '',
    createdAt: m.createdAt || 0,
    isDemo: !!isDemo
  };
}

// 错题列表：优先用户真实记录，无记录回退 demo 示例
async function listMistakes(openid, userId) {
  let own = [];
  const condition = userCondition(openid, userId);
  if (condition) {
    const { data } = await db.collection('mistakes')
      .where(condition)
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();
    own = data;
  }

  if (own.length > 0) {
    return { code: 0, data: { mistakes: own.map((m) => formatMistake(m, false)), isDemo: false } };
  }

  // demo 兜底
  const { data: demo } = await db.collection('mistakes')
    .where({ userID: 'demo' })
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();
  return { code: 0, data: { mistakes: demo.map((m) => formatMistake(m, true)), isDemo: true } };
}

// 收藏错题：同一用户同一题仅保留最新一条
async function addMistake(event, openid, userId) {
  const { questionId, chapter = '', topic = '', stem, options = [], answer, userAnswer = '', explanation = '' } = event;
  if (!stem || !answer) {
    return { code: 400, msg: '缺少题目内容' };
  }
  if (!openid && !userId) {
    return { code: 401, msg: '请先登录' };
  }

  const now = Date.now();
  const doc = {
    _openid: openid || '',
    userID: userId || '',
    questionId: questionId || '',
    chapter,
    topic,
    stem: String(stem).slice(0, 500),
    options,
    answer,
    userAnswer,
    explanation: String(explanation).slice(0, 1000),
    createdAt: now
  };

  // 防重：同题更新而非重复插入
  const dupCondition = userCondition(openid, userId, { questionId });
  if (questionId && dupCondition) {
    const { data: exist } = await db.collection('mistakes')
      .where(dupCondition)
      .limit(1)
      .get();
    if (exist.length > 0) {
      await db.collection('mistakes').doc(exist[0]._id).update({
        data: { userAnswer, createdAt: now }
      });
      return { code: 0, data: { _id: exist[0]._id, duplicated: true } };
    }
  }

  const { _id } = await db.collection('mistakes').add({ data: doc });
  return { code: 0, data: { _id } };
}

// 删除错题（仅本人）
async function removeMistake(event, openid, userId) {
  const { mistakeId } = event;
  if (!mistakeId) {
    return { code: 400, msg: '缺少 mistakeId' };
  }
  const { data } = await db.collection('mistakes').where({ _id: mistakeId }).limit(1).get();
  if (data.length === 0) {
    return { code: 404, msg: '记录不存在' };
  }
  const m = data[0];
  const isOwner = (openid && m._openid === openid) || (userId && m.userID === userId);
  if (!isOwner) {
    return { code: 403, msg: '只能删除自己的错题' };
  }
  await db.collection('mistakes').doc(mistakeId).remove();
  return { code: 0 };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { action = 'list', userID = '' } = event;

  try {
    switch (action) {
      case 'list':
        return await listMistakes(OPENID, userID);
      case 'add':
        return await addMistake(event, OPENID, userID);
      case 'remove':
        return await removeMistake(event, OPENID, userID);
      default:
        return { code: -1, msg: '未知的操作类型' };
    }
  } catch (err) {
    console.error('mistakes error:', err);
    return { code: -1, msg: '错题本服务异常' };
  }
};
