// cloudfunctions/admin/modules/userModule.js
const { parsePagination } = require('../lib/helpers');
const { requireRole } = require('../lib/middleware');

// user.list: 查询用户列表
async function list(db, event, admin) {
  const _ = db.command;
  const { skip, limit, page, pageSize } = parsePagination(event);
  const { search = '', banned } = event;

  let query = {};
  if (search) {
    query = _.or([
      { nickname: db.RegExp({ regexp: search, options: 'i' }) },
      { email: db.RegExp({ regexp: search, options: 'i' }) }
    ]);
  }
  if (banned !== undefined && banned !== '') {
    query.banned = !!banned;
  }

  const { total } = await db.collection('users').where(query).count();
  const { data } = await db.collection('users')
    .where(query)
    .field({ passwordHash: false })
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(limit)
    .get();

  const list = data.map((u) => ({
    _id: u._id,
    nickName: u.nickname || '',
    avatar: u.avatar || '',
    email: u.email || '',
    grade: u.grade || '',
    streakDays: u.streakDays || 0,
    totalStudyMinutes: u.totalStudyMinutes || 0,
    status: u.banned ? 'banned' : 'active',
    createdAt: u.createdAt || 0,
    lastLoginAt: u.updatedAt || 0
  }));

  return { code: 0, data: { list, total, page, pageSize } };
}

// user.detail: 用户详情
async function detail(db, event, admin) {
  const { userId } = event;
  if (!userId) return { code: 400, msg: '缺少 userId' };

  const { data: user } = await db.collection('users').doc(userId).get();
  if (!user) return { code: 404, msg: '用户不存在' };

  // 查询学生学习进度统计
  const _ = db.command;
  const userID = user.userID || '';
  const progressCond = userID
    ? _.or([{ _openid: user._openid || '' }, { userID: userID }])
    : { _openid: user._openid || '' };

  const [quizCount, lessonCount, mistakeCount] = await Promise.all([
    db.collection('study_progress').where(Object.assign({}, progressCond, { type: 'quiz' })).count(),
    db.collection('study_progress').where(Object.assign({}, progressCond, { type: 'lesson' })).count(),
    db.collection('mistakes').where(progressCond).count()
  ]);

  // 获取最近学习记录
  const { data: progressRecords } = await db.collection('study_progress')
    .where(progressCond)
    .orderBy('updatedAt', 'desc')
    .limit(10)
    .get();

  const records = progressRecords.map(p => ({
    courseName: p.courseName || p.chapter,
    progress: p.progress || 0,
    lastStudyTime: p.updatedAt
  }));

  return {
    code: 0,
    data: {
      user: {
        _id: user._id,
        nickName: user.nickname || '',
        avatar: user.avatar || '',
        email: user.email || '',
        grade: user.grade || '',
        streakDays: user.streakDays || 0,
        totalStudyMinutes: user.totalStudyMinutes || 0,
        status: user.banned ? 'banned' : 'active',
        createdAt: user.createdAt || 0,
        updatedAt: user.updatedAt || 0,
        lastLoginAt: user.updatedAt || 0
      },
      stats: {
        quizCount: quizCount.total,
        lessonCount: lessonCount.total,
        mistakeCount: mistakeCount.total
      },
      records: records
    }
  };
}

// user.updateStatus: 封禁/解封用户（接受 status 字段以适配前端）
async function updateStatus(db, event, admin) {
  const roleErr = requireRole(admin, 'editor');
  if (roleErr) return roleErr;

  const { userId, status, banned } = event;
  // 兼容旧参数 banned 和新参数 status
  const isBanned = banned !== undefined ? !!banned : status === 'banned';

  await db.collection('users').doc(userId).update({
    data: { banned: isBanned, updatedAt: Date.now() }
  });

  return { code: 0, msg: isBanned ? '已封禁' : '已解封' };
}

// user.batchUpdateStatus: 批量封禁/解封用户
async function batchUpdateStatus(db, event, admin) {
  const roleErr = requireRole(admin, 'superadmin');
  if (roleErr) return roleErr;

  const { userIds, status } = event;
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return { code: -1, msg: '缺少 userIds' };
  }
  if (!['active', 'banned'].includes(status)) {
    return { code: -1, msg: '状态无效' };
  }
  if (userIds.length > 100) {
    return { code: -1, msg: '单次最多处理 100 个用户' };
  }

  const _ = db.command;
  const { stats } = await db.collection('users')
    .where({ _id: _.in(userIds) })
    .update({ data: { banned: status === 'banned', updatedAt: Date.now() } });

  return { code: 0, data: { updated: stats.updated }, msg: '已更新 ' + stats.updated + ' 个用户' };
}

// user.resetProgress: 重置学生学习进度（优化为批量删除）
async function resetProgress(db, event, admin) {
  const roleErr = requireRole(admin, 'editor');
  if (roleErr) return roleErr;

  const { userId } = event;
  if (!userId) return { code: 400, msg: '缺少 userId' };

  const { data: user } = await db.collection('users').doc(userId).get();
  if (!user) return { code: 404, msg: '用户不存在' };

  const _ = db.command;
  const userID = user.userID || '';
  const cond = userID
    ? _.or([{ _openid: user._openid || '' }, { userID: userID }])
    : { _openid: user._openid || '' };

  // 批量删除学习进度记录（使用批量操作减少调用）
  const { data: progressRecords } = await db.collection('study_progress')
    .where(cond)
    .field({ _id: true })
    .limit(1000)
    .get();

  if (progressRecords.length > 0) {
    // 分批删除，每批不超过 100 条
    const batchSize = 50;
    for (let i = 0; i < progressRecords.length; i += batchSize) {
      const batch = progressRecords.slice(i, i + batchSize);
      const ids = batch.map(r => r._id);
      await db.collection('study_progress').where({ _id: _.in(ids) }).remove();
    }
  }

  // 重置用户统计字段
  await db.collection('users').doc(userId).update({
    data: { streakDays: 0, totalStudyMinutes: 0, updatedAt: Date.now() }
  });

  return { code: 0, msg: '学习进度已重置' };
}

module.exports = { list, detail, updateStatus, batchUpdateStatus, resetProgress };
