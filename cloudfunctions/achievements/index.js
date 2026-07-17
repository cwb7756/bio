// 云函数 achievements - 成就中心
// 返回成就定义 + 当前用户解锁进度；用户无记录时回退 demo 示例
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 构建用户查询条件：仅拼接存在的标识，避免空对象匹配全部文档
function userCondition(openid, userId) {
  const clauses = [];
  if (openid) clauses.push({ _openid: openid });
  if (userId) clauses.push({ userID: userId });
  if (clauses.length === 0) return null;
  return clauses.length === 1 ? clauses[0] : _.or(clauses);
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { userID = '' } = event;

  try {
    // 1. 全部成就定义
    const { data: defs } = await db.collection('achievements')
      .orderBy('sort', 'asc')
      .limit(50)
      .get();

    // 2. 用户解锁记录
    let userRecords = [];
    const condition = userCondition(OPENID, userID);
    if (condition) {
      const { data } = await db.collection('user_achievements')
        .where(condition)
        .limit(100)
        .get();
      userRecords = data;
    }

    let isDemo = false;
    if (userRecords.length === 0) {
      // demo 兜底
      const { data } = await db.collection('user_achievements')
        .where({ userID: 'demo' })
        .limit(100)
        .get();
      userRecords = data;
      isDemo = true;
    }

    // 3. 合并定义与进度
    const progressMap = {};
    userRecords.forEach((r) => { progressMap[r.achievementId] = r; });

    const list = defs.map((d) => {
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

    const unlockedCount = list.filter((a) => a.unlocked).length;

    return {
      code: 0,
      data: {
        isDemo,
        achievements: list,
        unlockedCount,
        totalCount: list.length
      }
    };
  } catch (err) {
    console.error('achievements error:', err);
    return { code: -1, msg: '获取成就失败' };
  }
};
