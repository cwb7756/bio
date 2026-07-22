// 云函数 aiChat - AI 答疑会话管理 + RAG 上下文匹配
// 通过 cloud.getWXContext() 获取 OPENID 做数据隔离
// 所有会话操作均以 _openid 过滤，确保用户间数据隔离
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 会话列表上限
const SESSIONS_LIMIT = 20;
// 单会话消息条数上限（截断保留最新）
const MAX_SESSION_MESSAGES = 100;

// ---------- 会话管理 ----------

// listSessions: 列出当前用户的会话
// → { code: 0, sessions: [{ _id, title, updatedAt, createdAt }] }
async function listSessions(openid) {
  var { data } = await db.collection('ai_chat_sessions')
    .where({ _openid: openid })
    .orderBy('updatedAt', 'desc')
    .limit(SESSIONS_LIMIT)
    .get();

  var sessions = data.map(function (s) {
    return {
      _id: s._id,
      title: s.title || '未命名对话',
      updatedAt: s.updatedAt,
      createdAt: s.createdAt
    };
  });
  return { code: 0, sessions: sessions };
}

// getSession: 获取单个会话详情
// → { code: 0, session: { _id, title, messages, createdAt, updatedAt } }
async function getSession(event, openid) {
  var sessionId = event.sessionId;
  if (!sessionId) {
    return { code: 400, msg: '缺少 sessionId' };
  }

  // 按 sessionId + _openid 双重校验，确保归属
  var { data } = await db.collection('ai_chat_sessions')
    .where({ _id: sessionId, _openid: openid })
    .get();

  if (data.length === 0) {
    return { code: 404, msg: '会话不存在或无权访问' };
  }

  var s = data[0];
  return {
    code: 0,
    session: {
      _id: s._id,
      title: s.title || '未命名对话',
      messages: s.messages || [],
      createdAt: s.createdAt,
      updatedAt: s.updatedAt
    }
  };
}

// saveSession: 新增或更新会话
// sessionId 为空 → add 新会话；非空 → update 已有会话
// → { code: 0, sessionId }
async function saveSession(event, openid) {
  var sessionId = event.sessionId;
  var title = event.title;
  var messages = event.messages;
  var now = Date.now();

  // 截断消息至最新 100 条
  var truncated = Array.isArray(messages) ? messages.slice(-MAX_SESSION_MESSAGES) : [];

  if (!sessionId) {
    // 新建会话，写入 _openid 做数据隔离
    var addRes = await db.collection('ai_chat_sessions').add({
      data: {
        _openid: openid,
        title: title || '新对话',
        messages: truncated,
        createdAt: now,
        updatedAt: now
      }
    });
    return { code: 0, sessionId: addRes._id };
  }

  // 更新已有会话（_id + _openid 双重校验确保归属）
  // 仅当 title 非空时才更新标题，避免空字符串覆盖已有标题
  var updateData = { messages: truncated, updatedAt: now };
  if (title) updateData.title = title;
  var updateRes = await db.collection('ai_chat_sessions')
    .where({ _id: sessionId, _openid: openid })
    .update({ data: updateData });

  if (updateRes.stats.updated === 0) {
    return { code: 404, msg: '会话不存在或无权操作' };
  }
  return { code: 0, sessionId: sessionId };
}

// clearSession: 清空会话消息（会话本身保留）
// → { code: 0 }
async function clearSession(event, openid) {
  var sessionId = event.sessionId;
  if (!sessionId) {
    return { code: 400, msg: '缺少 sessionId' };
  }

  var res = await db.collection('ai_chat_sessions')
    .where({ _id: sessionId, _openid: openid })
    .update({
      data: { messages: [], updatedAt: Date.now() }
    });

  if (res.stats.updated === 0) {
    return { code: 404, msg: '会话不存在或无权操作' };
  }
  return { code: 0 };
}

// updateTitle: 更新会话标题
// → { code: 0 }
async function updateTitle(event, openid) {
  var sessionId = event.sessionId;
  var title = event.title;
  if (!sessionId) {
    return { code: 400, msg: '缺少 sessionId' };
  }

  var res = await db.collection('ai_chat_sessions')
    .where({ _id: sessionId, _openid: openid })
    .update({
      data: { title: title || '未命名对话', updatedAt: Date.now() }
    });

  if (res.stats.updated === 0) {
    return { code: 404, msg: '会话不存在或无权操作' };
  }
  return { code: 0 };
}

// ---------- RAG 上下文匹配 ----------

