jest.mock('wx-server-sdk');
const cloud = require('wx-server-sdk');
const {
  listSessions,
  getSession,
  saveSession,
  clearSession,
  updateTitle,
  MAX_SESSION_MESSAGES,
  SESSIONS_LIMIT
} = require('../index');

// ===== 会话隔离 =====
describe('会话隔离', () => {
  beforeEach(() => {
    cloud.__store.collections = {};
    cloud.__store.openid = 'userA-openid';
  });

  test('getSession 拒绝访问他人会话', async () => {
    cloud.__store.collections.ai_chat_sessions = {
      data: [{
        _id: 'session1',
        _openid: 'userB-openid',
        title: 'User B session',
        messages: [{ role: 'user', content: 'hi' }]
      }]
    };

    const result = await getSession({ sessionId: 'session1' }, 'userA-openid');
    expect(result.code).toBe(404);
    expect(result.msg).toContain('无权');
  });

  test('getSession 允许访问自己的会话', async () => {
    cloud.__store.collections.ai_chat_sessions = {
      data: [{
        _id: 'session1',
        _openid: 'userA-openid',
        title: 'My session',
        messages: [{ role: 'user', content: 'hi' }],
        createdAt: 1000,
        updatedAt: 2000
      }]
    };

    const result = await getSession({ sessionId: 'session1' }, 'userA-openid');
    expect(result.code).toBe(0);
    expect(result.session.title).toBe('My session');
    expect(result.session.messages).toHaveLength(1);
  });

  test('getSession 缺少 sessionId 返回 400', async () => {
    const result = await getSession({}, 'userA-openid');
    expect(result.code).toBe(400);
  });

  test('saveSession 新建会话写入 _openid', async () => {
    const result = await saveSession({
      title: 'New chat',
      messages: [{ role: 'user', content: 'hello' }]
    }, 'userA-openid');
    expect(result.code).toBe(0);
    expect(result.sessionId).toBeDefined();

    // 验证 _openid 被正确设置
    const sessions = cloud.__store.collections.ai_chat_sessions.data;
    expect(sessions[0]._openid).toBe('userA-openid');
  });

  test('saveSession 更新需匹配 _openid', async () => {
    cloud.__store.collections.ai_chat_sessions = {
      data: [{
        _id: 'session1',
        _openid: 'userB-openid',
        title: 'User B',
        messages: []
      }]
    };

    const result = await saveSession({
      sessionId: 'session1',
      title: 'Hacked',
      messages: [{ role: 'user', content: 'hack' }]
    }, 'userA-openid');

    // _openid 不匹配 → updated=0 → 404
    expect(result.code).toBe(404);
  });

  test('saveSession 更新自己的会话成功', async () => {
    cloud.__store.collections.ai_chat_sessions = {
      data: [{
        _id: 'session1',
        _openid: 'userA-openid',
        title: 'Old title',
        messages: [{ role: 'user', content: 'old' }]
      }]
    };

    const result = await saveSession({
      sessionId: 'session1',
      title: 'New title',
      messages: [{ role: 'user', content: 'new' }]
    }, 'userA-openid');

    expect(result.code).toBe(0);
    expect(result.sessionId).toBe('session1');
  });

  test('clearSession 需匹配 _openid', async () => {
    cloud.__store.collections.ai_chat_sessions = {
      data: [{
        _id: 'session1',
        _openid: 'userB-openid',
        messages: [{ role: 'user', content: 'data' }]
      }]
    };

    const result = await clearSession({ sessionId: 'session1' }, 'userA-openid');
    expect(result.code).toBe(404);
  });

  test('clearSession 成功清空自己会话的消息', async () => {
    cloud.__store.collections.ai_chat_sessions = {
      data: [{
        _id: 'session1',
        _openid: 'userA-openid',
        messages: [{ role: 'user', content: 'data' }]
      }]
    };

    const result = await clearSession({ sessionId: 'session1' }, 'userA-openid');
    expect(result.code).toBe(0);

    // 验证消息被清空
    const session = cloud.__store.collections.ai_chat_sessions.data[0];
    expect(session.messages).toEqual([]);
  });

  test('clearSession 缺少 sessionId 返回 400', async () => {
    const result = await clearSession({}, 'userA-openid');
    expect(result.code).toBe(400);
  });

  test('updateTitle 需匹配 _openid', async () => {
    cloud.__store.collections.ai_chat_sessions = {
      data: [{
        _id: 'session1',
        _openid: 'userB-openid',
        title: 'Old title'
      }]
    };

    const result = await updateTitle({ sessionId: 'session1', title: 'New title' }, 'userA-openid');
    expect(result.code).toBe(404);
  });

  test('listSessions 仅返回当前用户会话', async () => {
    cloud.__store.collections.ai_chat_sessions = {
      data: [
        { _id: 's1', _openid: 'userA-openid', title: 'A1', updatedAt: 2000, createdAt: 1000 },
        { _id: 's2', _openid: 'userB-openid', title: 'B1', updatedAt: 3000, createdAt: 2000 },
        { _id: 's3', _openid: 'userA-openid', title: 'A2', updatedAt: 4000, createdAt: 3000 }
      ]
    };

    const result = await listSessions('userA-openid');
    expect(result.code).toBe(0);
    expect(result.sessions).toHaveLength(2);
    // 按 updatedAt 降序排列
    expect(result.sessions[0].title).toBe('A2');
    expect(result.sessions[1].title).toBe('A1');
  });

  test('listSessions 无会话时返回空数组', async () => {
    cloud.__store.collections.ai_chat_sessions = { data: [] };
    const result = await listSessions('userA-openid');
    expect(result.code).toBe(0);
    expect(result.sessions).toEqual([]);
  });
});

// ===== 消息截断 =====
describe('消息截断', () => {
  beforeEach(() => {
    cloud.__store.collections = {};
    cloud.__store.openid = 'userA-openid';
  });

  test('saveSession 截断消息至最新100条', async () => {
    const messages = [];
    for (let i = 0; i < 150; i++) {
      messages.push({ role: 'user', content: 'msg' + i });
    }

    const result = await saveSession({
      title: 'Long chat',
      messages: messages
    }, 'userA-openid');

    expect(result.code).toBe(0);

    const savedSession = cloud.__store.collections.ai_chat_sessions.data[0];
    expect(savedSession.messages).toHaveLength(MAX_SESSION_MESSAGES);
    // 保留最新 100 条（索引 50-149）
    expect(savedSession.messages[0].content).toBe('msg50');
    expect(savedSession.messages[99].content).toBe('msg149');
  });

  test('MAX_SESSION_MESSAGES 为 100', () => {
    expect(MAX_SESSION_MESSAGES).toBe(100);
  });

  test('SESSIONS_LIMIT 为 20', () => {
    expect(SESSIONS_LIMIT).toBe(20);
  });
});
