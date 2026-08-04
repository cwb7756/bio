// cloudfunctions/admin/lib/auth.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// JWT 密钥：必须通过环境变量注入（云开发控制台 → 云函数 → admin → 环境变量配置）
// 禁止硬编码默认值：公开默认密钥会导致任何人都能伪造管理员身份（越权）
// 未配置时拒绝启动（fail-closed），部署文档见 DEPLOYMENT.md
if (!process.env.JWT_SECRET) {
  throw new Error('[admin] 缺少 JWT_SECRET 环境变量：请在云开发控制台为 admin 云函数配置 JWT_SECRET（强随机字符串）后重新部署');
}
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '24h';

// 生成 JWT
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// 验证 JWT，返回 payload 或 null
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

// 密码哈希
function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

// 验证密码
function comparePassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

module.exports = { signToken, verifyToken, hashPassword, comparePassword, JWT_SECRET };
