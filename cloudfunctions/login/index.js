// 云函数 login - 用户认证（微信登录 + 邮箱登录/注册）
// 兼容现有 users 集合 schema：nickname, avatar, passwordHash(bcrypt), createdAt/updatedAt(时间戳)
// 注意：users 集合存在 username_unique / nickname_unique 唯一索引，创建用户时必须写入唯一的 username 与 nickname
const cloud = require('wx-server-sdk');
const bcrypt = require('bcryptjs');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 速率限制常量
const LOCK_THRESHOLD = 5;              // 连续失败 5 次锁定
const LOCK_DURATION = 15 * 60 * 1000;  // 锁定 15 分钟

// 生成随机后缀，规避 nickname/username 唯一索引冲突
function randSuffix(len) {
  if (len === undefined) len = 6;
  return Math.random().toString(36).slice(2, 2 + len);
}

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

// 脱敏：仅返回安全字段
function toSafe(user) {
  return {
    nickname: user.nickname || '',
    avatar: user.avatar || '',
    email: user.email || '',
    grade: user.grade || '',
    streakDays: user.streakDays || 0,
    totalStudyMinutes: user.totalStudyMinutes || 0
  };
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
 * 增加 OPENID 绑定一致性校验 + 速率限制
 */
async function emailLogin(event) {
  const { OPENID } = cloud.getWXContext();
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

  // 速率限制：检查是否被锁定
  const now = Date.now();
  let failCount = user.loginFailCount || 0;
  const lastFailAt = user.lastFailAt || 0;

  if (failCount >= LOCK_THRESHOLD) {
    if (now - lastFailAt < LOCK_DURATION) {
      const remainMinutes = Math.ceil((LOCK_DURATION - (now - lastFailAt)) / 60000);
      return { code: -1, msg: '密码错误次数过多，请 ' + remainMinutes + ' 分钟后再试' };
    }
    // 锁定已过期，重置计数
    await db.collection('users').doc(user._id).update({
      data: { loginFailCount: 0, lastFailAt: 0 }
    });
    failCount = 0;  // 同步内存变量
  }

  // 验证密码（异步）
  const matched = await bcrypt.compare(password, user.passwordHash);
  if (!matched) {
    // 增加失败计数
    const newFailCount = failCount + 1;
    await db.collection('users').doc(user._id).update({
      data: { loginFailCount: newFailCount, lastFailAt: now }
    });
    const remaining = LOCK_THRESHOLD - newFailCount;
    if (remaining > 0) {
      return { code: -1, msg: '密码错误，还剩 ' + remaining + ' 次尝试机会' };
    }
    return { code: -1, msg: '密码错误次数过多，请 15 分钟后再试' };
  }

  // 验证成功：OPENID 绑定与一致性校验
  if (!user._openid) {
    // 首次登录：绑定当前 OPENID
    await db.collection('users').doc(user._id).update({
      data: { _openid: OPENID, loginFailCount: 0, lastFailAt: 0, updatedAt: now }
    });
    user._openid = OPENID;
  } else if (OPENID && user._openid !== OPENID) {
    return { code: -1, msg: '该账号已在其他设备绑定' };
  } else {
    // 同一设备登录：重置失败计数
    await db.collection('users').doc(user._id).update({
      data: { loginFailCount: 0, lastFailAt: 0, updatedAt: now }
    });
  }

  return { code: 0, user: toSafe({ ...user, loginFailCount: 0, lastFailAt: 0, updatedAt: now }), isNewUser: false };
}

/**
 * 邮箱注册：邮箱已存在则提示，否则创建（写入唯一 username=email 与 nickname）
 * 必须在微信小程序内注册（需 OPENID）
 */
async function emailRegister(event) {
  const { email, password, nickName } = event;

  if (!email || !password) {
    return { code: -1, msg: '邮箱和密码不能为空' };
  }
  if (password.length < 6) {
    return { code: -1, msg: '密码至少6位' };
  }

  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { code: -1, msg: '请在微信小程序内注册' };
  }

  const { data } = await db.collection('users')
    .where({ email })
    .get();

  if (data.length > 0) {
    return { code: -1, msg: '该邮箱已注册，请直接登录' };
  }

  const now = Date.now();
  const passwordHash = await bcrypt.hash(password, 10);

  const newUser = {
    _openid: OPENID,
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
 * 更新个人资料：昵称、头像、年级、邮箱、密码（可选绑定）
 * 昵称与邮箱需唯一性校验（排除自身）
 */
async function updateProfile(event) {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { code: -1, msg: '无法获取用户身份' };
  }

  const { nickname, avatar, grade, email, password } = event;

  if (!nickname || !nickname.trim()) {
    return { code: -1, msg: '昵称不能为空' };
  }

  // 查找当前用户
  const { data } = await db.collection('users')
    .where({ _openid: OPENID })
    .get();

  if (data.length === 0) {
    return { code: -1, msg: '用户不存在，请重新登录' };
  }

  const user = data[0];
  const _ = db.command;
  const now = Date.now();
  const updateData = { updatedAt: now };

  // 昵称唯一性校验（排除自身）
  if (nickname.trim() !== user.nickname) {
    const nickCheck = await db.collection('users')
      .where({ nickname: nickname.trim(), _id: _.neq(user._id) })
      .get();
    if (nickCheck.data.length > 0) {
      return { code: -1, msg: '该昵称已被使用，请换一个' };
    }
    updateData.nickname = nickname.trim();
  }

  if (avatar !== undefined) updateData.avatar = avatar;
  if (grade !== undefined) updateData.grade = grade;

  // 邮箱绑定（可选）
  if (email && email.trim()) {
    if (email.trim() !== user.email) {
      const emailCheck = await db.collection('users')
        .where({ email: email.trim(), _id: _.neq(user._id) })
        .get();
      if (emailCheck.data.length > 0) {
        return { code: -1, msg: '该邮箱已被绑定，请换一个' };
      }
      updateData.email = email.trim();
      // 绑定邮箱时同步 username 以保持一致
      updateData.username = email.trim();
    }
  }

  // 密码设置（可选，需配合邮箱）
  if (password) {
    if (password.length < 6) {
      return { code: -1, msg: '密码至少6位' };
    }
    updateData.passwordHash = await bcrypt.hash(password, 10);
  }

  await db.collection('users').doc(user._id).update({ data: updateData });
  return { code: 0, user: toSafe({ ...user, ...updateData }) };
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const { action } = event;

  const validErr = validateParams(event);
  if (validErr) return validErr;

  try {
    switch (action) {
      case 'wxLogin':
        return await wxLogin(event);
      case 'emailLogin':
        return await emailLogin(event);
      case 'emailRegister':
        return await emailRegister(event);
      case 'updateProfile':
        return await updateProfile(event);
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

// ---------- 测试导出 ----------
exports.toSafe = toSafe;
exports.validateParams = validateParams;
exports.emailLogin = emailLogin;
exports.wxLogin = wxLogin;
exports.emailRegister = emailRegister;
exports.updateProfile = updateProfile;
exports.LOCK_THRESHOLD = LOCK_THRESHOLD;
exports.LOCK_DURATION = LOCK_DURATION;
