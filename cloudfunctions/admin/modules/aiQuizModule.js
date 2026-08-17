// cloudfunctions/admin/modules/aiQuizModule.js
// AI 一键出题：分批任务模式（前端轮询 aiQuizGen.tick 驱动生成进度）
// create: 创建出题任务 → ai_quiz_jobs
// tick: 生成一批（最多 BATCH_SIZE 题）写入 quiz_questions（status='pending' 待审核）
// list / cancel: 任务列表与取消
const { requireRole } = require('../lib/middleware');
const { getDeepSeekConfig, callDeepSeekJson } = require('../lib/deepseek');

// 每次 tick 生成的题目数（单次 DeepSeek 调用）
const BATCH_SIZE = 5;
// 连续失败 N 批后任务置为 failed
const MAX_CONSECUTIVE_FAILS = 3;
// tick 互斥窗口：上次 tick 未结束（或异常退出）时的新 tick 阻断时长
const TICK_LOCK_MS = 30000;
// 合法题型 / 难度
const TYPES = ['single', 'judge', 'mixed'];
const DIFFICULTIES = ['easy', 'medium', 'hard', 'mixed'];

// ---------- Prompt 构造 ----------

const TYPE_DESC = {
  single: '全部为单选题，每题 4 个选项（key 为 A/B/C/D），有且仅有一个正确答案',
  judge: '全部为判断题，每题 2 个选项（A 正确 / B 错误），答案为 A 或 B',
  mixed: '单选题与判断题混合出题：单选题 4 个选项（key 为 A/B/C/D，仅一个正确答案）；判断题 2 个选项（A 正确 / B 错误）'
};

const DIFFICULTY_DESC = {
  easy: '简单（考查基础概念记忆与辨析）',
  medium: '中等（考查理解与知识应用）',
  hard: '困难（考查综合分析、实验探究与推理）',
  mixed: '简单、中等、困难三种难度合理搭配'
};

function buildMessages(params, batchCount, existingStems) {
  const system = [
    '你是资深高中生物命题专家，熟悉人教版高中生物课程标准与高考命题规律。',
    '你的任务是根据要求命制高质量试题，输出必须是一个合法的 json 对象（不要输出任何其他文字），格式为：',
    '{"questions":[{"stem":"题干","options":[{"key":"A","text":"选项内容"}],"answer":"A","explanation":"答案解析","difficulty":"easy|medium|hard"}]}',
    '命题要求：',
    '1. 题目科学准确，无科学性错误，符合高中生物知识范围；',
    '2. 干扰项要有迷惑性，考查真实易错点；',
    '3. answer 必须是 options 中某个选项的 key（多选题用逗号分隔，如 "A,C"）；',
    '4. explanation 需说明正确答案的依据，并简要指出错误选项的错因；',
    '5. 题干与选项中不得出现 "上面/下列选项中" 之类指代不清的表述残缺。'
  ].join('\n');

  const lines = ['请命制 ' + batchCount + ' 道高中生物题目：'];
  if (params.chapter) lines.push('- 教材章节：' + params.chapter);
  if (params.topic) lines.push('- 考点方向：' + params.topic);
  lines.push('- 题型要求：' + (TYPE_DESC[params.type] || TYPE_DESC.single));
  lines.push('- 难度要求：' + (DIFFICULTY_DESC[params.difficulty] || DIFFICULTY_DESC.mixed));
  if (params.extra) lines.push('- 补充要求：' + params.extra);
  if (existingStems && existingStems.length > 0) {
    lines.push('- 以下为本次任务已命制的题目，新题目不得与之重复或高度相似：');
    existingStems.slice(-20).forEach(function (s, i) {
      lines.push('  ' + (i + 1) + '. ' + String(s).slice(0, 60));
    });
  }

  return [
    { role: 'system', content: system },
    { role: 'user', content: lines.join('\n') }
  ];
}

// ---------- 题目校验与规范化 ----------

