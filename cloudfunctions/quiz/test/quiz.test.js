jest.mock('wx-server-sdk');
const cloud = require('wx-server-sdk');
const { submitAnswer, reportQuiz } = require('../index');

// ===== submitAnswer 判分逻辑 =====
describe('submitAnswer - 判分逻辑', () => {
  beforeEach(() => {
    cloud.__store.collections = {};
  });

  test('正确答案返回 correct=true', async () => {
    cloud.__store.collections.quiz_questions = {
      data: [{
        _id: 'q1',
        stem: 'DNA的基本组成单位是？',
        options: [{ key: 'A', text: '核苷酸' }, { key: 'B', text: '氨基酸' }],
        answer: 'A',
        explanation: 'DNA由核苷酸组成',
        type: '选择题'
      }]
    };

    const result = await submitAnswer({ questionId: 'q1', userAnswer: 'A' });
    expect(result.code).toBe(0);
    expect(result.correct).toBe(true);
    expect(result.answer).toBe('A');
    expect(result.explanation).toBe('DNA由核苷酸组成');
  });

  test('错误答案返回 correct=false', async () => {
    cloud.__store.collections.quiz_questions = {
      data: [{
        _id: 'q1',
        stem: '测试题',
        answer: 'B',
        explanation: '解析'
      }]
    };

    const result = await submitAnswer({ questionId: 'q1', userAnswer: 'A' });
    expect(result.code).toBe(0);
    expect(result.correct).toBe(false);
  });

  test('答案去空格后比较', async () => {
    cloud.__store.collections.quiz_questions = {
      data: [{
        _id: 'q1',
        stem: '测试',
        answer: 'A',
        explanation: '解析'
      }]
    };

    const result = await submitAnswer({ questionId: 'q1', userAnswer: '  A  ' });
    expect(result.correct).toBe(true);
  });

  test('答案也去空格', async () => {
    cloud.__store.collections.quiz_questions = {
      data: [{
        _id: 'q1',
        stem: '测试',
        answer: ' B ',
        explanation: '解析'
      }]
    };

    const result = await submitAnswer({ questionId: 'q1', userAnswer: 'B' });
    expect(result.correct).toBe(true);
  });

  test('缺少 questionId 返回 400', async () => {
    const result = await submitAnswer({ userAnswer: 'A' });
    expect(result.code).toBe(400);
  });

  test('题目不存在返回 404', async () => {
    cloud.__store.collections.quiz_questions = { data: [] };
    const result = await submitAnswer({ questionId: 'nonexistent', userAnswer: 'A' });
    expect(result.code).toBe(404);
  });
});

// ===== reportQuiz 批量上报 =====
describe('reportQuiz - 批量上报', () => {
  beforeEach(() => {
    cloud.__store.collections = {};
    cloud.__store.openid = 'test-openid';
  });

  test('未登录返回 401', async () => {
    const result = await reportQuiz({ records: [] }, null);
    expect(result.code).toBe(401);
  });

  test('已作答题目写入 study_progress', async () => {
    cloud.__store.collections.study_progress = { data: [] };
    const records = [
      { questionId: 'q1', chapter: '必修一', topic: '细胞', correct: true, answered: true },
      { questionId: 'q2', chapter: '必修一', topic: '细胞', correct: false, answered: true }
    ];
    const result = await reportQuiz({ records }, 'test-openid');
    expect(result.code).toBe(0);
    expect(result.added).toBe(2);
  });

  test('跳过的题目不写入但返回答案', async () => {
    cloud.__store.collections.study_progress = { data: [] };
    cloud.__store.collections.quiz_questions = {
      data: [{
        _id: 'q3',
        answer: 'C',
        explanation: '解析内容'
      }]
    };
    const records = [
      { questionId: 'q3', answered: false }
    ];
    const result = await reportQuiz({ records }, 'test-openid');
    expect(result.code).toBe(0);
    expect(result.added).toBe(0);
    expect(result.answers.q3).toBeDefined();
    expect(result.answers.q3.answer).toBe('C');
    expect(result.answers.q3.explanation).toBe('解析内容');
  });

  test('混合场景：已作答+跳过', async () => {
    cloud.__store.collections.study_progress = { data: [] };
    cloud.__store.collections.quiz_questions = {
      data: [
        { _id: 'q_skip', answer: 'D', explanation: '跳过解析' }
      ]
    };
    const records = [
      { questionId: 'q1', chapter: '必修一', topic: '细胞', correct: true, answered: true },
      { questionId: 'q_skip', answered: false }
    ];
    const result = await reportQuiz({ records }, 'test-openid');
    expect(result.code).toBe(0);
    expect(result.added).toBe(1);
    expect(result.answers.q_skip.answer).toBe('D');
  });

  test('写入 study_progress 时包含 _openid', async () => {
    cloud.__store.collections.study_progress = { data: [] };
    const records = [
      { questionId: 'q1', chapter: '必修一', topic: '细胞', correct: true, answered: true }
    ];
    await reportQuiz({ records }, 'test-openid');
    const progress = cloud.__store.collections.study_progress.data[0];
    expect(progress._openid).toBe('test-openid');
    expect(progress.type).toBe('quiz');
    expect(progress.correct).toBe(true);
  });
});
