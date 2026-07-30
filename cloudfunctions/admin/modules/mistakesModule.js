// cloudfunctions/admin/modules/mistakesModule.js
// 错题管理（管理员）：mistakes.list / mistakes.export / mistakes.bulkDelete
// 注意：mistakes 集合新数据使用 _openid 隔离，部分旧记录使用 userID（值为用户文档 _id），
// 按用户筛选时需通过 users 集合换取 _openid 并用 _.or() 兼容两种字段。
const { parsePagination } = require('../lib/helpers');

// 根据 users 文档 _id 构造错题查询条件（兼容 _openid / userID 双字段）
async function buildUserCond(db, userId) {
  const _ = db.command;
  const { data: user } = await db.collection('users').doc(userId).get();
  if (!user) return null;
  const conds = [];
  if (user._openid) conds.push({ _openid: user._openid });
  conds.push({ userID: userId });
  return conds.length > 1 ? _.or(conds) : conds[0];
}

// 构造 openid/userID -> 昵称 的映射，用于列表显示用户名
async function buildUserMaps(db) {
  const { data: users } = await db.collection('users')
    .field({ nickname: true, _openid: true })
    .limit(1000)
    .get();
  const byOpenid = {};
  const byId = {};
  users.forEach((u) => {
    if (u._openid) byOpenid[u._openid] = u.nickname || '未命名';
    byId[u._id] = u.nickname || '未命名';
  });
  return { byOpenid, byId };
}

function resolveNickname(m, maps) {
  return maps.byOpenid[m._openid] || maps.byId[m.userID] || '-';
}

// mistakes.list: 查询错题列表
async function list(db, event, admin) {
  const _ = db.command;
  const { skip, limit, page, pageSize } = parsePagination(event);
  const { search = '', userId = '' } = event;

  // 按用户筛选：通过 users 文档换取查询条件
  let userCond = null;
  if (userId) {
    userCond = await buildUserCond(db, userId);
    if (!userCond) return { code: 404, msg: '用户不存在' };
  }

  // 按关键词搜索（章节 / 题干 / 考点）
  let searchCond = null;
  const kw = String(search || '').trim().slice(0, 50);
  if (kw) {
    const reg = db.RegExp({ regexp: kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), options: 'i' });
    searchCond = _.or([{ chapter: reg }, { topic: reg }, { stem: reg }]);
  }

  let query = {};
  if (userCond && searchCond) {
    query = _.and([userCond, searchCond]);
  } else if (userCond) {
    query = userCond;
  } else if (searchCond) {
    query = searchCond;
  }

  const { total } = await db.collection('mistakes').where(query).count();
  const { data } = await db.collection('mistakes')
    .where(query)
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(limit)
    .get();

  const maps = await buildUserMaps(db);

  const list = data.map((m) => ({
    _id: m._id,
    questionId: m.questionId || '',
    chapter: m.chapter || '未分类',
    topic: m.topic || '',
    stem: m.stem || '',
    options: m.options || [],
    answer: m.answer || '',
    userAnswer: m.userAnswer || '',
    explanation: m.explanation || '',
    nickname: resolveNickname(m, maps),
    createdAt: m.createdAt || 0
  }));

  return { code: 0, data: { list, total, page, pageSize } };
}

// mistakes.export: 导出指定用户的错题数据
async function exportMistakes(db, event, admin) {
  const { userId } = event;
  if (!userId) return { code: 400, msg: '缺少 userId' };

  const cond = await buildUserCond(db, userId);
  if (!cond) return { code: 404, msg: '用户不存在' };

  const { data } = await db.collection('mistakes')
    .where(cond)
    .orderBy('createdAt', 'desc')
    .limit(1000)
    .get();

  const filename = 'mistakes-export-' + Date.now() + '.json';
  const content = data.map((m) => ({
    questionId: m.questionId || '',
    chapter: m.chapter || '未分类',
    topic: m.topic || '',
    stem: m.stem || '',
    options: m.options || [],
    answer: m.answer || '',
    userAnswer: m.userAnswer || '',
    explanation: m.explanation || '',
    errorTime: m.createdAt ? new Date(m.createdAt).toISOString() : ''
  }));

  return { code: 0, data: { filename, content } };
}

// mistakes.bulkDelete: 批量删除错题
async function bulkDelete(db, event, admin) {
  const _ = db.command;
  const { mistakeIds } = event;
  if (!Array.isArray(mistakeIds) || mistakeIds.length === 0) {
    return { code: 400, msg: '缺少 mistakeIds' };
  }
  if (mistakeIds.length > 100) {
    return { code: 400, msg: '单次最多删除 100 条' };
  }

  const res = await db.collection('mistakes')
    .where({ _id: _.in(mistakeIds) })
    .remove();

  return { code: 0, data: { removed: res.stats.removed } };
}

module.exports = { list, export: exportMistakes, bulkDelete };
