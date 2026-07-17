// 云函数 flashcards - 速记卡片
// list: 系统卡(scope=system) + 用户自建卡；add: 新建用户卡；remove: 删除用户卡
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

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

// 卡片列表：系统卡 + 当前用户卡（条件查询替代全表扫描）
async function listCards(openid) {
  // 条件查询：系统卡 + 当前用户卡（_.or 在云函数服务端可用）
  const condition = openid
    ? _.or([{ scope: 'system' }, { _openid: openid }])
    : { scope: 'system' };

  const { data: all } = await db.collection('flashcards')
    .where(condition)
    .get();

  const cards = all.map((c) => ({
    _id: c._id,
    chapter: c.chapter || '',
    title: c.title,
    content: c.content,
    icon: c.icon || 'ic-folder',
    sort: c.sort || 0,
    mine: !!c._openid && c._openid === openid
  }));
  cards.sort((a, b) => (a.sort - b.sort) || (a.mine ? 1 : -1));
  return { code: 0, data: { cards } };
}

// 新建用户卡
async function addCard(event, openid) {
  const { title, content, chapter = '' } = event;
  if (!title || !content) {
    return { code: 400, msg: '标题和内容不能为空' };
  }
  if (!openid) {
    return { code: 401, msg: '请先登录' };
  }
  const now = Date.now();
  const doc = {
    _openid: openid,
    scope: 'user',
    chapter,
    title: String(title).slice(0, 30),
    content: String(content).slice(0, 500),
    icon: 'ic-folder',
    sort: 1000 + Math.floor(now / 1000) % 100000,
    createdAt: now
  };
  const { _id } = await db.collection('flashcards').add({ data: doc });
  return { code: 0, data: { _id } };
}

// 删除用户卡（仅本人）
async function removeCard(event, openid) {
  const { cardId } = event;
  if (!cardId) {
    return { code: 400, msg: '缺少 cardId' };
  }
  const { data } = await db.collection('flashcards').where({ _id: cardId }).get();
  if (data.length === 0) {
    return { code: 404, msg: '卡片不存在' };
  }
  if (!openid || !data[0]._openid || data[0]._openid !== openid) {
    return { code: 403, msg: '只能删除自己创建的卡片' };
  }
  await db.collection('flashcards').doc(cardId).remove();
  return { code: 0 };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { action = 'list' } = event;

  const validErr = validateParams(event);
  if (validErr) return validErr;

  try {
    switch (action) {
      case 'list':
        return await listCards(OPENID);
      case 'add':
        return await addCard(event, OPENID);
      case 'remove':
        return await removeCard(event, OPENID);
      default:
        return { code: -1, msg: '未知的操作类型' };
    }
  } catch (err) {
    console.error('flashcards error:', err);
    return { code: -1, msg: '速记卡片服务异常' };
  }
};
