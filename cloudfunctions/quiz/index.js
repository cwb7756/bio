// 云函数 quiz - 刷题练习（题目加载与答题判定）
// 通过 cloud.getWXContext() 获取 OPENID
// list: 按章节/主题加载题目（不返回答案/解析）
// submit: 提交单题答案判定（此时才返回答案与解析）
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
var db = cloud.database();

// 教材分册排序顺序
var CHAPTER_ORDER = ['必修一', '必修二', '选择性必修一', '选择性必修二', '选择性必修三'];

// categories: 聚合题目分类结构（按教材分册 + 考点两级）
// → { code: 0, data: { chapters: [{ name, count, topics: [{ name, count }] }], topics: [{ name, chapter, count }] } }
// 仅投影 chapter/topic 字段全量拉取，JS 端分组聚合（数据量小，规避聚合 API 兼容性问题）
async function getCategories() {
  var { data } = await db.collection('quiz_questions')
    .field({ chapter: true, topic: true })
    .limit(1000)
    .get();

  var chapterMap = {};
  data.forEach(function (q) {
    var ch = q.chapter || '未分类';
    var tp = q.topic || '未分类';
    if (!chapterMap[ch]) chapterMap[ch] = { name: ch, count: 0, topics: {} };
    chapterMap[ch].count++;
    if (!chapterMap[ch].topics[tp]) chapterMap[ch].topics[tp] = 0;
    chapterMap[ch].topics[tp]++;
  });

  // 构建章节数组（含嵌套考点），按教材顺序排序
  var chapters = Object.keys(chapterMap).map(function (chName) {
    var ch = chapterMap[chName];
    var topics = Object.keys(ch.topics).map(function (tpName) {
      return { name: tpName, count: ch.topics[tpName] };
    });
    return { name: ch.name, count: ch.count, topics: topics };
  });
  chapters.sort(function (a, b) {
    var ia = CHAPTER_ORDER.indexOf(a.name);
    var ib = CHAPTER_ORDER.indexOf(b.name);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  // 扁平考点列表（含所属章节）
  var topics = [];
  chapters.forEach(function (ch) {
    ch.topics.forEach(function (tp) {
      topics.push({ name: tp.name, chapter: ch.name, count: tp.count });
    });
  });

  return { code: 0, data: { chapters: chapters, topics: topics } };
}

// list: 查询题目列表
// → { code: 0, questions: [{ questionId, stem, options, type, chapter, topic }] }
// chapter/topic 可选过滤条件（为空则不筛选），仅返回不含答案的字段，limit 50
async function listQuestions(event) {
  var chapter = event.chapter || '';
  var topic = event.topic || '';

  // 构建查询条件：仅拼接非空字段
  var where = {};
  if (chapter) where.chapter = chapter;
  if (topic) where.topic = topic;

  var { data } = await db.collection('quiz_questions')
    .where(where)
    .limit(50)
    .get();

  // 仅返回不含 answer/explanation 的字段
  var questions = data.map(function (q) {
    return {
      questionId: q._id,
      stem: q.stem || '',
      options: (q.options || []).map(function (o) {
        return { key: o.key, text: o.text };
      }),
      type: q.type || '选择题',
      chapter: q.chapter || '',
      topic: q.topic || ''
    };
  });

  return { code: 0, questions: questions };
}

// submit: 提交单题答案，判定正误并返回答案/解析
// → { code: 0, correct: boolean, answer: string, explanation: string }
async function submitAnswer(event) {
  var questionId = event.questionId;
  var userAnswer = event.userAnswer;

  if (!questionId) {
    return { code: 400, msg: '缺少 questionId' };
  }

  // 按 questionId 查询单条题目
  var { data } = await db.collection('quiz_questions')
    .where({ _id: questionId })
    .limit(1)
    .get();

  if (data.length === 0) {
    return { code: 404, msg: '题目不存在' };
  }

  var q = data[0];
  var answer = q.answer || '';
  // 判定 userAnswer 是否等于 answer（去空格后比较）
  var correct = String(userAnswer || '').trim() === String(answer).trim();

  return {
    code: 0,
    correct: correct,
    answer: answer,
    explanation: q.explanation || ''
  };
}

// ---------- 云函数入口 ----------

exports.main = async (event, context) => {
  var { OPENID } = cloud.getWXContext();
  var action = event.action || 'list';

  try {
    switch (action) {
      case 'list':
        return await listQuestions(event);
      case 'submit':
        return await submitAnswer(event);
      case 'categories':
        return await getCategories();
      default:
        return { code: -1, msg: '未知的操作类型' };
    }
  } catch (err) {
    console.error('quiz error:', err);
    return { code: -1, msg: '刷题服务异常' };
  }
};