// matchContext: 根据用户输入匹配课程/课时/题目，返回增强 system prompt
// → { code: 0, systemPrompt: '...' }
// 匹配策略：检查数据字段值（>=2字）是否作为关键词出现在用户输入中
// 不返回原始 quiz_questions 文档，仅将答案/解析嵌入 systemPrompt 文本
async function matchContext(event) {
  var text = event.text || '';
  var lower = text.toLowerCase();

  // 并行预取全部参考数据（数据量小，全量获取后客户端过滤）
  var results = await Promise.all([
    db.collection('courses').limit(10).get(),
    db.collection('lessons').limit(50).get(),
    db.collection('quiz_questions').limit(20).get()
  ]);

  var courses = results[0].data;
  var lessons = results[1].data;
  var quizzes = results[2].data;

  // 辅助函数：字段值（>=2字）是否出现在用户输入中
  function fieldInText(fieldVal) {
    if (!fieldVal || fieldVal.length < 2) return false;
    return lower.indexOf(fieldVal.toLowerCase()) >= 0;
  }

  var parts = [];

  // 1. 匹配课程（检查标题/标签/章节是否被用户提到）
  var matchedCourses = courses.filter(function (c) {
    return fieldInText(c.tag) || fieldInText(c.chapter) || fieldInText(c.title);
  });
  if (matchedCourses.length) {
    parts.push(matchedCourses.map(function (c) {
      return '课程：' + c.title;
    }).join('\n'));
  }

  // 2. 匹配课时（去掉"第X课"前缀后检查核心关键词）
  var matchedLessons = lessons.filter(function (l) {
    if (!l.title) return false;
    var kw = l.title.replace(/^第\d+课\s*/, '');
    return kw.length >= 2 && lower.indexOf(kw.toLowerCase()) >= 0;
  });
  if (matchedLessons.length) {
    parts.push(matchedLessons.map(function (l) {
      return '知识点：' + l.title;
    }).join('\n'));
  }

  // 3. 匹配题目（检查主题/章节是否被用户提到），嵌入答案与解析
  var matchedQuestions = quizzes.filter(function (q) {
    return fieldInText(q.topic) || fieldInText(q.chapter);
  });
  matchedQuestions.forEach(function (q) {
    var block = [];
    if (q.stem) block.push('参考题目：' + q.stem);
    if (q.answer) block.push('答案：' + q.answer);
    if (q.explanation) block.push('解析：' + q.explanation);
    if (block.length) parts.push(block.join('\n'));
  });

  if (parts.length === 0) {
    return { code: 0, systemPrompt: '' };
  }

  var systemPrompt = '以下是相关的学习参考资料，请基于此回答用户问题：\n\n' + parts.join('\n\n');
  return { code: 0, systemPrompt: systemPrompt };
}

// ---------- 工具调用数据查询 ----------
// 供 AI 大模型工具调用（Function Calling）使用的数据查询入口
// event.tool 指定工具名，其余字段为该工具的参数
// 需要 OPENID 的工具由云函数自动注入，前端无需传入

async function toolQuery(event, openid) {
  var tool = event.tool;
  switch (tool) {
    case 'search_courses_lessons':
      return await toolSearchCoursesLessons(event.keyword || '');
    case 'query_progress':
      return await toolQueryProgress(openid);
    case 'query_mistakes':
      return await toolQueryMistakes(openid, event.limit);
    case 'get_quiz':
      return await toolGetQuiz(event.chapter || '', event.topic || '', event.limit);
    case 'generate_quiz':
      return await toolGenerateQuiz(event.topic || '', event.chapter || '', event.count);
    default:
      return { code: -1, msg: '未知工具: ' + tool };
  }
}

// 搜索课程/课时：按关键词匹配课程标题/标签/章节与课时标题
// 全量拉取后客户端过滤（数据量小，规避 RegExp/_.or 兼容问题）
async function toolSearchCoursesLessons(keyword) {
  if (!keyword || keyword.length < 2) {
    return { code: 400, msg: '关键词至少2个字' };
  }
  var lower = String(keyword).toLowerCase();
  var results = await Promise.all([
    db.collection('courses').limit(20).get(),
    db.collection('lessons').limit(100).get()
  ]);
  var courses = results[0].data.filter(function (c) {
    var hay = ((c.title || '') + ' ' + (c.tag || '') + ' ' + (c.chapter || '')).toLowerCase();
    return hay.indexOf(lower) >= 0;
  });
  var lessons = results[1].data.filter(function (l) {
    return (l.title || '').toLowerCase().indexOf(lower) >= 0;
  });
  return {
    code: 0,
    courses: courses.map(function (c) {
      return { title: c.title, tag: c.tag, chapter: c.chapter, level: c.level, totalLessons: c.totalLessons };
    }),
    lessons: lessons.map(function (l) {
      return { title: l.title, courseId: l.courseId };
    })
  };
}

