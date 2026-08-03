// utils/courseware.js
// AI课堂课件工具层：大纲/场景 prompt 模板、健壮 JSON 解析、场景规范化、TTS 文本清洗、LLM 调用封装

// ---------- LLM 调用 ----------

// 判断是否为网关限流类错误：
// CloudBase AI 网关 429 时 streamText 的 onFinish 常收到空文本，extractJson 抛 "empty response"
function isRateLimitError(err) {
  var msg = ((err && err.message) || String(err || '')).toLowerCase();
  return msg.indexOf('empty response') >= 0 ||
    msg.indexOf('429') >= 0 ||
    msg.indexOf('too many') >= 0 ||
    msg.indexOf('rate') >= 0;
}

// 全局节流：两次 LLM 请求发起至少间隔 1.5s，降低触发网关限流的概率
var lastLlmCallAt = 0;
var LLM_MIN_INTERVAL = 1500;

// LLM 调用：流式累加全文 → 解析 JSON
// onText(full) 可选：每次收到增量文本时回调累计全文，用于流式展示；每次（重）发起请求前先回调 '' 通知重置
// 失败自动重试（最多 3 次）；限流类错误使用长退避（8s → ~18s → ~38s，带随机抖动）
// 以跨过分钟级限流窗口；普通错误使用短退避（3s → 7s → 15s）
function llmJson(messages, onText) {
  var notifyText = typeof onText === 'function' ? function (t) {
    try {
      onText(t);
    } catch (e) {
      // ignore observer errors
    }
  } : null;
  return new Promise(function (resolve, reject) {
    function attempt(retriesLeft, delay) {
      var wait = Math.max(0, LLM_MIN_INTERVAL - (Date.now() - lastLlmCallAt));
      setTimeout(function () {
        lastLlmCallAt = Date.now();
        if (notifyText) notifyText('');
        var model = wx.cloud.extend.AI.createModel('cloudbase');
        var full = '';
        var settled = false;
        function onFail(err) {
          if (settled) return;
          if (retriesLeft > 0) {
            var nextDelay;
            if (isRateLimitError(err)) {
              nextDelay = (delay < 8000 ? 8000 : delay * 2) + Math.floor(Math.random() * 2000);
            } else {
              nextDelay = delay * 2 + 1000;
            }
            console.warn('llmJson retry in ' + nextDelay + 'ms:', (err && err.message) || err);
            setTimeout(function () { attempt(retriesLeft - 1, nextDelay); }, nextDelay);
          } else {
            settled = true;
            reject(err);
          }
        }
        model.streamText({
          data: { model: 'hy3', messages: messages },
          onText: function (delta) {
            full += delta;
            if (notifyText) notifyText(full);
          },
          onFinish: function (finalText) {
            if (settled) return;
            full = finalText || full;
            try {
              var result = extractJson(full);
              settled = true;
              resolve(result);
            } catch (e) {
              onFail(e);
            }
          }
        }).catch(onFail);
      }, wait);
    }
    attempt(3, 3000);
  });
}

// ---------- 常量 ----------

// 允许的场景类型
var SCENE_TYPES = ['cover', 'concept', 'diagram', 'sim', 'quiz', 'summary'];

