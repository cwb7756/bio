// cloudfunctions/admin/modules/achievementModule.js
const { parsePagination } = require('../lib/helpers');
const { requireRole } = require('../lib/middleware');

// achievement.list: 成就列表
async function list(db, event, admin) {
  const { skip, limit, page, pageSize } = parsePagination(event);

  const { total } = await db.collection('achievements').count();
  const { data } = await db.collection('achievements')
    .orderBy('sort', 'asc')
    .skip(skip)
    .limit(limit)
    .get();

  return { code: 0, data: { list: data, total, page, pageSize } };
}

// achievement.save: 新建/编辑成就
async function save(db, event, admin) {
  const roleErr = requireRole(admin, 'editor');
  if (roleErr) return roleErr;

  const { achievementId, name, description, icon, condition, sort } = event;
  if (!name) return { code: -1, msg: '成就名称不能为空' };

  const now = Date.now();
  const data = {
    name, description: description || '', icon: icon || '',
    condition: condition || {}, sort: sort || 0, updatedAt: now
  };

  if (achievementId) {
    await db.collection('achievements').doc(achievementId).update({ data });
    return { code: 0, msg: '更新成功' };
  }

  data.createdAt = now;
  const { _id } = await db.collection('achievements').add({ data });
  return { code: 0, data: { _id } };
}

// achievement.delete: 删除成就
async function del(db, event, admin) {
  const roleErr = requireRole(admin, 'editor');
  if (roleErr) return roleErr;

  const { achievementId } = event;
  if (!achievementId) return { code: -1, msg: '缺少 achievementId' };

  await db.collection('achievements').doc(achievementId).remove();
  return { code: 0, msg: '删除成功' };
}

// achievement.grantList: 成就发放记录
async function grantList(db, event, admin) {
  const { skip, limit, page, pageSize } = parsePagination(event);
  const { achievementId } = event;

  let query = {};
  if (achievementId) query.achievementId = achievementId;

  const { total } = await db.collection('user_achievements').where(query).count();
  const { data } = await db.collection('user_achievements')
    .where(query)
    .orderBy('grantedAt', 'desc')
    .skip(skip)
    .limit(limit)
    .get();

  return { code: 0, data: { list: data, total, page, pageSize } };
}

module.exports = { list, save, del, grantList };
