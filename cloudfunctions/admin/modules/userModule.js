// cloudfunctions/admin/modules/userModule.js
const { parsePagination } = require('../lib/helpers');
const { requireRole } = require('../lib/middleware');

// user.list: 分页查询用户列表
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
    nickname: u.nickname || '',
    avatar: u.avatar || '',
    email: u.email || '',
    grade: u.grade || '',
    streakDays: u.streakDays || 0,
    totalStudyMinutes: u.totalStudyMinutes || 0,
    banned: u.banned || false,
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

  // 查询用户学习进度统计
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

  return {
    code: 0,
    data: {
      user: {
        _id: user._id,
        nickname: user.nickname || '',
        avatar: user.avatar || '',
        email: user.email || '',
        grade: user.grade || '',
        streakDays: user.streakDays || 0,
        totalStudyMinutes: user.totalStudyMinutes || 0,
        banned: user.banned || false,
        createdAt: user.createdAt || 0,
        updatedAt: user.updatedAt || 0
      },
      stats: {
        quizCount: quizCount.total,
        lessonCount: lessonCount.total,
        mistakeCount: mistakeCount.total
      }
    }
  };
}

// user.updateStatus: 封禁/解封用户
async function updateStatus(db, event, admin) {
  const roleErr = requireRole(admin, 'editor');
  if (roleErr) return roleErr;

  const { userId, banned } = event;
  if (!userId) return { code: 400, msg: '缺少 userId' };

  await db.collection('users').doc(userId).update({
    data: { banned: !!banned, updatedAt: Date.now() }
  });

  return { code: 0, msg: banned ? '已封禁' : '已解封' };
}

// user.resetProgress: 重置用户学习进度
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

  // 删除学习进度记录
  const { data: progressRecords } = await db.collection('study_progress')
    .where(cond)
    .field({ _id: true })
    .limit(1000)
    .get();

  for (let i = 0; i < progressRecords.length; i++) {
    await db.collection('study_progress').doc(progressRecords[i]._id).remove();
  }

  // 重置用户表统计字段
  await db.collection('users').doc(userId).update({
    data: { streakDays: 0, totalStudyMinutes: 0, updatedAt: Date.now() }
  });

  return { code: 0, msg: '学习进度已重置' };
}

module.exports = { list, detail, updateStatus, resetProgress };