// 各场景类型的生成要求片段（注入场景 prompt）
var SCENE_PROMPT_FRAGMENTS = {
  cover: [
    '本节为封面引入页，输出格式：',
    '{"type":"cover","title":"课件标题","subtitle":"一句话引入语","narration":"开场讲稿"}',
    'narration 为开场白（60-120字），点明本节要解决的问题，语气亲切。'
  ].join('\n'),
  concept: [
    '本节为概念讲解页，输出格式：',
    '{"type":"concept","title":"章节标题","narration":"讲稿","blocks":[内容块]}',
    'blocks 为 3-6 个内容块，可选类型：',
    '{"kind":"paragraph","text":"一段讲解文字"}',
    '{"kind":"bullets","items":["要点1","要点2"]}',
    '{"kind":"steps","items":["第一步","第二步"]}',
    '{"kind":"keypoint","label":"核心概念名","text":"解释文字"}',
    '{"kind":"compare","left":{"title":"概念A","items":["特点1","特点2"]},"right":{"title":"概念B","items":["特点1","特点2"]}}',
    '{"kind":"table","head":["列1","列2"],"rows":[["内容","内容"]]}'
  ].join('\n'),
  diagram: [
    '本节为静态图解页，输出格式：',
    '{"type":"diagram","title":"章节标题","narration":"讲稿","visual":"画面描述","caption":"图注（20字内）"}',
    'visual 为给生图模型的画面描述（60字内），描述要绘制的生物结构或过程示意图的内容、主体与布局，不包含颜色、风格要求。'
  ].join('\n'),
  sim: [
    '本节为分步动画模拟页，把一个动态过程拆成有序的关键帧，输出格式：',
    '{"type":"sim","title":"章节标题","narration":"本节总起讲稿（50-100字）","frames":[{"visual":"该帧画面描述","caption":"第N步名称（15字内）","narration":"该帧讲稿（50-120字）"}]}',
    'frames 为 2-6 帧，严格按过程先后顺序排列；每帧 visual 为给生图模型的画面描述（60字内），各帧画面主体与构图保持一致，仅表现步骤间的变化。'
  ].join('\n'),
  quiz: [
    '本节为随堂小测页，输出格式：',
    '{"type":"quiz","title":"随堂小测","narration":"引导讲稿（40-80字）","question":"题干","options":["A. 选项","B. 选项","C. 选项","D. 选项"],"answer":"A","explanation":"解析（80字内）"}',
    'answer 只能是 A/B/C/D；题目紧扣本节内容，难度适中。'
  ].join('\n'),
  summary: [
    '本节为总结回顾页，输出格式：',
    '{"type":"summary","title":"本节小结","narration":"总结讲稿","points":["要点1","要点2","要点3"]}',
    'points 为 3-5 条核心结论，每条 25 字以内。'
  ].join('\n')
};

// ---------- Prompt 构建 ----------

// 大纲生成 prompt（system + user 合并为单条 user 消息，配合简短 system）
function buildOutlineMessages(question) {
  var system = '你是一位高中生物课件策划专家，擅长把一个问题拆解成结构化的讲解课件大纲。你只输出 JSON。';
  var user = [
    '学生的问题：「' + question + '」',
    '请为这个问题设计一份讲解课件的大纲。',
    '',
    '输出 JSON 格式（不要用 markdown 代码块包裹，不要输出任何其他文字）：',
    '{"title":"课件标题（10字以内）","sections":[{"title":"章节标题","sceneType":"cover|concept|diagram|sim|quiz|summary","goal":"本节教学目标（20字内）"}]}',
    '',
    '要求：',
    '- sections 共 4-7 节',
    '- 第 1 节必须是 cover（封面引入），最后 1 节必须是 summary（总结回顾）',
    '- 中间章节以 concept（概念讲解）为主',
    '- 涉及静态结构/示意图时用 diagram；涉及动态过程（如分裂、循环、运输、表达过程）时用 sim，sim 最多 2 节',
    '- 最多安排 1 节 quiz（随堂小测）',
    '- 内容面向高中生物人教版新教材',
    '只输出 JSON。'
  ].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
}

// 单场景生成 prompt
// section: { title, sceneType, goal }；index 从 1 开始；total 为总节数
function buildSceneMessages(question, coursewareTitle, section, index, total) {
  var sceneType = SCENE_TYPES.indexOf(section.sceneType) >= 0 ? section.sceneType : 'concept';
  var fragment = SCENE_PROMPT_FRAGMENTS[sceneType];
  var system = '你是一位高中生物老师，正在逐节编写课件内容。你只输出 JSON。';
  var user = [
    '课件主题：「' + coursewareTitle + '」（学生原始问题：「' + question + '」）',
    '当前编写第 ' + index + '/' + total + ' 节：「' + section.title + '」，教学目标：' + (section.goal || '讲清核心知识'),
    '',
    fragment,
    '',
    '通用要求：',
    '- narration 为老师口头讲稿，口语化、亲切专业，不含任何 markdown 符号和表情',
    '- dwellSeconds 为每场景建议停留时间（整数秒，短场景 2-4 秒，概念讲解 5-8 秒，长文本阅读约 10 秒，小测/封面/总结忽略此字段不用填；quiz 场景不返回该字段因为会自动暂停等作答）',
    '- 内容准确，面向高中生物人教版新教材',
    '- 不要用 markdown 代码块包裹，不要输出任何 JSON 以外的文字',
    '只输出 JSON。'
  ].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
}

