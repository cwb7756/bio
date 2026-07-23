// 云函数 aiCourseware - AI课堂：腾讯云 TTS 语音合成 + AI 文生图 + 课件 CRUD
// 通过 cloud.getWXContext() 获取 OPENID 做数据隔离
// TTS 密钥通过环境变量 TENCENT_SECRET_ID / TENCENT_SECRET_KEY 注入，不下发前端
// 文生图使用 CloudBase AI 内置能力（HY-Image-3.0-Plus），生成后转存云存储持久化
const cloud = require('wx-server-sdk');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV, timeout: 150000 });
const db = cloud.database();

// 课件列表上限
const COURSEWARES_LIMIT = 20;
// 腾讯云 TTS 单次合成中文上限 150 字，留余量取 140
const TTS_SEGMENT_MAX = 140;
// 默认音色：101001 智瑜（精品女声）
const DEFAULT_VOICE = 101001;
// 可选音色白名单（与前端选项一致，防止滥用未开通音色）
const ALLOWED_VOICES = [101001, 101002, 101004];

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
  // 音色优先取前端选择（白名单校验），否则走环境变量或默认
  const reqVoice = parseInt(event.voiceType, 10);
  const voiceType = ALLOWED_VOICES.indexOf(reqVoice) >= 0
    ? reqVoice
    : (parseInt(process.env.TTS_VOICE, 10) || DEFAULT_VOICE);
  const clips = [];
  try {
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
  } catch (err) {
    // 区分腾讯云错误类型：资源包耗尽返回明确 code 供前端提示
    const errMsg = String((err && err.message) || '');
    console.error('tts invoke error:', err);
    if (/resource pack allowance|exhausted/i.test(errMsg)) {
      return { code: 402, msg: 'TTS额度已用完' };
    }
    return { code: -1, msg: 'TTS合成失败' };
  }
  if (!clips.length) {
    return { code: -1, msg: 'TTS合成失败' };
  }
  return { code: 0, clips: clips };
}

// ---------- AI 文生图 ----------

// 生图模型：混元文生图 v3.0（需 wx-server-sdk >= 4.0.2）
const IMAGE_MODEL = 'HY-Image-3.0-Plus-4090-Tob-v1.0';
// 统一风格前缀集中云端，保证全课件插图风格一致
const IMAGE_STYLE_PREFIX = '高中生物教学插图，扁平手绘风格，浅色纯色背景，柔和绿色系配色，画面简洁清晰，不包含任何文字、字母或数字标注：';

// 下载远程图片为 Buffer（生图 URL 仅 24h 有效，需转存云存储）
function downloadImage(url) {
  return new Promise(function (resolve, reject) {
    https.get(url, function (response) {
      if (response.statusCode !== 200) {
        reject(new Error('download image status ' + response.statusCode));
        return;
      }
      const chunks = [];
      response.on('data', function (chunk) { chunks.push(chunk); });
      response.on('end', function () { resolve(Buffer.concat(chunks)); });
      response.on('error', reject);
    }).on('error', reject);
  });
}

// 调文生图模型；revise 失败/超时时降级重试一次
async function callImageModel(prompt) {
  const imageModel = cloud.ai().createImageModel('hunyuan-image');
  try {
    return await imageModel.generateImage({
      model: IMAGE_MODEL,
      prompt: prompt,
      size: '1280x720',
      revise: { value: true }
    });
  } catch (err) {
    console.error('generateImage with revise failed, retry without revise:', err);
    return await imageModel.generateImage({
      model: IMAGE_MODEL,
      prompt: prompt,
      size: '1280x720',
      revise: { value: false }
    });
  }
}

// genImage: 文生图 + 转存云存储
// 入参 { visual } → { code: 0, fileID }
async function genImage(event, openid) {
  const visual = String(event.visual || '').trim().slice(0, 200);
  if (!visual) {
    return { code: 400, msg: '缺少画面描述' };
  }
  const prompt = (IMAGE_STYLE_PREFIX + visual).slice(0, 500);
  const res = await callImageModel(prompt);
  const url = res && res.data && res.data[0] && res.data[0].url;
  if (!url) {
    return { code: -1, msg: '生图失败' };
  }
  const buffer = await downloadImage(url);
  const cloudPath = 'ai-courseware-images/' + openid + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.png';
  const uploadRes = await cloud.uploadFile({
    cloudPath: cloudPath,
    fileContent: buffer
  });
  if (!uploadRes || !uploadRes.fileID) {
    return { code: -1, msg: '图片转存失败' };
  }
  return { code: 0, fileID: uploadRes.fileID };
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
      case 'genImage':
        return await genImage(event, OPENID);
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
