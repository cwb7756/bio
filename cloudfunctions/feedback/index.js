// 云函数 feedback - 意见反馈
// submit: 提交反馈（类型+文字+图片fileID+联系方式）；list: 查询我的历史反馈（图片换临时URL）
// 注意：写入必须带 _openid（云函数端 add 不会自动注入）；查询需兼容旧数据仅含 userID 的记录
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const MAX_CONTENT_LEN = 2000;   // 反馈内容最大字数
const MAX_IMAGES = 3;           // 图片最大张数
const MAX_CONTACT_LEN = 100;    // 联系方式最大长度
const VALID_TYPES = ['suggest', 'bug', 'other'];

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

async function findUser(openid) {
  if (!openid) return null;
  const { data } = await db.collection('users').where({ _openid: openid }).limit(1).get();
  return data.length > 0 ? data[0] : null;
}

// 提交反馈
async function submit(event, openid) {
  const user = await findUser(openid);
  if (!user) {
    return { code: 401, msg: '请先登录' };
  }

  const content = (event.content || '').trim();
  if (!content) {
    return { code: 400, msg: '反馈内容不能为空' };
  }
  if (content.length > MAX_CONTENT_LEN) {
    return { code: 400, msg: '反馈内容最多 ' + MAX_CONTENT_LEN + ' 字' };
  }

  const type = VALID_TYPES.indexOf(event.type) >= 0 ? event.type : 'other';
  const contact = (event.contact || '').trim().slice(0, MAX_CONTACT_LEN);

  // 仅接受云存储 fileID，防止注入外部链接
  let images = Array.isArray(event.images) ? event.images : [];
  images = images
    .filter((f) => typeof f === 'string' && f.indexOf('cloud://') === 0)
    .slice(0, MAX_IMAGES);

  const res = await db.collection('feedbacks').add({
    data: {
      _openid: openid,
      userID: user._id, // 保留 userID 兼容历史数据格式（值为用户文档 _id）
      type: type,
      content: content,
      images: images,
      contact: contact,
      status: 'pending',
      createdAt: Date.now()
    }
  });

  return { code: 0, data: { id: res._id } };
}

// 查询我的历史反馈（按时间倒序，图片 fileID 批量换临时 URL）
async function list(event, openid) {
  if (!openid) {
    return { code: 401, msg: '请先登录' };
  }
  const page = Math.max(1, parseInt(event.page, 10) || 1);
  const pageSize = Math.min(20, Math.max(1, parseInt(event.pageSize, 10) || 10));

  const user = await findUser(openid);
  // 兼容旧数据：早期反馈记录只有 userID（值为用户文档 _id），新记录才有 _openid
  const whereCond = user
    ? db.command.or([{ _openid: openid }, { userID: user._id }])
    : { _openid: openid };

  const { data } = await db.collection('feedbacks')
    .where(whereCond)
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();

  // 收集所有图片 fileID，批量换临时链接
  const fileIDs = [];
  data.forEach((item) => {
    (item.images || []).forEach((f) => {
      if (fileIDs.indexOf(f) < 0) fileIDs.push(f);
    });
  });

  const urlMap = {};
  if (fileIDs.length > 0) {
    try {
      const tmp = await cloud.getTempFileURL({ fileList: fileIDs });
      (tmp.fileList || []).forEach((f) => {
        if (f.status === 0) urlMap[f.fileID] = f.tempFileURL;
      });
    } catch (e) {
      console.error('getTempFileURL error:', e);
    }
  }

  const listData = data.map((item) => ({
    _id: item._id,
    type: item.type || 'other',
    content: item.content || '',
    status: item.status || 'pending',
    reply: item.reply || '',
    createdAt: item.createdAt || 0,
    repliedAt: item.repliedAt || 0,
    images: (item.images || [])
      .map((f) => urlMap[f] || '')
      .filter((u) => !!u)
  }));

  return { code: 0, data: { list: listData, hasMore: data.length === pageSize } };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { action = 'submit' } = event;

  const validErr = validateParams(event);
  if (validErr) return validErr;

  try {
    switch (action) {
      case 'submit':
        return await submit(event, OPENID);
      case 'list':
        return await list(event, OPENID);
      default:
        return { code: -1, msg: '未知的操作类型' };
    }
  } catch (err) {
    console.error('feedback error:', err);
    return { code: -1, msg: '反馈服务异常' };
  }
};
