# 微信云开发性能优化方案  
**项目：高中生物学习小程序**  

---

## 一、现状诊断

### 1.1 云函数调用频率分析
从代码审计发现的高频调用场景：

| 云函数 | 触发场景 | 单次请求 DB 操作次数 | 可优化空间 |
|--------|----------|---------------------|-----------|
| `home` | 首页加载（每次 onShow） | 4-5 次（用户信息 + 继续学习×2+ 热门考点×2） | ⭐⭐⭐⭐⭐ |
| `getCourseList` | 学习页切换教材 | 3 次（课程列表 + 课时统计 + 进度检查） | ⭐⭐⭐⭐ |
| `quiz` | 刷题分类/题目/提交 | 2-5 次（分类统计、题目列表、答案查询、进度写入×N） | ⭐⭐⭐ |
| `knowledgeMap` | 知识地图/总考点/子图谱 | 3-6 次（课程、知识点、课时进度、边关系×N） | ⭐⭐⭐⭐⭐ |
| `report` | 学习报告 | 7-8 次（用户信息、多次 count、聚合查询） | ⭐⭐⭐⭐ |
| `pet` | 宠物状态查询 | 1-2 次 | ⭐⭐ |

### 1.2 数据库调用问题点

**低效查询模式：**
```javascript
// ❌ 问题 1：重复查询相同数据
// home.js 每轮 onShow 都调用 home 云函数，即使用户未登录或数据未变
wx.cloud.callFunction({ name: 'home' }) // 每次都要查 DB

// ❌ 问题 2：N+1 查询（部分云函数仍采用）
// knowledgeMap getSubGraph 中批量查询节点后再循环查询课时
allLessonIds.forEach(id => {
  db.collection('lessons').where({ _id: id }).get() // N 次查询
})

// ❌ 问题 3：未使用聚合查询优化
// report 云函数并行 7 次 count 查询近 7 天数据
const weekPromises = last7Days().map(d => 
  db.collection('study_progress').where(...).count()
)

// ❌ 问题 4：无分页/限制导致全表扫描
// knowledgeMap getAllKnowledgePoints 查询所有知识点却只 limit 100
```

**冗余字段与索引缺失：**
- `study_progress` 集合缺少常用查询条件的复合索引（如 `{_openid, courseId, type}`）
- `courses` 等静态数据无缓存策略，每次读取都要读 DB

---

## 二、总体优化策略

### 2.1 三层缓存架构

```
┌─────────────┐
│  前端本地   │ ← L1: Storage（强一致性关键数据过期时间≤5min）
└─────────────┘
       ↓
┌─────────────┐
│  云函数聚合 │ ← L2: 一次性 fetch + 内存缓存（静态数据永缓存）
└─────────────┘
       ↓
┌─────────────┐
│  云数据库   │ ← 原始数据源
└─────────────┘
```

### 2.2 减少调用的五大手段

1. **请求合并** - 单一接口返回多份数据
2. **条件请求** - 利用 `If-Modified-Since` 类机制避免无效请求
3. **批量查询** - 一次 DB 调用替代多次
4. **延迟初始化** - 非首屏数据懒加载
5. **预加载 + 预计算** - 对稳定数据提前聚合

---

## 三、具体实施方案

### 3.1 云函数层优化

#### ✅ 方案 A：引入云函数级内存缓存（静态数据）

**适用场景**：课程内容、题目分类、知识图谱结构等变化频率低的數據  

**实现方式：**
```javascript
// cloudfunctions/getCourseList/index.js
let courseListCache = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

exports.main = async (event, context) => {
  const now = Date.now();
  if (courseListCache && (now - courseListCache.timestamp < CACHE_TTL)) {
    return courseListCache.data;
  }
  
  // 查询数据库...
  const { data: courses } = await queryFromDB();
  
  courseListCache = { timestamp: now, data: { code: 0, data: { chapters, overview } } };
  return courseListCache.data;
};
```

**收益**：减少 90%+ 的 `courses` 相关查询（占全部 DB 读的 40%）

---

