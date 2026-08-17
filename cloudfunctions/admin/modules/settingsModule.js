// cloudfunctions/admin/modules/settingsModule.js
const { requireRole } = require('../lib/middleware');
const {
  DEFAULT_BASE_URL,
  ALLOWED_MODELS,
  DEFAULT_MODEL,
  isCollectionNotExistError,
  getDeepSeekConfig,
  maskKey,
  testConnection
} = require('../lib/deepseek');

// 默认系统配置（无记录时返回）
const DEFAULT_CONFIG = {
  grades: ['高一', '高二', '高三'],
  textbooks: ['必修一', '必修二', '选择性必修一', '选择性必修二', '选择性必修三'],
  aiModel: 'hunyuan-v3',
  globalEnabled: true
};

// settings.get: 获取系统配置（DeepSeek API Key 脱敏，绝不下发原始 key）
// system_config 集合不存在时降级返回默认配置，而非抛 500
async function get(db, _event, _admin) {
  let data = [];
  try {
    const res = await db.collection('system_config').limit(1).get();
    data = res.data || [];
  } catch (err) {
    if (!isCollectionNotExistError(err)) throw err;
  }

  if (data.length === 0) {
    // 返回默认配置
    return {
      code: 0,
      data: Object.assign({}, DEFAULT_CONFIG, {
        deepseek: {
          hasKey: false,
          keyMasked: '',
          baseUrl: DEFAULT_BASE_URL,
          model: DEFAULT_MODEL
        }
      })
    };
  }

  // 排除 _id 和 _openid
  const config = Object.assign({}, data[0]);
  delete config._id;
  delete config._openid;

  // DeepSeek 配置脱敏：移除原始 key，仅返回掩码与派生信息
  const apiKey = config.deepseekApiKey || '';
  delete config.deepseekApiKey;
  config.deepseek = {
    hasKey: !!apiKey,
    keyMasked: apiKey ? maskKey(apiKey) : '',
    baseUrl: config.deepseekBaseUrl || DEFAULT_BASE_URL,
    model: ALLOWED_MODELS.indexOf(config.deepseekModel) >= 0 ? config.deepseekModel : DEFAULT_MODEL
  };

  return { code: 0, data: config };
}

// settings.update: 更新系统配置
async function update(db, event, admin) {
  const roleErr = requireRole(admin, 'superadmin');
  if (roleErr) return roleErr;

  const { grades, textbooks, aiModel, globalEnabled, deepseekApiKey, deepseekBaseUrl, deepseekModel } = event;
  const data = { updatedAt: Date.now() };

  if (grades !== undefined) data.grades = grades;
  if (textbooks !== undefined) data.textbooks = textbooks;
  if (aiModel !== undefined) data.aiModel = aiModel;
  if (globalEnabled !== undefined) data.globalEnabled = !!globalEnabled;

  // DeepSeek 出题配置：key 传空串=清除，undefined=不修改；地址/模型带白名单校验
  if (typeof deepseekApiKey === 'string') {
    data.deepseekApiKey = deepseekApiKey.trim();
  }
  if (deepseekBaseUrl !== undefined) {
    data.deepseekBaseUrl = String(deepseekBaseUrl).trim().replace(/\/+$/, '') || DEFAULT_BASE_URL;
  }
  if (deepseekModel !== undefined && ALLOWED_MODELS.indexOf(deepseekModel) >= 0) {
    data.deepseekModel = deepseekModel;
  }

  // 检查是否已有配置记录（集合不存在时降级为空，首次保存会尝试创建文档）
  let existing = [];
  try {
    const res = await db.collection('system_config').limit(1).get();
    existing = res.data || [];
  } catch (err) {
    if (!isCollectionNotExistError(err)) throw err;
  }

  try {
    if (existing.length > 0) {
      await db.collection('system_config').doc(existing[0]._id).update({ data });
    } else {
      data.createdAt = Date.now();
      await db.collection('system_config').add({ data });
    }
  } catch (err) {
    if (isCollectionNotExistError(err)) {
      return { code: -1, msg: 'system_config 集合不存在，请先在云开发控制台创建后再保存' };
    }
    throw err;
  }

  return { code: 0, msg: '配置更新成功' };
}

// settings.testDeepseek: 测试 DeepSeek 接口连通性与 Key 有效性
async function testDeepseek(db, _event, admin) {
  const roleErr = requireRole(admin, 'superadmin');
  if (roleErr) return roleErr;

  const cfg = await getDeepSeekConfig(db);
  if (!cfg.apiKey) {
    return { code: -1, msg: '尚未配置 API Key，请先填写并保存' };
  }

  try {
    const result = await testConnection(cfg);
    return { code: 0, msg: '连接成功', data: { model: cfg.model, models: result.models } };
  } catch (err) {
    return { code: -1, msg: '连接失败：' + (err.message || '未知错误') };
  }
}

module.exports = { get, update, testDeepseek };