// 查询当前用户学习进度
async function toolQueryProgress(openid) {
  if (!openid) return { code: 401, msg: '未登录' };
  var progressRes = await db.collection('study_progress')
    .where({ _openid: openid }).count();
  var completedCount = progressRes.total;
  var lessonsRes = await db.collection('lessons').count();
  var totalLessons = lessonsRes.total;
  var { data: latest } = await db.collection('study_progress')
    .where({ _openid: openid })
    .orderBy('updatedAt', 'desc')
    .limit(1).get();
  var recentChapter = latest.length ? latest[0].chapter : '';
  var progress = totalLessons > 0 ? Math.min(Math.round(completedCount / totalLessons * 100), 100) : 0;
  return {
    code: 0,
    completedLessons: completedCount,
    totalLessons: totalLessons,
    progress: progress,
    recentChapter: recentChapter
  };
}

// 查询当前用户错题本（返回含答案解析，供AI讲解）
async function toolQueryMistakes(openid, limit) {
  if (!openid) return { code: 401, msg: '未登录' };
  var n = Math.min(20, Math.max(1, parseInt(limit, 10) || 5));
  var { data } = await db.collection('mistakes')
    .where({ _openid: openid })
    .orderBy('createdAt', 'desc')
    .limit(n).get();
  return {
    code: 0,
    total: data.length,
    list: data.map(function (m) {
      return {
        stem: m.stem,
        chapter: m.chapter,
        topic: m.topic,
        userAnswer: m.userAnswer,
        answer: m.answer,
        explanation: m.explanation
      };
    })
  };
}

// 获取练习题（含答案解析，供AI讲解分析）
async function toolGetQuiz(chapter, topic, limit) {
  var where = {};
  if (chapter) where.chapter = chapter;
  if (topic) where.topic = topic;
  var n = Math.min(10, Math.max(1, parseInt(limit, 10) || 3));
  var { data } = await db.collection('quiz_questions').where(where).limit(n).get();
  return {
    code: 0,
    list: data.map(function (q) {
      return {
        stem: q.stem,
        options: q.options,
        answer: q.answer,
        explanation: q.explanation,
        chapter: q.chapter,
        topic: q.topic
      };
    })
  };
}

// 随机出题：从题库随机抽取题目供学生练习
async function toolGenerateQuiz(topic, chapter, count) {
  var where = {};
  if (chapter) where.chapter = chapter;
  if (topic) where.topic = topic;
  var n = Math.min(10, Math.max(1, parseInt(count, 10) || 3));
  var { data } = await db.collection('quiz_questions').where(where).limit(50).get();
  // Fisher-Yates 随机打乱后取前 n 道
  for (var i = data.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = data[i]; data[i] = data[j]; data[j] = tmp;
  }
  var picked = data.slice(0, n);
  return {
    code: 0,
    list: picked.map(function (q) {
      return {
        stem: q.stem,
        options: q.options,
        answer: q.answer,
        explanation: q.explanation,
        chapter: q.chapter,
        topic: q.topic
      };
    })
  };
}

// ---------- 云函数入口 ----------

exports.main = async (event, context) => {
  var { OPENID } = cloud.getWXContext();

  // 所有操作均要求有效 OPENID，确保数据隔离
  if (!OPENID) {
    return { code: -1, msg: '无法获取用户身份' };
  }

  var action = event.action;

  try {
    switch (action) {
      case 'listSessions':
        return await listSessions(OPENID);
      case 'getSession':
        return await getSession(event, OPENID);
      case 'saveSession':
        return await saveSession(event, OPENID);
      case 'clearSession':
        return await clearSession(event, OPENID);
      case 'updateTitle':
        return await updateTitle(event, OPENID);
      case 'matchContext':
        return await matchContext(event);
      case 'toolQuery':
        return await toolQuery(event, OPENID);
      default:
        return { code: -1, msg: '未知的操作类型' };
    }
  } catch (err) {
    console.error('aiChat error:', err);
    return { code: -1, msg: 'AI会话服务异常' };
  }
};

// ---------- 测试导出 ----------
exports.listSessions = listSessions;
exports.getSession = getSession;
exports.saveSession = saveSession;
exports.clearSession = clearSession;
exports.updateTitle = updateTitle;
exports.matchContext = matchContext;
exports.SESSIONS_LIMIT = SESSIONS_LIMIT;
exports.MAX_SESSION_MESSAGES = MAX_SESSION_MESSAGES;
