// cloudfunctions/admin/lib/helpers.js

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

// 解析分页参数，返回 { skip, limit, page, pageSize }
function parsePagination(event) {
  const page = Math.max(1, parseInt(event.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(event.pageSize, 10) || 20));
  return { skip: (page - 1) * pageSize, limit: pageSize, page, pageSize };
}

// 近N天日期起点序列（毫秒时间戳）
function lastNDays(n) {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    days.push(dayStart - i * 86400000);
  }
  return days;
}

// 今日零点时间戳
function todayStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

module.exports = { validateParams, parsePagination, lastNDays, todayStart };
