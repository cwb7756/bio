// 云函数 settings - 用户设置
// get: 读取用户设置（存于 users.settings 字段）；update: 合并更新设置
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 默认设置
const DEFAULT_SETTINGS = {
  notification: true,   // 学习提醒
  sound: true,          // 音效
  autoPlay: false,      // 自动播放课程视频
  dailyReminder: false  // 每日打卡提醒
};

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

async function findUser(openid) {
  if (!openid) return null;
  const { data } = await db.collection('users').where({ _openid: openid }).limit(1).get();
  return data.length > 0 ? data[0] : null;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { action = 'get' } = event;

  const validErr = validateParams(event);
  if (validErr) return validErr;

  try {
    const user = await findUser(OPENID);

    if (action === 'get') {
      const settings = { ...DEFAULT_SETTINGS, ...((user && user.settings) || {}) };
      return { code: 0, data: { settings, isLoggedIn: !!user } };
    }

    if (action === 'update') {
      if (!user) {
        return { code: 401, msg: '请先登录' };
      }
      const incoming = event.settings || {};
      // 仅合并合法字段
      const merged = { ...DEFAULT_SETTINGS, ...(user.settings || {}) };
      Object.keys(DEFAULT_SETTINGS).forEach((k) => {
        if (typeof incoming[k] === 'boolean') {
          merged[k] = incoming[k];
        }
      });
      await db.collection('users').doc(user._id).update({
        data: { settings: merged, updatedAt: Date.now() }
      });
      return { code: 0, data: { settings: merged } };
    }

    return { code: -1, msg: '未知的操作类型' };
  } catch (err) {
    console.error('settings error:', err);
    return { code: -1, msg: '设置服务异常' };
  }
};
