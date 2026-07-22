// 云函数 notebook - 我的笔记本
// list: 用户笔记列表（无记录时附带系统示例 + isDemo）；add: 收录笔记（防重）；
// updateLayout: 批量保存画布坐标；remove: 删除笔记
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 画布两列网格布局参数（rpx）
const CANVAS_PAD = 30;    // 画布左边距
const CARD_W = 320;       // 卡片宽度
const COL_GAP = 20;       // 列间距
const ROW_H = 360;        // 新卡片默认行高

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

function formatNote(n, isDemo) {
  return {
    _id: n._id,
    type: n.type || 'knowledge',
    source: n.source || '',
    refId: n.refId || '',
    title: n.title || '',
    content: n.content || '',
    meta: n.meta || {},
    x: typeof n.x === 'number' ? n.x : CANVAS_PAD,
    y: typeof n.y === 'number' ? n.y : CANVAS_PAD,
    createdAt: n.createdAt || 0,
    isDemo: !!isDemo
  };
}

// 笔记列表：仅查当前用户记录，无记录时返回系统示例 + isDemo
async function listNotes(openid) {
  if (openid) {
    const { data } = await db.collection('notebook')
      .where({ _openid: openid })
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();
    if (data.length > 0) {
      return { code: 0, data: { notes: data.map((n) => formatNote(n, false)), isDemo: false } };
    }
  }
  // 无自有笔记：返回系统示例
  const { data: demos } = await db.collection('notebook')
    .where({ scope: 'system' })
    .orderBy('createdAt', 'asc')
    .limit(20)
    .get();
  return { code: 0, data: { notes: demos.map((n) => formatNote(n, true)), isDemo: true } };
}

// 收录笔记：同 refId + type 防重
async function addNote(event, openid) {
  const { type, source = '', refId = '', title, content = '', meta = {} } = event;
  if (!openid) {
    return { code: 401, msg: '请先登录' };
  }
  const validTypes = ['knowledge', 'course', 'ai', 'mistake'];
  if (validTypes.indexOf(type) === -1) {
    return { code: 400, msg: '无效的笔记类型' };
  }
  if (!title) {
    return { code: 400, msg: '缺少笔记标题' };
  }

  // 防重：同一用户同一来源内容仅收录一次
  if (refId) {
    const { data: exist } = await db.collection('notebook')
      .where({ _openid: openid, type, refId })
      .limit(1)
      .get();
    if (exist.length > 0) {
      return { code: 0, data: { _id: exist[0]._id, duplicated: true } };
    }
  }

  // 新笔记初始坐标：按现有数量落在两列网格空位
  const { total } = await db.collection('notebook').where({ _openid: openid }).count();
  const col = total % 2;
  const row = Math.floor(total / 2);
  const x = CANVAS_PAD + col * (CARD_W + COL_GAP);
  const y = CANVAS_PAD + row * ROW_H;

  const now = Date.now();
  const doc = {
    _openid: openid,
    scope: 'user',
    type,
    source: String(source).slice(0, 30),
    refId: String(refId).slice(0, 100),
    title: String(title).slice(0, 100),
    content: String(content).slice(0, 1000),
    meta: typeof meta === 'object' && meta ? meta : {},
    x,
    y,
    createdAt: now,
    updatedAt: now
  };
  const { _id } = await db.collection('notebook').add({ data: doc });
  return { code: 0, data: { _id } };
}

// 批量保存拖拽后的坐标（仅本人文档）
async function updateLayout(event, openid) {
  const { items } = event;
  if (!openid) {
    return { code: 401, msg: '请先登录' };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { code: 400, msg: '缺少布局数据' };
  }
  const now = Date.now();
  const tasks = items
    .filter((it) => it && it.id && typeof it.x === 'number' && typeof it.y === 'number')
    .map((it) =>
      db.collection('notebook')
        .where({ _id: it.id, _openid: openid })
        .update({ data: { x: it.x, y: it.y, updatedAt: now } })
    );
  await Promise.all(tasks);
  return { code: 0, data: { updated: tasks.length } };
}

// 删除笔记（仅本人）
async function removeNote(event, openid) {
  const { noteId } = event;
  if (!noteId) {
    return { code: 400, msg: '缺少 noteId' };
  }
  const { data } = await db.collection('notebook').where({ _id: noteId }).limit(1).get();
  if (data.length === 0) {
    return { code: 404, msg: '笔记不存在' };
  }
  if (!openid || data[0]._openid !== openid) {
    return { code: 403, msg: '只能删除自己的笔记' };
  }
  await db.collection('notebook').doc(noteId).remove();
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
        return await listNotes(OPENID);
      case 'add':
        return await addNote(event, OPENID);
      case 'updateLayout':
        return await updateLayout(event, OPENID);
      case 'remove':
        return await removeNote(event, OPENID);
      default:
        return { code: -1, msg: '未知的操作类型' };
    }
  } catch (err) {
    console.error('notebook error:', err);
    return { code: -1, msg: '笔记本服务异常' };
  }
};
