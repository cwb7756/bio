// 云函数 mistakes - 错题本
// list: 用户错题列表（无记录时返回空列表 + isDemo）；add: 收藏错题（防重）；remove: 删除错题
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

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

// 错题列表：仅查当前用户记录，无记录返回空列表 + isDemo
async function listMistakes(openid, skip, limit) {
  if (!openid) {
    return { code: 0, list: [], total: 0, isDemo: true };
  }

  const condition = { _openid: openid };
  const { total } = await db.collection('mistakes').where(condition).count();

  if (total === 0) {
    return { code: 0, list: [], total: 0, isDemo: true };
  }

  const { data } = await db.collection('mistakes')
    .where(condition)
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(limit)
    .get();

  return { code: 0, list: data.map((m) => formatMistake(m, false)), total, isDemo: false };
}

// 收藏错题：同一用户同一题仅保留最新一条
async function addMistake(event, openid) {
  const { questionId, chapter = '', topic = '', stem, options = [], answer, userAnswer = '', explanation = '' } = event;
  if (!stem || !answer) {
    return { code: 400, msg: '缺少题目内容' };
  }
  if (!openid) {
    return { code: 401, msg: '请先登录' };
  }

  const now = Date.now();
  const doc = {
    _openid: openid,
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
  if (questionId) {
    const { data: exist } = await db.collection('mistakes')
      .where({ _openid: openid, questionId })
      .limit(1)
      .get();
    if (exist.length > 0) {
      // 防重更新：作答与解析同步刷新（AI 生成解析后回写错题本走此分支）
      const updateData = { userAnswer, createdAt: now };
      if (explanation) updateData.explanation = String(explanation).slice(0, 1000);
      await db.collection('mistakes').doc(exist[0]._id).update({
        data: updateData
      });
      return { code: 0, data: { _id: exist[0]._id, duplicated: true } };
    }
  }

  const { _id } = await db.collection('mistakes').add({ data: doc });
  return { code: 0, data: { _id } };
}

// 删除错题（仅本人）
async function removeMistake(event, openid) {
  const { mistakeId } = event;
  if (!mistakeId) {
    return { code: 400, msg: '缺少 mistakeId' };
  }
  const { data } = await db.collection('mistakes').where({ _id: mistakeId }).limit(1).get();
  if (data.length === 0) {
    return { code: 404, msg: '记录不存在' };
  }
  const m = data[0];
  if (!openid || m._openid !== openid) {
    return { code: 403, msg: '只能删除自己的错题' };
  }
  await db.collection('mistakes').doc(mistakeId).remove();
  return { code: 0 };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { action = 'list', skip = 0, limit = 20 } = event;

  const validErr = validateParams(event);
  if (validErr) return validErr;

  // 分页参数校验与规范化
  const pageNum = Math.max(0, parseInt(skip, 10) || 0);
  const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  try {
    switch (action) {
      case 'list':
        return await listMistakes(OPENID, pageNum, pageSize);
      case 'add':
        return await addMistake(event, OPENID);
      case 'remove':
        return await removeMistake(event, OPENID);
      default:
        return { code: -1, msg: '未知的操作类型' };
    }
  } catch (err) {
    console.error('mistakes error:', err);
    return { code: -1, msg: '错题本服务异常' };
  }
};