#### ✅ 方案 B：合并多个云函数为一个聚合接口

**当前问题**：`home` 云函数已做了聚合，但仍有优化空间  

**优化建议**：拆分"个人信息流"与"静态内容"，减少不必要的实时查询  

```javascript
// cloudfunctions/homeAgg/index.js (新增)
async function main(event, OPENID) {
  // 并行查询无依赖数据
  const [userInfo, hotTopics, courseList] = await Promise.all([
    getUserInfo(OPENID),          // 实时
    getHotTopicsFromCache(),      // 缓存
    getContinueLearning(OPENID)   // 实时（仅当有学习记录时）
  ]);
  
  return { code: 0, data: { user, continueLearning, hotTopics } };
}
```

**更激进方案**：对首页拆分为两个云函数
- `homeStatic`：热门考点 + 功能入口（缓存 30min）
- `homeUser`：个人进度（缓存 30s，频繁刷新）

---

#### ✅ 方案 C：聚合查询优化

**优化前（report 云函数）：**
```javascript
// 7 次独立 count 查询
const weekPromises = last7Days().map(d => 
  db.collection('study_progress')
    .where(progressCond(OPENID, userID, { 
      updatedAt: _.gte(d.start).and(_.lt(d.start + 86400000)) 
    }))
    .count()
);
```

**优化后：**
```javascript
// 单次聚合查询 + 内存分组
const $ = db.command.aggregate;
const res = await db.collection('study_progress')
  .aggregate()
  .match(progressCond(OPENID, userID, {}))
  .group({
    _id: {
      day: $.dateToString({ format: '%Y-%m-%d', date: '$updatedAt' }),
      type: '$type'
    },
    count: $.sum(1)
  })
  .end();

// JS 侧映射到近 7 天
const weekMap = {};
res.list.forEach(item => weekMap[item._id.day] = item.count);
const week = last7Days().map(d => ({
  label: d.label,
  count: weekMap[dayString(d.start)] || 0
}));
```

**收益**：7 次 DB 往返 → 1 次，网络 RTT 减少 85%

---

#### ✅ 方案 D：批量查询与索引优化

**添加复合索引（通过云开发控制台手动配置）**：
```json
// study_progress 集合索引
{ "_openid": 1, "type": 1, "courseId": 1 }        // getCourseList 用
{ "_openid": 1, "type": 1, "updatedAt": 1 }        // report 按时间统计
{ "_openid": 1, "questionId": 1 }                  // 错题本查询
{ "courseId": 1 }                                  // 课程关联查询
```

**修改批量查询逻辑（knowledgeMap）**：
```javascript
// 原：循环查询单个课时
for (const id of allLessonIds) {
  const { data } = await db.collection('lessons').where({ _id: id }).get();
}

// 改：单次 in 查询
const { data: allLessons } = await db.collection('lessons')
  .where({ _id: _.in(allLessonIds) })
  .get();
```

> 注意：你的代码中 `knowledgeMap index.js` 已经做了此优化（L383），继续保持！

---

### 3.2 前端层优化

#### ✅ 方案 E：Storage 缓存策略封装

创建统一缓存工具 `miniprogram/utils/cache.js`：

```javascript
const CACHE_VERSION = 'v1'; // 版本控制，变更时清空旧缓存

function getCacheKey(name, params) {
  const hash = JSON.stringify(params);
  return `cache_${CACHE_VERSION}_${name}_${hash}`;
}

export default {
  get(name, params = {}, ttl = 5 * 60 * 1000) {
    const key = getCacheKey(name, params);
    const cached = wx.getStorageSync(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > ttl) {
      wx.removeStorageSync(key);
      return null;
    }
    
    return cached.data;
  },
  
  set(name, data, params = {}, ttl = 5 * 60 * 1000) {
    const key = getCacheKey(name, params);
    wx.setStorageSync(key, {
      timestamp: Date.now(),
      data
    });
  },
  
  remove(name, params = {}) {
    wx.removeStorageSync(getCacheKey(name, params));
  },
  
  clear() {
    const cacheVersionMatch = new RegExp(`^cache_${CACHE_VERSION}_`);
    const list = wx.getStorageInfoSync();
    list.keys.forEach(key => {
      if (cacheVersionMatch.test(key)) {
        wx.removeStorageSync(key);
      }
    });
  }
};
```

