// cloudfunctions/admin/modules/settingsModule.js
const { requireRole } = require('../lib/middleware');

// settings.get: 获取系统配置
async function get(db, event, admin) {
  const { data } = await db.collection('system_config').limit(1).get();

  if (data.length === 0) {
    // 返回默认配置
    return {
      code: 0,
      data: {
        grades: ['高一', '高二', '高三'],
        textbooks: ['必修一', '必修二', '选择性必修一', '选择性必修二', '选择性必修三'],
        aiModel: 'hunyuan-v3',
        globalEnabled: true
      }
    };
  }

  // 排除 _id 和 _openid
  const config = Object.assign({}, data[0]);
  delete config._id;
  delete config._openid;
  return { code: 0, data: config };
}

// settings.update: 更新系统配置
async function update(db, event, admin) {
  const roleErr = requireRole(admin, 'superadmin');
  if (roleErr) return roleErr;

  const { grades, textbooks, aiModel, globalEnabled } = event;
  const data = { updatedAt: Date.now() };

  if (grades !== undefined) data.grades = grades;
  if (textbooks !== undefined) data.textbooks = textbooks;
  if (aiModel !== undefined) data.aiModel = aiModel;
  if (globalEnabled !== undefined) data.globalEnabled = !!globalEnabled;

  // 检查是否已有配置记录
  const { data: existing } = await db.collection('system_config').limit(1).get();

  if (existing.length > 0) {
    await db.collection('system_config').doc(existing[0]._id).update({ data });
  } else {
    data.createdAt = Date.now();
    await db.collection('system_config').add({ data });
  }

  return { code: 0, msg: '配置更新成功' };
}

module.exports = { get, update };
