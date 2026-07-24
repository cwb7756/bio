// cloudfunctions/admin/modules/authModule.js
const { signToken, hashPassword, comparePassword } = require('../lib/auth');
const { requireRole } = require('../lib/middleware');

const LOCK_THRESHOLD = 5;
const LOCK_DURATION = 15 * 60 * 1000;

// auth.init: 初始化超级管理员（仅 admins 集合为空时可调用）
async function init(db, event) {
  const { data: existing } = await db.collection('admins').limit(1).get();
  if (existing.length > 0) {
    return { code: -1, msg: '管理员已存在，禁止初始化' };
  }

  const { username, password } = event;
  if (!username || !password || password.length < 6) {
    return { code: -1, msg: '用户名不能为空，密码至少 6 位' };
  }

  const now = Date.now();
  const { _id } = await db.collection('admins').add({
    data: {
      username,
      passwordHash: hashPassword(password),
      role: 'superadmin',
      createdAt: now,
      updatedAt: now
    }
  });

  return { code: 0, msg: '超级管理员创建成功' };
}

// auth.login: 管理员登录
async function login(db, event) {
  const { username, password } = event;
  if (!username || !password) {
    return { code: -1, msg: '用户名和密码不能为空' };
  }

  const { data } = await db.collection('admins')
    .where({ username })
    .limit(1)
    .get();

  if (data.length === 0) {
    return { code: -1, msg: '用户名或密码错误' };
  }

  const admin = data[0];
  const now = Date.now();

  // 速率限制
  let failCount = admin.loginFailCount || 0;
  const lastFailAt = admin.lastFailAt || 0;
  if (failCount >= LOCK_THRESHOLD) {
    if (now - lastFailAt < LOCK_DURATION) {
      const remainMinutes = Math.ceil((LOCK_DURATION - (now - lastFailAt)) / 60000);
      return { code: -1, msg: '密码错误次数过多，请 ' + remainMinutes + ' 分钟后再试' };
    }
    await db.collection('admins').doc(admin._id).update({
      data: { loginFailCount: 0, lastFailAt: 0 }
    });
    failCount = 0;
  }

  if (!comparePassword(password, admin.passwordHash)) {
    const newFailCount = failCount + 1;
    await db.collection('admins').doc(admin._id).update({
      data: { loginFailCount: newFailCount, lastFailAt: now }
    });
    const remaining = LOCK_THRESHOLD - newFailCount;
    if (remaining > 0) {
      return { code: -1, msg: '用户名或密码错误，还剩 ' + remaining + ' 次尝试机会' };
    }
    return { code: -1, msg: '密码错误次数过多，请 15 分钟后再试' };
  }

  // 登录成功
  await db.collection('admins').doc(admin._id).update({
    data: { loginFailCount: 0, lastFailAt: 0, lastLoginAt: now, updatedAt: now }
  });

  const token = signToken({
    adminId: admin._id,
    username: admin.username,
    role: admin.role
  });

  return {
    code: 0,
    data: {
      token,
      admin: {
        _id: admin._id,
        username: admin.username,
        role: admin.role
      }
    }
  };
}

// auth.changePwd: 修改密码
async function changePwd(db, event, admin) {
  const { oldPassword, newPassword } = event;
  if (!oldPassword || !newPassword) {
    return { code: -1, msg: '旧密码和新密码不能为空' };
  }
  if (newPassword.length < 6) {
    return { code: -1, msg: '新密码至少 6 位' };
  }

  const { data } = await db.collection('admins').doc(admin.adminId).get();
  if (!data) {
    return { code: -1, msg: '管理员不存在' };
  }

  if (!comparePassword(oldPassword, data.passwordHash)) {
    return { code: -1, msg: '旧密码错误' };
  }

  await db.collection('admins').doc(admin.adminId).update({
    data: { passwordHash: hashPassword(newPassword), updatedAt: Date.now() }
  });

  return { code: 0, msg: '密码修改成功' };
}

// auth.listAdmins: 管理员列表
async function listAdmins(db, event, admin) {
  const roleErr = requireRole(admin, 'superadmin');
  if (roleErr) return roleErr;

  const { data } = await db.collection('admins')
    .field({ passwordHash: false, loginFailCount: false, lastFailAt: false })
    .orderBy('createdAt', 'asc')
    .get();

  return { code: 0, data: { list: data } };
}

// auth.createAdmin: 创建管理员
async function createAdmin(db, event, admin) {
  const roleErr = requireRole(admin, 'superadmin');
  if (roleErr) return roleErr;

  const { username, password, role } = event;
  if (!username || !password) {
    return { code: -1, msg: '用户名和密码不能为空' };
  }
  if (password.length < 6) {
    return { code: -1, msg: '密码至少 6 位' };
  }
  const validRoles = ['superadmin', 'editor', 'viewer'];
  if (validRoles.indexOf(role) < 0) {
    return { code: -1, msg: '无效的角色' };
  }

  // 检查用户名唯一性
  const { data: existing } = await db.collection('admins')
    .where({ username })
    .limit(1)
    .get();
  if (existing.length > 0) {
    return { code: -1, msg: '用户名已存在' };
  }

  const now = Date.now();
  await db.collection('admins').add({
    data: { username, passwordHash: hashPassword(password), role, createdAt: now, updatedAt: now }
  });

  return { code: 0, msg: '管理员创建成功' };
}

// auth.deleteAdmin: 删除管理员
async function deleteAdmin(db, event, admin) {
  const roleErr = requireRole(admin, 'superadmin');
  if (roleErr) return roleErr;

  const { adminId } = event;
  if (!adminId) {
    return { code: -1, msg: '缺少 adminId' };
  }
  if (adminId === admin.adminId) {
    return { code: -1, msg: '不能删除自己' };
  }

  await db.collection('admins').doc(adminId).remove();
  return { code: 0, msg: '删除成功' };
}

module.exports = { init, login, changePwd, listAdmins, createAdmin, deleteAdmin };
