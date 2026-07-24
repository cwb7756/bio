// cloudfunctions/admin/lib/auth.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// JWT 密钥：优先从环境变量读取，开发环境使用默认值
const JWT_SECRET = process.env.JWT_SECRET || 'bio-admin-secret-change-in-production';
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