// ---------- 健壮 JSON 解析 ----------

// 从模型输出中提取并解析 JSON 对象；失败抛错供调用方重试
function extractJson(text) {
  if (!text) throw new Error('empty response');
  var candidate = null;
  // 优先提取 ```json ... ``` 代码块
  var m = String(text).match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m && m[1]) {
    candidate = m[1].trim();
  } else {
    // 截取首个 { 到末尾最后一个 } 区间
    var start = String(text).indexOf('{');
    var end = String(text).lastIndexOf('}');
    if (start >= 0 && end > start) {
      candidate = String(text).slice(start, end + 1);
    }
  }
  if (!candidate) throw new Error('no json found');
  return JSON.parse(candidate);
}

// ---------- 场景规范化 ----------

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function toStringArray(v) {
  if (!Array.isArray(v)) return [];
  return v.filter(isNonEmptyString).map(function (s) { return s.trim(); });
}

// 规范化 blocks，过滤非法块
function normalizeBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  var out = [];
  blocks.forEach(function (b) {
    if (!b || typeof b !== 'object') return;
    switch (b.kind) {
      case 'paragraph':
        if (isNonEmptyString(b.text)) out.push({ kind: 'paragraph', text: b.text.trim() });
        break;
      case 'bullets':
      case 'steps': {
        var items = toStringArray(b.items);
        if (items.length) out.push({ kind: b.kind, items: items });
        break;
      }
      case 'keypoint':
        if (isNonEmptyString(b.text)) {
          out.push({ kind: 'keypoint', label: isNonEmptyString(b.label) ? b.label.trim() : '重点', text: b.text.trim() });
        }
        break;
      case 'compare': {
        var left = b.left || {};
        var right = b.right || {};
        var li = toStringArray(left.items);
        var ri = toStringArray(right.items);
        if (li.length || ri.length) {
          out.push({
            kind: 'compare',
            left: { title: isNonEmptyString(left.title) ? left.title.trim() : 'A', items: li },
            right: { title: isNonEmptyString(right.title) ? right.title.trim() : 'B', items: ri }
          });
        }
        break;
      }
      case 'table': {
        var head = toStringArray(b.head);
        var rows = Array.isArray(b.rows) ? b.rows.filter(function (r) { return Array.isArray(r) && r.length; }).map(function (r) {
          return r.map(function (c) { return String(c == null ? '' : c); });
        }) : [];
        if (head.length && rows.length) out.push({ kind: 'table', head: head, rows: rows });
        break;
      }
    }
  });
  return out;
}

// 规范化单个场景；返回 null 表示不可修复，调用方应降级
// keepSvg: 是否保留 svg 字段（净化在前端渲染前统一做）
function normalizeScene(raw, sectionTitle) {
  if (!raw || typeof raw !== 'object') return null;
  var type = SCENE_TYPES.indexOf(raw.type) >= 0 ? raw.type : 'concept';
  var title = isNonEmptyString(raw.title) ? raw.title.trim() : (sectionTitle || '讲解');
  var narration = isNonEmptyString(raw.narration) ? raw.narration.trim() : '';

  switch (type) {
    case 'cover':
      return {
        type: 'cover',
        title: title,
        subtitle: isNonEmptyString(raw.subtitle) ? raw.subtitle.trim() : '',
        narration: narration,
        dwellSeconds: typeof raw.dwellSeconds === 'number' ? raw.dwellSeconds : 2
      };
    case 'concept': {
      var blocks = normalizeBlocks(raw.blocks);
      if (!blocks.length && !narration) return null;
      return { 
        type: 'concept', 
        title: title, 
        narration: narration, 
        blocks: blocks,
        dwellSeconds: typeof raw.dwellSeconds === 'number' ? raw.dwellSeconds : 5
      };
    }
    case 'diagram': {
      if (!isNonEmptyString(raw.visual)) return null;
      return {
        type: 'diagram',
        title: title,
        narration: narration,
        visual: raw.visual.trim(),
        caption: isNonEmptyString(raw.caption) ? raw.caption.trim() : '',
        dwellSeconds: typeof raw.dwellSeconds === 'number' ? raw.dwellSeconds : 5
      };
    }
    case 'sim': {
      var frames = Array.isArray(raw.frames) ? raw.frames.filter(function (f) {
        return f && typeof f === 'object' && isNonEmptyString(f.visual);
      }).map(function (f, i) {
        return {
          visual: f.visual.trim(),
          caption: isNonEmptyString(f.caption) ? f.caption.trim() : ('第' + (i + 1) + '步'),
          narration: isNonEmptyString(f.narration) ? f.narration.trim() : ''
        };
      }) : [];
      if (frames.length < 2) return null;
      return { 
        type: 'sim', 
        title: title, 
        narration: narration, 
        frames: frames.slice(0, 6),
        dwellSeconds: typeof raw.dwellSeconds === 'number' ? raw.dwellSeconds : 6
      };
    }
    case 'quiz': {
      var options = toStringArray(raw.options);
      var answer = isNonEmptyString(raw.answer) ? raw.answer.trim().toUpperCase().charAt(0) : '';
      if (!isNonEmptyString(raw.question) || options.length < 2 || 'ABCD'.indexOf(answer) < 0 || answer >= String.fromCharCode(65 + options.length)) {
        return null;
      }
      return {
        type: 'quiz',
        title: title,
        narration: narration,
        question: raw.question.trim(),
        options: options.slice(0, 4),
        answer: answer,
        explanation: isNonEmptyString(raw.explanation) ? raw.explanation.trim() : ''
      };
    }
    case 'summary': {
      var points = toStringArray(raw.points);
      if (!points.length && !narration) return null;
      return { 
        type: 'summary', 
        title: title, 
        narration: narration, 
        points: points,
        dwellSeconds: typeof raw.dwellSeconds === 'number' ? raw.dwellSeconds : 3
      };
    }
  }
  return null;
}

