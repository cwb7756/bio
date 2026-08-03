jest.mock('wx-server-sdk');
const cloud = require('wx-server-sdk');
const bcrypt = require('bcryptjs');
const { toSafe, validateParams, nicknameLogin, LOCK_THRESHOLD, LOCK_DURATION } = require('../index');

// ===== toSafe 脱敏函数 =====
describe('toSafe - 脱敏函数', () => {
  test('不泄露 passwordHash', () => {
    const user = {
      nickname: 'test',
      avatar: 'url',
      grade: '高一',
      streakDays: 5,
      totalStudyMinutes: 100,
      passwordHash: '$2a$10$secretHashValue',
      _openid: 'secret-openid',
      _id: 'secret-id'
    };
    const safe = toSafe(user);
    expect(safe).not.toHaveProperty('passwordHash');
    expect(safe).not.toHaveProperty('_openid');
    expect(safe).not.toHaveProperty('_id');
    expect(safe).not.toHaveProperty('password');
  });

  test('返回正确的安全字段', () => {
    const user = {
      nickname: 'bioLover',
      avatar: 'http://avatar.png',
      grade: '高二',
      streakDays: 7,
      totalStudyMinutes: 300
    };
    const safe = toSafe(user);
    expect(safe.nickname).toBe('bioLover');
    expect(safe.avatar).toBe('http://avatar.png');
    expect(safe.grade).toBe('高二');
    expect(safe.streakDays).toBe(7);
    expect(safe.totalStudyMinutes).toBe(300);
  });

  test('缺失字段时返回默认值', () => {
    const safe = toSafe({});
    expect(safe.nickname).toBe('');
    expect(safe.avatar).toBe('');
    expect(safe.grade).toBe('');
    expect(safe.streakDays).toBe(0);
    expect(safe.totalStudyMinutes).toBe(0);
  });
});

// ===== validateParams 参数校验 =====
describe('validateParams - 参数校验', () => {
  test('字符串超过10000字符返回400', () => {
    const result = validateParams({ text: 'a'.repeat(10001) });
    expect(result.code).toBe(400);
    expect(result.msg).toContain('text');
  });

  test('数组超过100元素返回400', () => {
    const result = validateParams({ items: new Array(101).fill('x') });
    expect(result.code).toBe(400);
    expect(result.msg).toContain('items');
  });

  test('正常参数返回null', () => {
    expect(validateParams({ text: 'hello', items: [1, 2, 3] })).toBeNull();
  });

  test('空对象返回null', () => {
    expect(validateParams({})).toBeNull();
  });
});

// ===== nicknameLogin 速率限制 =====
describe('nicknameLogin - 速率限制', () => {
  beforeEach(() => {
    cloud.__store.collections = {};
    cloud.__store.openid = 'test-openid';
  });

  test('连续失败5次后触发锁定', async () => {
    const passwordHash = bcrypt.hashSync('correctpass', 10);
    cloud.__store.collections.users = {
      data: [{
        _id: 'user1',
        _openid: 'test-openid',
        nickname: 'testuser',
        passwordHash: passwordHash,
        loginFailCount: 4,
        lastFailAt: Date.now() - 1000
      }]
    };

    const result = await nicknameLogin({
      nickname: 'testuser',
      password: 'wrongpassword'
    });

    expect(result.code).toBe(-1);
    expect(result.msg).toContain('密码错误次数过多');
    expect(result.msg).toContain('15 分钟');
  });

  test('锁定期间再次尝试返回锁定提示', async () => {
    const passwordHash = bcrypt.hashSync('correctpass', 10);
    cloud.__store.collections.users = {
      data: [{
        _id: 'user1',
        _openid: 'test-openid',
        nickname: 'testuser',
        passwordHash: passwordHash,
        loginFailCount: 5,
        lastFailAt: Date.now() - 60000
      }]
    };

    const result = await nicknameLogin({
      nickname: 'testuser',
      password: 'wrongpassword'
    });

    expect(result.code).toBe(-1);
    expect(result.msg).toContain('密码错误次数过多');
    expect(result.msg).toContain('分钟后再试');
  });

  test('锁定过期后重置计数并允许重试', async () => {
    const passwordHash = bcrypt.hashSync('correctpass', 10);
    cloud.__store.collections.users = {
      data: [{
        _id: 'user1',
        _openid: 'test-openid',
        nickname: 'testuser',
        passwordHash: passwordHash,
        loginFailCount: 5,
        lastFailAt: Date.now() - LOCK_DURATION - 1000
      }]
    };

    const result = await nicknameLogin({
      nickname: 'testuser',
      password: 'wrongpassword'
    });

    // 锁定过期 → 计数重置 → 密码错误 → failCount=1
    expect(result.code).toBe(-1);
    expect(result.msg).toContain('还剩 4 次尝试机会');
  });

  test('密码正确时重置失败计数', async () => {
    const passwordHash = bcrypt.hashSync('correctpass', 10);
    cloud.__store.collections.users = {
      data: [{
        _id: 'user1',
        _openid: 'test-openid',
        nickname: 'testuser',
        passwordHash: passwordHash,
        loginFailCount: 3,
        lastFailAt: Date.now() - 1000
      }]
    };

    const result = await nicknameLogin({
      nickname: 'testuser',
      password: 'correctpass'
    });

    expect(result.code).toBe(0);
    expect(result.user).toBeDefined();
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  test('未注册昵称返回提示', async () => {
    cloud.__store.collections.users = { data: [] };

    const result = await nicknameLogin({
      nickname: 'notexist',
      password: 'anypassword'
    });

    expect(result.code).toBe(-1);
    expect(result.msg).toContain('未注册');
  });

  test('LOCK_THRESHOLD 为 5', () => {
    expect(LOCK_THRESHOLD).toBe(5);
  });

  test('LOCK_DURATION 为 15 分钟', () => {
    expect(LOCK_DURATION).toBe(15 * 60 * 1000);
  });
});
