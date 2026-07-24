// cloudfunctions/admin/modules/feedbackModule.js
const cloud = require('wx-server-sdk');
const { parsePagination } = require('../lib/helpers');
const { requireRole } = require('../lib/middleware');

// feedback.list: 反馈列表
async function list(db, event, admin) {
  const _ = db.command;
  const { skip, limit, page, pageSize } = parsePagination(event);
  const { status = '', type = '' } = event;

  let query = {};
  if (status) query.status = status;
  if (type) query.type = type;

  const { total } = await db.collection('feedbacks').where(query).count();
  const { data } = await db.collection('feedbacks')
    .where(query)
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(limit)
    .get();

  // 批量获取临时图片 URL
  const fileIDs = [];
  data.forEach((item) => {
    (item.images || []).forEach((f) => {
      if (typeof f === 'string' && f.indexOf('cloud://') === 0 && fileIDs.indexOf(f) < 0) {
        fileIDs.push(f);
      }
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
    contact: item.contact || '',
    status: item.status || 'pending',
    reply: item.reply || '',
    images: (item.images || []).map((f) => urlMap[f] || '').filter(Boolean),
    createdAt: item.createdAt || 0,
    repliedAt: item.repliedAt || 0
  }));

  return { code: 0, data: { list: listData, total, page, pageSize } };
}

// feedback.reply: 回复反馈
async function reply(db, event, admin) {
  const roleErr = requireRole(admin, 'editor');
  if (roleErr) return roleErr;

  const { feedbackId, replyContent } = event;
  if (!feedbackId || !replyContent) {
    return { code: -1, msg: '反馈 ID 和回复内容不能为空' };
  }

  await db.collection('feedbacks').doc(feedbackId).update({
    data: { reply: replyContent, status: 'replied', repliedAt: Date.now() }
  });

  return { code: 0, msg: '回复成功' };
}

// feedback.updateStatus: 更新反馈状态
async function updateStatus(db, event, admin) {
  const roleErr = requireRole(admin, 'editor');
  if (roleErr) return roleErr;

  const { feedbackId, status } = event;
  if (!feedbackId) return { code: -1, msg: '缺少 feedbackId' };

  const validStatuses = ['pending', 'replied', 'resolved', 'closed'];
  if (validStatuses.indexOf(status) < 0) {
    return { code: -1, msg: '无效的状态' };
  }

  await db.collection('feedbacks').doc(feedbackId).update({
    data: { status }
  });

  return { code: 0, msg: '状态更新成功' };
}

module.exports = { list, reply, updateStatus };
