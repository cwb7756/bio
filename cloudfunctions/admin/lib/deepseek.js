// cloudfunctions/admin/lib/deepseek.js
// DeepSeek API 调用工具库（供 aiQuizModule / settingsModule 复用）
// 模型信息（官网 2026-08 确认）：
//   旧模型名 deepseek-chat / deepseek-reasoner 已于 2026-07-24 弃用；
//   现行模型 deepseek-v4-flash（快速低价）/ deepseek-v4-pro（更强推理），
//   base_url 不变仍为 https://api.deepseek.com，支持 JSON Output，
//   V4 系列默认开启思考模式，可通过 thinking:{type:'disabled'} 关闭以提速降费。
const https = require('https');

// DeepSeek OpenAI 格式接口默认地址
const DEFAULT_BASE_URL = 'https://api.deepseek.com';
// 允许配置的模型白名单（旧模型名已弃用，不收录）
const ALLOWED_MODELS = ['deepseek-v4-flash', 'deepseek-v4-pro'];
// 默认模型：flash 快速低价，出题场景够用
const DEFAULT_MODEL = 'deepseek-v4-flash';
// HTTP 请求超时（admin 云函数 timeout 60s，留足余量）
const HTTP_TIMEOUT = 45000;

// 判断是否为「集合不存在」错误（-502005），此类错误应降级为未配置而非抛 500
function isCollectionNotExistError(err) {
  const msg = String((err && (err.errMsg || err.message)) || err || '');
  return msg.indexOf('collection not exists') >= 0 || msg.indexOf('-502005') >= 0;
}

// 从 system_config 读取 DeepSeek 配置（原始 key 仅云端使用，不下发前端）
// 集合不存在时降级返回默认空配置（视为未配置）
async function getDeepSeekConfig(db) {
  let cfg = {};
  try {
    const { data } = await db.collection('system_config').limit(1).get();
    cfg = (data && data[0]) || {};
  } catch (err) {
    if (!isCollectionNotExistError(err)) throw err;
  }
  return {
    apiKey: String(cfg.deepseekApiKey || '').trim(),
    baseUrl: String(cfg.deepseekBaseUrl || '').trim().replace(/\/+$/, '') || DEFAULT_BASE_URL,
    model: ALLOWED_MODELS.indexOf(cfg.deepseekModel) >= 0 ? cfg.deepseekModel : DEFAULT_MODEL
  };
}

// API Key 掩码（仅返回前 3 后 4 位）
function maskKey(key) {
  const s = String(key || '');
  if (s.length <= 8) return '****';
  return s.slice(0, 3) + '****' + s.slice(-4);
}

// 发送 HTTPS 请求的底层封装
function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks).toString('utf8') });
      });
    });
    req.on('timeout', () => req.destroy(new Error('请求超时')));
    req.on('error', (err) => reject(err));
    if (body) req.write(body);
    req.end();
  });
}

// 将 HTTP 状态码映射为用户可读的错误信息
function mapHttpError(statusCode, fallback) {
  if (statusCode === 401) return new Error('API Key 无效');
  if (statusCode === 402) return new Error('API 账户余额不足');
  if (statusCode === 429) return new Error('请求过于频繁，请稍后重试');
  if (statusCode === 404) return new Error('接口地址或模型不存在');
  return new Error(fallback + '（HTTP ' + statusCode + '）');
}

// 调用 DeepSeek chat/completions 并解析为 JSON 对象
// messages: OpenAI 格式消息数组；返回解析后的对象（约定模型输出 json_object）
async function callDeepSeekJson(cfg, messages, maxTokens) {
  let url;
  try {
    url = new URL(cfg.baseUrl + '/chat/completions');
  } catch (e) {
    throw new Error('DeepSeek 接口地址无效');
  }

  const body = JSON.stringify({
    model: cfg.model,
    messages,
    response_format: { type: 'json_object' },
    temperature: 1.0,
    max_tokens: maxTokens || 4000,
    // V4 默认开启思考模式；出题为结构化任务，关闭以提速降费
    thinking: { type: 'disabled' },
    stream: false
  });

  const options = {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + cfg.apiKey,
      'Content-Length': Buffer.byteLength(body)
    },
    timeout: HTTP_TIMEOUT
  };

  const res = await httpsRequest(options, body);
  if (res.statusCode !== 200) throw mapHttpError(res.statusCode, 'AI 接口错误');

  let json;
  try {
    json = JSON.parse(res.body);
  } catch (e) {
    throw new Error('AI 返回格式异常');
  }
  const content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
  if (!content) throw new Error('AI 未返回内容');

  // 去除可能包裹的 markdown 代码块后解析 JSON
  let cleaned = String(content).trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error('AI 返回 JSON 解析失败');
  }
}

// 测试连通性：GET {baseUrl}/models 验证地址与 Key 有效性
async function testConnection(cfg) {
  let url;
  try {
    url = new URL(cfg.baseUrl + '/models');
  } catch (e) {
    throw new Error('DeepSeek 接口地址无效');
  }

  const options = {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname + url.search,
    method: 'GET',
    headers: { Authorization: 'Bearer ' + cfg.apiKey },
    timeout: 15000
  };

  const res = await httpsRequest(options, null);
  if (res.statusCode !== 200) throw mapHttpError(res.statusCode, '连接失败');

  let models = [];
  try {
    const json = JSON.parse(res.body);
    models = (json.data || []).map((m) => m.id).filter(Boolean);
  } catch (e) { /* 忽略解析失败，连通性已确认 */ }
  return { models };
}

module.exports = {
  DEFAULT_BASE_URL,
  ALLOWED_MODELS,
  DEFAULT_MODEL,
  isCollectionNotExistError,
  getDeepSeekConfig,
  maskKey,
  callDeepSeekJson,
  testConnection
};
