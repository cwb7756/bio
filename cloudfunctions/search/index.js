// 云函数 search - 全局搜索
// action: 'global'（默认）→ 按关键词搜索课程/考点 + 知识点 + 题目，分组返回
// 安全规范：不读取任何客户端身份字段；题目结果不返回 answer/explanation（防刷答案）
// 实现策略：数据量小，字段投影全量拉取 + JS includes 过滤（规避 RegExp 转义风险）
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 各类结果上限
const COURSE_LIMIT = 10;
const KP_LIMIT = 10;
const QUESTION_LIMIT = 20;

// 参数校验：字符串长度不超过10000，数组长度不超过100
function validateParams(obj) {
  for (const key in obj) {
    const val = obj[key];
    if (typeof val === 'string' && val.length > 10000) {
      return { code: 400, msg: '参数 ' + key + ' 过长' };
    }
    if (Array.isArray(val) && val.length > 100) {
      return { code: 400, msg: '参数 ' + key + ' 数量超限' };
    }
  }
  return null;
}

// 大小写不敏感包含匹配
function includes(text, kw) {
  return String(text || '').toLowerCase().indexOf(kw) !== -1;
}

// 搜索课程/考点：按 title/tag/chapter 匹配
async function searchCourses(kw) {
  const { data } = await db.collection('courses')
    .field({ title: true, tag: true, chapter: true, level: true, totalLessons: true, icon: true })
    .limit(1000)
    .get();

  return data
    .filter((c) => includes(c.title, kw) || includes(c.tag, kw) || includes(c.chapter, kw))
    .slice(0, COURSE_LIMIT)
    .map((c) => ({
      _id: c._id,
      title: c.title || '',
      tag: c.tag || '',
      chapter: c.chapter || '',
      level: c.level || '',
      totalLessons: c.totalLessons || 0,
      icon: c.icon || 'ic-microscope'
    }));
}

// 搜索知识点：按 title/desc 匹配
async function searchKnowledgePoints(kw) {
  const { data } = await db.collection('knowledge_points')
    .field({ title: true, desc: true, chapter: true, courseId: true, icon: true })
    .limit(1000)
    .get();

  return data
    .filter((kp) => includes(kp.title, kw) || includes(kp.desc, kw))
    .slice(0, KP_LIMIT)
    .map((kp) => ({
      _id: kp._id,
      title: kp.title || '',
      desc: kp.desc || '',
      chapter: kp.chapter || '',
      courseId: kp.courseId || '',
      icon: kp.icon && kp.icon !== 'ic-book' ? kp.icon : 'ic-target'
    }));
}

// 搜索题目：按 stem/topic 匹配；不返回答案/解析（与 quiz list 一致）
// 仅返回已上线（审核通过）题目，AI 待审核题不对用户可见
async function searchQuestions(kw) {
  const { data } = await db.collection('quiz_questions')
    .where({ status: 'approved' })
    .field({ stem: true, chapter: true, topic: true, options: true, type: true })
    .limit(1000)
    .get();

  return data
    .filter((q) => includes(q.stem, kw) || includes(q.topic, kw))
    .slice(0, QUESTION_LIMIT)
    .map((q) => ({
      questionId: q._id,
      stem: q.stem || '',
      options: (q.options || []).map((o) => ({ key: o.key, text: o.text })),
      type: q.type || '选择题',
      chapter: q.chapter || '',
      topic: q.topic || ''
    }));
}

// 全局搜索：三类数据并行拉取，分组返回
async function globalSearch(event) {
  const keyword = String(event.keyword || '').trim().slice(0, 50);
  if (!keyword) {
    return { code: 0, data: { keyword: '', courses: [], knowledgePoints: [], questions: [] } };
  }
  const kw = keyword.toLowerCase();

  const [courses, knowledgePoints, questions] = await Promise.all([
    searchCourses(kw),
    searchKnowledgePoints(kw),
    searchQuestions(kw)
  ]);

  return {
    code: 0,
    data: { keyword, courses, knowledgePoints, questions }
  };
}

exports.main = async (event) => {
  const action = event.action || 'global';

  const validErr = validateParams(event);
  if (validErr) return validErr;

  try {
    switch (action) {
      case 'global':
        return await globalSearch(event);
      default:
        return { code: -1, msg: '未知的操作类型' };
    }
  } catch (err) {
    console.error('search error:', err);
    return { code: -1, msg: '搜索服务异常' };
  }
};