// 校验 AI 返回的单题并规范化为入库格式；不合法返回 null
function normalizeQuestion(raw, params) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.stem !== 'string' || !raw.stem.trim()) return null;

  // 选项规范化为 {key, text}（兼容 AI 返回纯字符串数组）
  let options = Array.isArray(raw.options) ? raw.options : [];
  options = options.map(function (o, i) {
    const defKey = String.fromCharCode(65 + i);
    if (typeof o === 'string') return { key: defKey, text: o.trim() };
    const key = String((o && o.key) || defKey).trim().toUpperCase();
    const text = String((o && o.text) || '').trim();
    return { key: key, text: text };
  }).filter(function (o) { return o.text; });
  if (options.length < 2) return null;

  // 答案校验：拆分多答案（如 "A,C"），每个都必须是选项 key
  const keys = options.map(function (o) { return o.key; });
  const answerRaw = String(raw.answer || '').trim().toUpperCase();
  const parts = answerRaw.split(/[,，、\s]+/).filter(Boolean);
  if (parts.length === 0) return null;
  for (let i = 0; i < parts.length; i++) {
    if (keys.indexOf(parts[i]) < 0) return null;
  }

  // 判断题选项固定为 A 正确 / B 错误
  if (params.type === 'judge' && options.length !== 2) return null;

  const difficulty = ['easy', 'medium', 'hard'].indexOf(raw.difficulty) >= 0 ? raw.difficulty : 'medium';
  return {
    stem: raw.stem.trim().slice(0, 500),
    options: options,
    answer: parts.join(','),
    explanation: String(raw.explanation || '').trim().slice(0, 2000),
    difficulty: difficulty
  };
}

// ---------- 任务操作 ----------

// aiQuizGen.create: 创建出题任务
async function create(db, event, admin) {
  const roleErr = requireRole(admin, 'editor');
  if (roleErr) return roleErr;

  const chapter = String(event.chapter || '').trim().slice(0, 50);
  const topic = String(event.topic || '').trim().slice(0, 100);
  const type = TYPES.indexOf(event.type) >= 0 ? event.type : 'single';
  const difficulty = DIFFICULTIES.indexOf(event.difficulty) >= 0 ? event.difficulty : 'mixed';
  const count = Math.min(100, Math.max(1, parseInt(event.count, 10) || 10));
  const extra = String(event.extra || '').trim().slice(0, 500);

  if (!chapter && !topic) return { code: -1, msg: '请至少填写教材章节或出题方向' };

  const cfg = await getDeepSeekConfig(db);
  if (!cfg.apiKey) {
    return { code: -1, msg: '尚未配置 DeepSeek API Key，请先在系统配置中填写' };
  }

  const now = Date.now();
  const job = {
    status: 'running',
    total: count,
    generated: 0,
    failed: 0,
    consecutiveFails: 0,
    tickAt: 0,
    params: { chapter: chapter, topic: topic, type: type, difficulty: difficulty, count: count, extra: extra },
    model: cfg.model,
    error: '',
    createdBy: admin.adminId || '',
    createdByName: admin.username || '',
    createdAt: now,
    updatedAt: now
  };
  const { _id } = await db.collection('ai_quiz_jobs').add({ data: job });
  job._id = _id;

  return { code: 0, data: { jobId: _id, job: job } };
}

