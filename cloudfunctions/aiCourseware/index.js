// 云函数 aiCourseware - AI课堂：腾讯云 TTS 语音合成 + 课件 CRUD
// 通过 cloud.getWXContext() 获取 OPENID 做数据隔离
// TTS 密钥通过环境变量 TENCENT_SECRET_ID / TENCENT_SECRET_KEY 注入，不下发前端
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 课件列表上限
const COURSEWARES_LIMIT = 20;
// 腾讯云 TTS 单次合成中文上限 150 字，留余量取 140
const TTS_SEGMENT_MAX = 140;
// 默认音色：101001 智瑜（精品女声）
const DEFAULT_VOICE = 101001;

// ---------- 腾讯云 TTS ----------

let ttsClient = null;

// 懒加载 TTS 客户端；未配置密钥返回 null
function getTtsClient() {
  const secretId = process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TENCENT_SECRET_KEY;
  if (!secretId || !secretKey) return null;
  if (!ttsClient) {
    const tencentcloud = require('tencentcloud-sdk-nodejs-tts');
    const TtsClient = tencentcloud.tts.v20190823.Client;
    ttsClient = new TtsClient({
      credential: { secretId: secretId, secretKey: secretKey },
      region: 'ap-guangzhou',
      profile: { httpProfile: { endpoint: 'tts.tencentcloudapi.com' } }
    });
  }
  return ttsClient;
}

// 按标点切分长文本为 ≤140 字段落；单句超长硬切
function splitText(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean.split(/(?<=[。！？；!?;])/);
  const segments = [];
  let buf = '';
  sentences.forEach(function (s) {
    if (!s) return;
    if ((buf + s).length <= TTS_SEGMENT_MAX) {
      buf += s;
      return;
    }
    if (buf) segments.push(buf);
    let rest = s;
    while (rest.length > TTS_SEGMENT_MAX) {
      segments.push(rest.slice(0, TTS_SEGMENT_MAX));
      rest = rest.slice(TTS_SEGMENT_MAX);
    }
    buf = rest;
  });
  if (buf) segments.push(buf);
  return segments;
}

// tts: 文本转语音
// 入参 { text } → { code: 0, clips: [{ text, audioBase64 }] }
async function tts(event) {
  const client = getTtsClient();
  if (!client) {
    return { code: 503, msg: 'TTS未配置' };
  }
  const segments = splitText(event.text);
  if (!segments.length) {
    return { code: 400, msg: '缺少合成文本' };
  }
  const voiceType = parseInt(process.env.TTS_VOICE, 10) || DEFAULT_VOICE;
  const clips = [];
  for (let i = 0; i < segments.length; i++) {
    const res = await client.TextToVoice({
      Text: segments[i],
      SessionId: 'cw-' + Date.now() + '-' + i,
      VoiceType: voiceType,
      Codec: 'mp3',
      SampleRate: 16000
    });
    if (res && res.Audio) {
      clips.push({ text: segments[i], audioBase64: res.Audio });
    }
  }
  if (!clips.length) {
    return { code: -1, msg: 'TTS合成失败' };
  }
  return { code: 0, clips: clips };
}

// ---------- 课件 CRUD ----------

// saveCourseware: 保存新课件
// 入参 { title, question, scenes } → { code: 0, coursewareId }
async function saveCourseware(event, openid) {
  const title = String(event.title || '未命名课件').slice(0, 30);
  const question = String(event.question || '').slice(0, 200);
  const scenes = Array.isArray(event.scenes) ? event.scenes : [];
  if (!scenes.length) {
    return { code: 400, msg: '课件内容为空' };
  }
  const now = Date.now();
  const addRes = await db.collection('ai_coursewares').add({
    data: {
      _openid: openid,
      title: title,
      question: question,
      scenes: scenes,
      createdAt: now,
      updatedAt: now
    }
  });
  return { code: 0, coursewareId: addRes._id };
}

// listCoursewares: 列出当前用户的课件（不含 scenes 正文，节省流量）
// → { code: 0, coursewares: [{ _id, title, question, sceneCount, updatedAt, createdAt }] }
async function listCoursewares(openid) {
  const { data } = await db.collection('ai_coursewares')
    .where({ _openid: openid })
    .orderBy('updatedAt', 'desc')
    .limit(COURSEWARES_LIMIT)
    .get();
  const coursewares = data.map(function (c) {
    return {
      _id: c._id,
      title: c.title || '未命名课件',
      question: c.question || '',
      sceneCount: Array.isArray(c.scenes) ? c.scenes.length : 0,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    };
  });
  return { code: 0, coursewares: coursewares };
}

// getCourseware: 获取单个课件详情（_id + _openid 双重校验）
// 入参 { coursewareId } → { code: 0, courseware }
async function getCourseware(event, openid) {
  const coursewareId = event.coursewareId;
  if (!coursewareId) {
    return { code: 400, msg: '缺少 coursewareId' };
  }
  const { data } = await db.collection('ai_coursewares')
    .where({ _id: coursewareId, _openid: openid })
    .get();
  if (data.length === 0) {
    return { code: 404, msg: '课件不存在或无权访问' };
  }
  const c = data[0];
  return {
    code: 0,
    courseware: {
      _id: c._id,
      title: c.title || '未命名课件',
      question: c.question || '',
      scenes: c.scenes || [],
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    }
  };
}

// deleteCourseware: 删除课件（_id + _openid 双重校验）
// 入参 { coursewareId } → { code: 0 }
async function deleteCourseware(event, openid) {
  const coursewareId = event.coursewareId;
  if (!coursewareId) {
    return { code: 400, msg: '缺少 coursewareId' };
  }
  const res = await db.collection('ai_coursewares')
    .where({ _id: coursewareId, _openid: openid })
    .remove();
  if (res.stats.removed === 0) {
    return { code: 404, msg: '课件不存在或无权操作' };
  }
  return { code: 0 };
}

// ---------- 云函数入口 ----------

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  // 所有操作均要求有效 OPENID，确保数据隔离
  if (!OPENID) {
    return { code: -1, msg: '无法获取用户身份' };
  }

  const action = event.action;

  try {
    switch (action) {
      case 'tts':
        return await tts(event);
      case 'saveCourseware':
        return await saveCourseware(event, OPENID);
      case 'listCoursewares':
        return await listCoursewares(OPENID);
      case 'getCourseware':
        return await getCourseware(event, OPENID);
      case 'deleteCourseware':
        return await deleteCourseware(event, OPENID);
      default:
        return { code: -1, msg: '未知的操作类型' };
    }
  } catch (err) {
    console.error('aiCourseware error:', err);
    return { code: -1, msg: 'AI课件服务异常' };
  }
};
