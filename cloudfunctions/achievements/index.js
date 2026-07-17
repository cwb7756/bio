// 云函数 achievements - 成就中心
// list/getUserAchievements: 返回成就定义 + 当前用户解锁进度（分页）；用户无记录时返回空列表 + isDemo
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

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

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { action = 'list', skip = 0, limit = 50 } = event;

  const validErr = validateParams(event);
  if (validErr) return validErr;

  // 分页参数校验与规范化
  const pageNum = Math.max(0, parseInt(skip, 10) || 0);
  const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

  try {
    if (action === 'list' || action === 'getUserAchievements') {
      // 1. 全部成就定义
      const { data: defs } = await db.collection('achievements')
        .orderBy('sort', 'asc')
        .limit(100)
        .get();

      // 2. 用户解锁记录（仅用 _openid）
      let userRecords = [];
      if (OPENID) {
        const { data } = await db.collection('user_achievements')
          .where({ _openid: OPENID })
          .limit(100)
          .get();
        userRecords = data;
      }

      // 3. 无记录返回空列表 + isDemo
      if (userRecords.length === 0) {
        return { code: 0, list: [], total: 0, isDemo: true };
      }

      // 4. 合并定义与进度
      const progressMap = {};
      userRecords.forEach((r) => { progressMap[r.achievementId] = r; });

      const allAchievements = defs.map((d) => {
        const p = progressMap[d._id] || {};
        const progress = p.progress || 0;
        const unlocked = !!p.unlocked;
        return {
          _id: d._id,
          name: d.name,
          desc: d.desc,
          icon: d.icon || 'ic-trophy',
          target: d.target || 1,
          progress,
          unlocked,
          percent: d.target > 0 ? Math.min(Math.round((progress / d.target) * 100), 100) : 0
        };
      });

      const unlockedCount = allAchievements.filter((a) => a.unlocked).length;

      // 5. 分页
      const total = allAchievements.length;
      const paged = allAchievements.slice(pageNum, pageNum + pageSize);

      return { code: 0, list: paged, total, isDemo: false, unlockedCount };
    }

    return { code: -1, msg: '未知的操作类型' };
  } catch (err) {
    console.error('achievements error:', err);
    return { code: -1, msg: '获取成就失败' };
  }
};