// aiQuizGen.tick: 生成一批题目并更新任务进度（前端轮询驱动）
async function tick(db, event, admin) {
  const roleErr = requireRole(admin, 'editor');
  if (roleErr) return roleErr;

  const { jobId } = event;
  if (!jobId) return { code: -1, msg: '缺少 jobId' };

  const { data: jobs } = await db.collection('ai_quiz_jobs')
    .where({ _id: jobId })
    .limit(1)
    .get();
  if (jobs.length === 0) return { code: 404, msg: '任务不存在' };
  const job = jobs[0];

  // 非运行态直接返回当前任务（终态任务可继续查看）
  if (job.status !== 'running') {
    return { code: 0, data: { job: job, added: 0, batchError: '' } };
  }

  const now = Date.now();
  const remaining = job.total - (job.generated || 0) - (job.failed || 0);

  // 兜底：计数已满但状态未流转
  if (remaining <= 0) {
    await db.collection('ai_quiz_jobs').doc(jobId).update({
      data: { status: 'done', finishedAt: now, updatedAt: now }
    });
    job.status = 'done';
    return { code: 0, data: { job: job, added: 0, batchError: '' } };
  }

  // 简易互斥：上次 tick 在窗口期内（仍在执行或异常残留）则本轮跳过
  if (job.tickAt && now - job.tickAt < TICK_LOCK_MS) {
    return { code: 0, data: { job: job, added: 0, batchError: '上一批次仍在生成中' } };
  }
  await db.collection('ai_quiz_jobs').doc(jobId).update({ data: { tickAt: now, updatedAt: now } });

  // 未配置 Key 直接失败
  const cfg = await getDeepSeekConfig(db);
  if (!cfg.apiKey) {
    const errMsg = '未配置 DeepSeek API Key，请先在系统配置中填写';
    await db.collection('ai_quiz_jobs').doc(jobId).update({
      data: { status: 'failed', error: errMsg, tickAt: 0, finishedAt: Date.now(), updatedAt: Date.now() }
    });
    job.status = 'failed';
    job.error = errMsg;
    return { code: 0, data: { job: job, added: 0, batchError: errMsg } };
  }

  const batchCount = Math.min(BATCH_SIZE, remaining);

  // 取本任务已生成题干用于防重复
  const { data: existing } = await db.collection('quiz_questions')
    .where({ jobId: jobId })
    .field({ stem: true })
    .limit(100)
    .get();
  const existingStems = existing.map(function (q) { return q.stem; });

  let batchError = '';
  let parsed = null;
  try {
    parsed = await callDeepSeekJson(cfg, buildMessages(job.params, batchCount, existingStems));
  } catch (err) {
    batchError = err.message || 'AI 调用失败';
  }

  let added = 0;
  let failedInBatch = 0;
  if (parsed) {
    const list = Array.isArray(parsed.questions) ? parsed.questions : [];
    for (let i = 0; i < list.length; i++) {
      const q = normalizeQuestion(list[i], job.params);
      if (!q) { failedInBatch++; continue; }
      try {
        await db.collection('quiz_questions').add({
          data: {
            stem: q.stem,
            options: q.options,
            answer: q.answer,
            explanation: q.explanation,
            type: '选择题',
            chapter: (job.params && job.params.chapter) || '',
            topic: (job.params && job.params.topic) || '',
            difficulty: q.difficulty,
            status: 'pending',
            source: 'ai',
            jobId: jobId,
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
        });
        added++;
      } catch (e) {
        failedInBatch++;
      }
    }
    if (list.length === 0) batchError = 'AI 未返回题目，请重试';
  }

  // 连续无任何进展（未成功也未判失败）时累计，超过阈值任务置失败
  const hasProgress = added > 0 || failedInBatch > 0;
  const consecutiveFails = hasProgress ? 0 : (job.consecutiveFails || 0) + 1;

  const newGenerated = (job.generated || 0) + added;
  const newFailed = (job.failed || 0) + failedInBatch;
  const newRemaining = job.total - newGenerated - newFailed;

  let status = 'running';
  let finishedAt;
  let error = batchError;
  if (newRemaining <= 0) {
    status = 'done';
    finishedAt = Date.now();
  } else if (consecutiveFails >= MAX_CONSECUTIVE_FAILS) {
    status = 'failed';
    error = batchError || '连续多次生成失败，任务已终止';
    finishedAt = Date.now();
  }

  const updateData = {
    generated: newGenerated,
    failed: newFailed,
    consecutiveFails: consecutiveFails,
    status: status,
    error: error,
    tickAt: 0,
    updatedAt: Date.now()
  };
  if (finishedAt) updateData.finishedAt = finishedAt;
  await db.collection('ai_quiz_jobs').doc(jobId).update({ data: updateData });

  const updatedJob = Object.assign({}, job, updateData);
  delete updatedJob._id;
  updatedJob._id = jobId;

  return { code: 0, data: { job: updatedJob, added: added, batchError: batchError } };
}

// aiQuizGen.list: 最近 20 个任务
async function list(db, _event, admin) {
  const roleErr = requireRole(admin, 'editor');
  if (roleErr) return roleErr;

  const { data } = await db.collection('ai_quiz_jobs')
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();
  return { code: 0, data: { list: data } };
}

// aiQuizGen.cancel: 取消运行中的任务
async function cancel(db, event, admin) {
  const roleErr = requireRole(admin, 'editor');
  if (roleErr) return roleErr;

  const { jobId } = event;
  if (!jobId) return { code: -1, msg: '缺少 jobId' };

  const now = Date.now();
  const res = await db.collection('ai_quiz_jobs')
    .where({ _id: jobId, status: 'running' })
    .update({ data: { status: 'cancelled', finishedAt: now, updatedAt: now } });
  if (res.stats.updated === 0) {
    return { code: -1, msg: '任务不存在或已结束' };
  }

  const { data: jobs } = await db.collection('ai_quiz_jobs')
    .where({ _id: jobId })
    .limit(1)
    .get();
  return { code: 0, data: { job: jobs[0] || null }, msg: '任务已取消' };
}

module.exports = { create, tick, list, cancel };
