// cloudfunctions/admin/lib/middleware.js
const { verifyToken } = require('./auth');
const { validateParams } = require('./helpers');

// 权限级别
const ROLE_LEVELS = { viewer: 1, editor: 2, superadmin: 3 };

// JWT 认证中间件：验证 token 并注入 currentAdmin
// 公开 action 不需要认证（如 auth.login, auth.init）
const PUBLIC_ACTIONS = ['auth.login', 'auth.init'];

function authMiddleware(event) {
  const action = event.action || '';

  // 公开 action 跳过认证
  if (PUBLIC_ACTIONS.indexOf(action) >= 0) {
    return { ok: true, admin: null };
  }

  // 从 header 或 event.token 中获取 token
  // 云函数 HTTP 触发时，header 在 event.headers 中
  const token = (event.headers && (event.headers['Authorization'] || event.headers['authorization']))
    || event.token
    || '';

  const cleanToken = token.replace(/^Bearer\s+/i, '');
  if (!cleanToken) {
    return { ok: false, error: { code: 401, msg: '未登录' } };
  }

  const payload = verifyToken(cleanToken);
  if (!payload) {
    return { ok: false, error: { code: 401, msg: '登录已过期，请重新登录' } };
  }

  return { ok: true, admin: payload };
}

// 权限校验中间件：检查 admin.role 是否达到所需级别
function requireRole(admin, minRole) {
  if (!admin) return { code: 401, msg: '未登录' };
  const adminLevel = ROLE_LEVELS[admin.role] || 0;
  const requiredLevel = ROLE_LEVELS[minRole] || 0;
  if (adminLevel < requiredLevel) {
    return { code: 403, msg: '权限不足' };
  }
  return null;
}

// 参数校验中间件
function paramsMiddleware(event) {
  return validateParams(event);
}

module.exports = { authMiddleware, requireRole, paramsMiddleware, ROLE_LEVELS, PUBLIC_ACTIONS };