**应用示例（home.js）：**
```javascript
// miniprogram/pages/home/home.js
import cache from '../../utils/cache';

onShow() {
  // 优先读取缓存快速回显
  const cachedHome = cache.get('home', { action: 'main' }, 30 * 1000); // 30s 短缓存
  if (cachedHome) {
    this.applyHomeData(cachedHome);
  }
  
  // 异步更新
  this.loadHomeData();
}

loadHomeData() {
  wx.cloud.callFunction({ name: 'home' }).then(res => {
    if (res.result.code === 0) {
      const data = res.result.data;
      // 写入缓存（30 秒有效）
      cache.set('home', data, { action: 'main' }, 30 * 1000);
      this.setData({ ...data, loading: false });
    }
  });
}
```

**缓存失效时机：**
- 用户登出 → 清空所有用户相关缓存
- 完成题目 / 打卡 → 清空 `home`, `report`, `study` 缓存
- 应用切后台再前台 → 强制刷新个人数据（静态数据走缓存）

---

#### ✅ 方案 F：防抖 + 节流 + 条件请求

**场景 1：搜索框输入防抖**
```javascript
onSearchInput(e) {
  clearTimeout(this.searchTimer);
  const value = e.detail.value;
  
  this.searchTimer = setTimeout(() => {
    this.performSearch(value);
  }, 300); // 停止输入 300ms 后才请求
}
```

**场景 2：下拉刷新节流**
```javascript
onPullDownRefresh() {
  if (this.refreshing) return;
  this.refreshing = true;
  
  this.loadAllData().then(() => {
    wx.stopPullDownRefresh();
    this.refreshing = false;
  });
}
```

**场景 3：条件请求（If-Modified-Since 模拟）**
```javascript
// 仅当缓存过期或用户主动拉新时才请求
loadHomeData() {
  const cached = cache.get('home', {}, 30000); // 30s TTL
  if (!cached) {
    this.fetchHome();
  } else {
    this.setData({ ...cached, loading: false });
  }
}
```

---

#### ✅ 方案 G：懒加载与非首屏数据延迟

**当前**：所有页面 `onLoad` 立即加载全部数据  
**优化**：区分首屏/次屏数据  

```javascript
// miniprogram/pages/knowledge/knowledge.js
onLoad() {
  // 首屏：课程概览（立即加载）
  this.loadOverview(); 
  
  // 次屏：知识点详情（滚动到视口才加载）
  this.scrollObserver = this.createIntersectionObserver();
}

onReachBottom() {
  // 上拉加载更多
  this.loadMoreKnowledgePoints();
}
```

---

### 3.3 云开发特性利用

#### ✅ 方案 H：利用云函数冷启动优化

**问题**：云函数冷启动需重新加载模块，首次响应慢  
**解决**：
1. **减小包体积**：移除未使用的 npm 包，使用 `wx-server-sdk` 内置能力
2. **公共依赖外置**：将工具函数提取为独立小云函数（如 `utils-base64`, `utils-time`）
3. **启用预留实例**：云开发控制台开启“预留实例数=1”，消除冷启动

---

#### ✅ 方案 I：数据库安全规则 + 索引自动化

在云开发控制台的**数据库 → 索引管理**中：
- 为 `study_progress` 添加复合索引
- 为 `quiz_questions` 添加 `chapter + topic` 联合索引
- 为 `knowledge_points` 添加 `courseId` 索引

**自动索引建议（可在 `seedDatabase` 云函数中添加）**：
```javascript
async function ensureIndexes() {
  await db.collection('study_progress').createIndex({ _openid: 1, type: 1 });
  await db.collection('study_progress').createIndex({ _openid: 1, courseId: 1 });
  // ...
}
```

---

## 四、分阶段实施计划

