// 云函数 login - 用户认证（微信登录 + 邮箱登录/注册）
// 兼容现有 users 集合 schema：nickname, avatar, passwordHash(bcrypt), createdAt/updatedAt(时间戳)
// 注意：users 集合存在 username_unique / nickname_unique 唯一索引，创建用户时必须写入唯一的 username 与 nickname
const cloud = require('wx-server-sdk');
const bcrypt = require('bcryptjs');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 生成随机后缀，规避 nickname/username 唯一索引冲突
function randSuffix(len = 6) {
  return Math.random().toString(36).slice(2, 2 + len);
}

// 去除敏感字段
function toSafe(user) {
  const safe = { ...user };
  delete safe.passwordHash;
  return safe;
}

/**
 * 微信登录：通过 openid 认证（不依赖 getUserProfile）
 */
async function wxLogin(event) {
  const { OPENID } = cloud.getWXContext();
  const { nickName, avatarUrl } = event;

  if (!OPENID) {
    return { code: -1, msg: '无法获取微信身份，请在小程序内登录' };
  }

  const { data } = await db.collection('users')
    .where({ _openid: OPENID })
    .get();

  const now = Date.now();

  if (data.length > 0) {
    // 已存在用户，仅更新登录时间与可选资料（不覆盖唯一字段为空值）
    const user = data[0];
    const updateData = { updatedAt: now };
    if (nickName) updateData.nickname = nickName;
    if (avatarUrl) updateData.avatar = avatarUrl;
    await db.collection('users').doc(user._id).update({ data: updateData });
    return { code: 0, user: toSafe({ ...user, ...updateData }), isNewUser: false };
  }

  // 新用户，写入唯一的 username(openid) 与 nickname
  const newUser = {
    _openid: OPENID,
    username: OPENID,
    nickname: nickName || ('生物爱好者' + randSuffix()),
    avatar: avatarUrl || '',
    email: '',
    grade: '',
    streakDays: 0,
    totalStudyMinutes: 0,
    createdAt: now,
    updatedAt: now
  };
  const { _id } = await db.collection('users').add({ data: newUser });
  return { code: 0, user: toSafe({ _id, ...newUser }), isNewUser: true };
}

/**
 * 邮箱登录：邮箱不存在则提示未注册，不再自动创建
 */
async function emailLogin(event) {
  const { email, password } = event;

  if (!email || !password) {
    return { code: -1, msg: '邮箱和密码不能为空' };
  }

  const { data } = await db.collection('users')
    .where({ email })
    .get();

  if (data.length === 0) {
    return { code: -1, msg: '该邮箱未注册，请先注册' };
  }

  const user = data[0];
  if (!user.passwordHash) {
    return { code: -1, msg: '该账号未设置密码，请使用微信登录' };
  }
  if (!bcrypt.compareSync(password, user.passwordHash)) {
    return { code: -1, msg: '密码错误' };
  }

  const now = Date.now();
  await db.collection('users').doc(user._id).update({ data: { updatedAt: now } });
  return { code: 0, user: toSafe({ ...user, updatedAt: now }), isNewUser: false };
}

/**
 * 邮箱注册：邮箱已存在则提示，否则创建（写入唯一 username=email 与 nickname）
 */
async function emailRegister(event) {
  const { email, password, nickName } = event;

  if (!email || !password) {
    return { code: -1, msg: '邮箱和密码不能为空' };
  }
  if (password.length < 6) {
    return { code: -1, msg: '密码至少6位' };
  }

  const { data } = await db.collection('users')
    .where({ email })
    .get();

  if (data.length > 0) {
    return { code: -1, msg: '该邮箱已注册，请直接登录' };
  }

  const { OPENID } = cloud.getWXContext();
  const now = Date.now();
  const passwordHash = bcrypt.hashSync(password, bcrypt.genSaltSync(10));

  const newUser = {
    _openid: OPENID || '',
    username: email,
    nickname: nickName || (email.split('@')[0] + randSuffix(4)),
    avatar: '',
    email,
    passwordHash,
    grade: '',
    streakDays: 0,
    totalStudyMinutes: 0,
    createdAt: now,
    updatedAt: now
  };
  const { _id } = await db.collection('users').add({ data: newUser });
  return { code: 0, user: toSafe({ _id, ...newUser }), isNewUser: true };
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const { action } = event;

  try {
    switch (action) {
      case 'wxLogin':
        return await wxLogin(event);
      case 'emailLogin':
        return await emailLogin(event);
      case 'emailRegister':
        return await emailRegister(event);
      default:
        return { code: -1, msg: '未知的操作类型' };
    }
  } catch (err) {
    console.error('login error:', err);
    // 唯一索引冲突的友好提示
    const msg = String(err && (err.errMsg || err.message) || '');
    if (msg.includes('duplicate key')) {
      return { code: -1, msg: '账号信息冲突，请重试' };
    }
    return { code: -1, msg: '服务器异常，请稍后重试' };
  }
};