// 降级场景：生成失败时的 concept 纯文字页
function fallbackScene(sectionTitle, goal) {
  return {
    type: 'concept',
    title: sectionTitle || '讲解',
    narration: '这一节我们围绕「' + (goal || sectionTitle || '本知识点') + '」来学习，内容正在整理中，建议结合教材对应章节阅读。',
    blocks: [
      { kind: 'paragraph', text: '本节内容生成失败，已降级为提示页。可以返回重新生成，或结合教材「' + (goal || sectionTitle || '') + '」相关内容学习。' }
    ]
  };
}

// ---------- TTS 文本清洗 ----------

// 去除 markdown 符号、emoji、多余空白，供 TTS 合成
function cleanTtsText(text) {
  return String(text || '')
    .replace(/[*#>`~|]/g, '')
    .replace(/(?:[\u{1F000}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|\u{FE0F})/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- 大纲规范化 ----------

// 规范化大纲：sections 过滤非法类型，强制首节 cover、末节 summary
function normalizeOutline(raw, question) {
  var title = '生物小课堂';
  if (raw && isNonEmptyString(raw.title)) title = raw.title.trim().slice(0, 20);
  var sections = [];
  if (raw && Array.isArray(raw.sections)) {
    raw.sections.forEach(function (s) {
      if (!s || typeof s !== 'object' || !isNonEmptyString(s.title)) return;
      var st = SCENE_TYPES.indexOf(s.sceneType) >= 0 ? s.sceneType : 'concept';
      sections.push({
        title: s.title.trim().slice(0, 20),
        sceneType: st,
        goal: isNonEmptyString(s.goal) ? s.goal.trim().slice(0, 40) : ''
      });
    });
  }
  // 数量约束 4-7
  if (sections.length > 7) sections = sections.slice(0, 7);
  // 强制首节 cover
  if (!sections.length || sections[0].sceneType !== 'cover') {
    sections.unshift({ title: '课程引入', sceneType: 'cover', goal: '引出本课主题' });
  }
  // 强制末节 summary
  if (sections[sections.length - 1].sceneType !== 'summary') {
    sections.push({ title: '总结回顾', sceneType: 'summary', goal: '梳理核心要点' });
  }
  // 至少 4 节不足时不强补（尊重模型输出），仅保证首尾
  return { title: title, question: question, sections: sections };
}

module.exports = {
  SCENE_TYPES: SCENE_TYPES,
  llmJson: llmJson,
  isRateLimitError: isRateLimitError,
  buildOutlineMessages: buildOutlineMessages,
  buildSceneMessages: buildSceneMessages,
  extractJson: extractJson,
  normalizeOutline: normalizeOutline,
  normalizeScene: normalizeScene,
  fallbackScene: fallbackScene,
  cleanTtsText: cleanTtsText
};