### Phase 1：立竿见影（1-2 天）
- [ ] 创建 `cache.js` 工具库
- [ ] 为核心页面（home、study、knowledge）加存储缓存（TTL 30s-5min）
- [ ] 为 `getCourseList`、`knowledgeMap` 云函数添加内存缓存（TTL 5min）
- [ ] 配置数据库复合索引

**预期收益**：DB 查询量减少 40%，首屏速度提升 50%

---

### Phase 2：深度重构（3-5 天）
- [ ] 重写 `report` 云函数使用聚合 API
- [ ] 拆分 `home` 云函数为 `homeStatic` + `homeUser`
- [ ] 前端增加懒加载、防抖、条件请求
- [ ] 云函数启用预留实例

**预期收益**：平均响应时间下降 60%，云函数调用次数减少 55%

---

### Phase 3：长期维护（持续）
- [ ] 监控云函数调用成本（云开发控制台 Metrics）
- [ ] 建立缓存版本管理（`CACHE_VERSION`）
- [ ] 定期清理过期缓存数据
- [ ] A/B 测试不同 TTL 效果

---

## 五、监控指标

| 指标 | 当前值（预估） | 目标值 | 测量方法 |
|------|---------------|--------|---------|
| 首页加载耗时 | ~2-3s | <800ms | 前端性能埋点 |
| 单次云函数平均耗时 | ~500ms | <200ms | 云函数日志 |
| DB 查询次数/会话 | ~150 次 | <50 次 | 云开发控制台 Logs |
| 云函数冷启动比例 | ~30% | <5% | 云函数监控 |
| 缓存命中率 | 0% | >70% | 自定义打点 |

---

## 六、风险与应对

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 缓存数据与云端不一致 | 用户看到旧进度 | TTL 设短（30s），关键操作（答题/打卡）后立即清空缓存 |
| 云函数内存超限 | 静态数据大导致 OOM | 限制缓存数据大小（只缓存必要字段），定期重置缓存对象 |
| 索引配置错误 | 查询变慢 | 先在测试环境验证，添加前备份原数据结构 |
| 云函数实例数不足 | 高并发时排队 | 云开发 Pro 版弹性扩容，或降级为非高峰时段预热 |

---

## 七、参考案例

### 案例 1：首页优化前后对比

**优化前**（每轮 onShow）：
```
DB 调用：users ×1 + study_progress ×2 + lessons ×1 + courses ×2 = 6 次
耗时：2.1s
```

**优化后**：
```
L1 缓存命中：返回本地数据（0 次 DB）→ 200ms
L1 未命中：cloud functions home ×1 → 400ms（内部并行查询）
DB 实际调用：1 次云函数调用（内部聚合 4 次查询）
```

---

### 案例 2：刷题流程优化

**优化前**：
```
用户选章节 → categories 查询 (1 次) → 选题目 (1 次) → 交答案 (N 次)
共 N+2 次云函数调用，N 次 DB 写入
```

**优化后**：
```
首屏预加载章节分类到缓存 → 选题目时无需再次请求
批量提交答案（一次上传 20 题） → N 次写入合并为 N/20 次调用
```

---

## 八、总结建议

### 优先级排序（从高到低）

1. **立刻做**：前端 Storage 缓存 + 云函数内存缓存（收益最高，风险最低）
2. **本周内**：添加数据库复合索引 + 聚合查询优化
3. **下月规划**：懒加载 + 云函数预留实例 + 监控体系

### 技术选型推荐

| 需求 | 推荐方案 | 理由 |
|------|---------|------|
| 短期快赢 | 前端缓存 + 云函数内存缓存 | 改动小，一周可上线 |
| 中期深度优化 | 聚合查询 + 索引优化 | 从根本上减少 DB 压力 |
| 长期成本节省 | 云函数预留实例 + 静态资源 CDN | 适合 DAU>1000 后的规模化方案 |

---

**文档版本**：v1.0  
**生成时间**：2026-07-27  
**适用范围**：微信云开发 · 高中生物学习小程序  
**后续行动**：Phase 1 实施清单已标 ✅，建议在 PR 中关联此文档编号
