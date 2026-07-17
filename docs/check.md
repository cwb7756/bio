# 微信小程序上线前检查报告

> **审计日期**：2026-07-17  
> **审计范围**：高中生物学习小程序（微信云开发）——11 个云函数、15 个前端页面、自定义 tabbar、AI 答疑（RAG+流式）、刷题、闪卡、错题、成就、宠物养成等模块  
> **审计员**：Alex（云函数安全与数据隔离）、Sam（前端体验与交互）、Jack（配置/数据库安全/性能）  
> **整体就绪度评分**：3.5 / 10

---

## 一、执行摘要

**综合评分：3.5/10**

本项目在 UI 设计、代码规范、自定义组件、CSS 变量体系等方面展现了较高的工程质量，但存在**系统性的数据安全架构缺陷**和**核心功能缺失**，当前不建议直接上线。

三大阻塞维度：

1. **数据安全架构缺陷**：前端绕过云函数直接读写数据库（含题目答案）、云函数信任客户端传入的 `userID` 参数通过 `_.or()` 与 `OPENID` 组合查询（可跨用户读写）、项目无任何数据库安全规则文件。三者叠加构成完整的数据泄露与越权链路。
2. **核心功能不可用**：刷题（Quiz）页面为纯硬编码 Mock 数据，无云函数集成；"继续学习"功能因 study 页未消费 `pendingCourseId` 而断裂；Mine 页面学习统计与成就全部为假数据。
3. **身份认证缺失**：无全局登录拦截机制，受保护页面可直接访问；`emailLogin` 不校验 `OPENID` 可跨账号冒充；login 页提供"跳过"按钮可绕过登录。

**上线建议**：需完成全部 P0 阻塞项后方可上线。P0 修复预计涉及 6 个云函数重构 + AI 页面数据库访问层迁移 + 数据库安全规则配置 + 全局登录拦截 + Quiz 功能开发，建议分配 2-3 个开发周。

---

## 二、P0 阻塞项（必须上线前修复）

### P0-1　前端绕过云函数直连数据库，暴露题目答案

**涉及文件**：
- [ai.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/ai/ai.js#L91)（L91, L117, L198, L211, L264 — 6 处 `wx.cloud.database()` 直连）
- [ai.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/ai/ai.js#L290)（L290-L294 — `prefetchData` 直接查询 `quiz_questions` 集合）
- [ai.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/ai/ai.js#L349)（L349-L352 — `matchContext` 将 `q.answer` / `q.explanation` 拼入 system prompt）

**来源**：审计 C-C1 + B-C5（合并）

**问题描述**：AI 页面通过 `wx.cloud.database()` 在客户端直接读写 `ai_chat_sessions`（会话增删改查）、`courses`（读）、`lessons`（读）、`quiz_questions`（读，含 `answer` 和 `explanation` 字段）。`prefetchData` 在页面加载时一次性获取最多 20 道题目的完整数据（含正确答案与解析），`matchContext` 在用户提问时将匹配到的题目答案与解析拼入 system prompt。

**影响**：用户通过微信开发者工具或抓包工具可直接读取 `quiz_questions` 集合的全部正确答案与解析，刷题功能形同虚设。`ai_chat_sessions` 的读写也绕过了云函数层的权限校验。

**修复建议**：
1. 新建 `aiChat` 云函数，封装会话列表读取、会话详情读取、会话创建/更新/清空、RAG 上下文匹配等逻辑，前端仅通过 `wx.cloud.callFunction` 调用。
2. 云函数内部使用 `cloud.getWXContext()` 获取 `OPENID` 进行数据隔离，`quiz_questions` 的 `answer`/`explanation` 字段仅在云函数侧注入 system prompt，不返回前端。
3. 配合 P0-3 数据库安全规则，将 `quiz_questions` 集合设为仅云函数可读。

---

### P0-2　云函数信任客户端传入 userID，导致跨用户数据泄露与篡改

**涉及文件**：
- [knowledgeMap/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/knowledgeMap/index.js#L38)（L38-L41 — `_.or([{_openid: OPENID}, {userID: userID}]` 组合查询 `study_progress`）
- [mistakes/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/mistakes/index.js#L10)（L10-L16 — `userCondition` 函数；L115, L119 — `removeMistake` 所有权校验可绕过；L73 — `addMistake` 写入客户端 `userID`）
- [achievements/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/achievements/index.js#L10)（L10-L16 — `userCondition` 函数，查询 `user_achievements`）
- [report/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/report/index.js#L47)（L47 — `OPENID` 查不到时直接用 `userID` 查 `users`；L52-L58 — `_.or` 组合查询 `study_progress`）
- [pet/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/pet/index.js#L18)（L18-L24 — `userCondition` 函数；L130, L175, L176 — `feed`/`pat` 可修改他人宠物状态）
- [settings/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/settings/index.js#L16)（L16-L26 — `findUser` 函数；L33, L52 — `update` 可改他人设置）
- [mistakes/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/mistakes/index.js#L52)（L52-L56 — 回退查询 `userID:'demo'` 数据）

**来源**：审计 A-C1 + A-C3 + A-C4（合并）

**问题描述**：6 个云函数从客户端 `event` 接收 `userID` 参数，并通过 `_.or()` 与服务端获取的 `OPENID` 组合作为查询条件。攻击者传入他人 `userID` 即可匹配到他人数据——读取学习进度、错题（含答案与解析）、成就、学习报告、宠物状态、用户设置；写操作同样受影响：`pet` 的 `feed`/`pat` 可修改他人宠物，`settings` 的 `update` 可改他人设置，`mistakes` 的 `remove` 所有权校验使用 `_.or` 可绕过删除他人错题。`addMistake` 还将客户端提供的 `userID` 写入文档，导致数据归属混淆。多个云函数在用户无记录时回退查询 `userID:'demo'` 的数据，若被攻击者传入可读到 demo 示例数据。

**影响**：任意用户可读取和篡改其他用户的学习数据、错题、成就、宠物状态、个人设置，构成严重的数据泄露与越权操作。

**修复建议**：
1. **移除所有云函数中对客户端 `userID` 参数的信任**，查询条件仅使用 `cloud.getWXContext()` 获取的 `OPENID`。
2. 删除 `userCondition` 函数中的 `userID` 分支，所有查询/写入仅以 `_openid` 为条件。
3. `removeMistake` 的所有权校验改为仅检查 `m._openid === openid`，移除 `userID` 分支。
4. `addMistake` 写入时移除 `userID` 字段，仅写入 `_openid`。
5. 移除 `report` 中 `OPENID` 查不到时用 `userID` 回退查 `users` 的逻辑。
6. 移除 `userID:'demo'` 回退查询，改为返回空列表 + 前端展示空状态。

---

### P0-3　项目无数据库安全规则文件

**涉及文件**：项目根目录（Glob `*permission*` / `*database*` 无结果，14 个集合无安全规则配置）

**来源**：审计 C-C2

**问题描述**：项目中不存在任何数据库安全规则文件（`database.permission.json` 或在云开发控制台配置）。14 个数据库集合的权限完全依赖控制台默认设置。若默认权限为"所有用户可读"，则 `users` 集合中的 `passwordHash`、`email` 等敏感字段可被任意用户通过客户端 `wx.cloud.database()` 直接读取。

**影响**：与 P0-1 叠加，即使修复了 AI 页面的直连问题，其他集合（如 `users.passwordHash`）仍可能因默认权限宽松而暴露。这是数据安全的最后一道防线缺失。

**修复建议**：
1. 在云开发控制台为每个集合配置安全规则（或在项目中创建 `database.json` 配置文件）。
2. `users` 集合：仅创建者可读写，且 `passwordHash` 字段设置 `"read": false` 禁止客户端读取。
3. `quiz_questions` 集合：仅云函数可读（`"read": false`）。
4. `ai_chat_sessions` 集合：仅创建者可读写。
5. `courses`/`lessons`/`knowledge_points`/`videos`/`achievements` 集合：所有用户可读，仅管理员可写。
6. 其余用户数据集合（`study_progress`/`user_achievements`/`mistakes`/`pet`/`pet_diary`/`flashcards`）均设为仅创建者可读写。
7. 参考第六节"数据库集合清单与建议权限模型"逐项配置。

---

### P0-4　emailLogin 不校验 OPENID，可跨账号冒充

**涉及文件**：
- [login/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/login/index.js#L69)（L69-L95 — `emailLogin` 函数完全不调用 `cloud.getWXContext()`）
- [login/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/login/index.js#L16)（L16-L20 — `toSafe` 仅删除 `passwordHash`，仍返回 `_openid`/`_id`/`username`）
- [login/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/login/index.js#L123)（L123 — `emailRegister` 允许空 `OPENID` 写入 `_openid: OPENID || ''`）

**来源**：审计 A-C2 + A-I1 + A-I2

**问题描述**：`emailLogin` 仅凭 `email` + `password` 验证，不获取/校验 `cloud.getWXContext()` 的 `OPENID`。验证成功后返回完整 user 对象（`toSafe` 仅删除 `passwordHash`，仍保留 `_openid`、`_id`、`username`）。攻击者获取任意邮箱密码后可冒充该用户登录，且返回的 `_openid` 可被用于伪造后续云函数调用。`emailRegister` 允许 `OPENID` 为空时写入空字符串，导致邮箱注册的用户无法通过 `_openid` 隔离。

**影响**：邮箱登录通道无身份绑定，可跨账号冒充，且泄露 `_openid` 等内部标识。

**修复建议**：
1. `emailLogin` 中增加 `const { OPENID } = cloud.getWXContext()`，验证成功后将该 `OPENID` 绑定到用户记录（`_openid` 字段），或要求 `OPENID` 与用户记录中的 `_openid` 一致。
2. `toSafe` 增加删除 `_openid` 字段，仅返回前端需要的 `nickname`/`avatar`/`grade`/`streakDays`/`totalStudyMinutes` 等业务字段。
3. `emailRegister` 中 `OPENID` 为空时拒绝注册（返回错误提示"请在微信小程序内注册"）。

---

### P0-5　Quiz 页面完全硬编码 Mock 数据，刷题功能不可用

**涉及文件**：
- [quiz.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/quiz/quiz.js#L5)（L5-L25 — 题目、选项、AI 解析步骤均为硬编码常量）
- [quiz.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/quiz/quiz.js#L75)（L75-L87 — `nextQuestion` 仅递增计数器，不加载新题）
- [quiz.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/quiz/quiz.js#L55)（L55 — `saveToMistakes` 使用硬编码 `questionId:'quiz_demo_1'`）

**来源**：审计 B-C1

**问题描述**：Quiz 页面的题目数据（题干、选项、正确答案、AI 解析步骤）全部为 `data` 中的硬编码常量，无任何云函数调用。`nextQuestion` 仅将 `current` 计数器 +1 并重置 `answered`/`selectedOption`，但不加载新题目——用户看到的始终是同一道题。`saveToMistakes` 虽调用了 `mistakes` 云函数，但 `questionId` 硬编码为 `'quiz_demo_1'`，无法正确归属。

**影响**：刷题作为核心学习功能完全不可用，用户反复看到同一道题目，收藏到错题本的题目 ID 错误。

**修复建议**：
1. 新建 `quiz` 云函数，支持按章节/知识点从 `quiz_questions` 集合分页获取题目（不返回 `answer`/`explanation`）。
2. 前端 `onLoad` 调用云函数加载题目列表，`nextQuestion` 加载下一题数据。
3. 用户作答后，前端提交答案到云函数，由云函数判定正误并返回解析（此时才返回 `answer`/`explanation`）。
4. `saveToMistakes` 使用真实 `questionId`。

---

### P0-6　"继续学习"功能断裂，pendingCourseId 未被消费

**涉及文件**：
- [home.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/home/home.js#L112)（L112-L127 — `continueStudy`/`goHotTopic` 设置 `app.globalData.pendingCourseId` 后 `switchTab` 到 study）
- [study.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/study/study.js#L23)（L23-L28 — `onShow` 仅调用 `loadCourseList()`，完全未读取 `pendingCourseId`）

**来源**：审计 B-C3

**问题描述**：首页"继续学习"卡片和热门考点点击后，将 `courseId` 存入 `app.globalData.pendingCourseId` 并 `switchTab` 跳转到 study 页。但 study 页 `onShow` 仅调用 `loadCourseList()` 加载课程列表，完全未读取或消费 `pendingCourseId`，导致用户点击"继续学习"后到达 study 页没有任何定向跳转行为。

**影响**：核心用户流程"继续学习"断裂，用户点击后无法到达预期课程，体验严重受损。

**修复建议**：study 页 `onShow` 中检查 `app.globalData.pendingCourseId`，若存在则清除该值并 `navigateTo` 到对应 course 详情页，或自动切换到对应教材 tab 并高亮目标课程。

---

### P0-7　无全局登录拦截机制

**涉及文件**：
- [app.js](file:///c:/Users/17723/Desktop/bio/miniprogram/app.js#L2)（L2-L19 — `onLaunch` 仅初始化云环境，不管理登录态）
- [mine.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/mine/mine.js#L95)（L95-L100 — `goMenu` 不拦截未登录用户）
- [login.wxml](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/login/login.wxml#L108)（L108-L110 — "跳过，返回首页"按钮允许跳过登录）
- [login.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/login/login.js#L143)（L143-L146 — `goHome` 直接跳转首页）

**来源**：审计 B-C4 + B-W12

**问题描述**：`app.js` 的 `globalData` 仅包含 `env`，不含 `userInfo`/`isLoggedIn`。受保护页面（mine、pet、settings、report、achievements、mistakes、flashcards）的 `onShow`/`onLoad` 直接调用云函数，不做登录态检查。Mine 页 `goMenu` 不拦截未登录用户直接 `navigateTo` 到受保护页面。Login 页提供"跳过，返回首页"按钮允许未登录直接进入首页。

**影响**：未登录用户可访问所有受保护页面，云函数调用因无有效身份返回 demo 数据或空数据，用户体验混乱；敏感页面（如 settings、report）无登录门槛。

**修复建议**：
1. `app.js` 的 `globalData` 增加 `userInfo`/`isLoggedIn` 字段，`onLaunch` 中从 `wx.getStorageSync('userInfo')` 恢复登录态。
2. 封装 `checkLogin()` 工具函数，受保护页面 `onShow` 调用，未登录时 `navigateTo` 到 login 页。
3. 移除 login 页"跳过，返回首页"按钮，或在跳过后标记游客模式并限制受保护页面访问。
4. Mine 页 `goMenu` 增加登录检查。

---

## 三、P1 高优先级问题

### P1-1　Mine 页面统计与成就数据为硬编码常量

**涉及文件**：
- [mine.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/mine/mine.js#L15)（L15-L25 — `stats` 连续打卡23天/刷题486题/学习38h、`achievements` 4个均为硬编码常量）
- [mine.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/mine/mine.js#L49)（L49-L66 — `refreshUser` 仅更新用户名头像，从不调云函数获取真实统计）

**来源**：审计 B-C2

**问题描述**：Mine 页面的学习统计（连续打卡、刷题总数、学习时长）和成就列表全部为 `data` 中的硬编码常量，`refreshUser` 仅从本地缓存读取 `nickname`/`avatar`/`grade`，不调用 `report` 或 `achievements` 云函数获取真实数据。

**影响**：用户看到的统计数据全部为假数据，与实际学习情况不符，严重损害产品可信度。

**修复建议**：`onShow` 中调用 `report` 云函数获取真实统计数据，调用 `achievements` 云函数获取已解锁成就，更新 `stats` 和 `achievements`。

---

### P1-2　前端 userID 字段名不匹配，云函数 userID 分支失效

**涉及文件**：
- [mistakes.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/mistakes/mistakes.js#L26)（L26 — `userID: info.userID || ''`）
- [pet.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/pet/pet.js#L49)（L49, L83 — 同上）
- [settings.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/settings/settings.js#L33)（L33, L77 — 同上）
- [map.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/map/map.js#L37)（L37 — 同上）
- [quiz.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/quiz/quiz.js#L54)（L54 — 同上）
- [login/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/login/index.js#L16)（L16-L20 — `toSafe` 返回 user 对象含 `_id` 但不含 `userID` 字段）
- [home/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/home/index.js#L26)（L26 — `userID: user.userID || user._id` 合成字段）

**来源**：审计 B-C6

**问题描述**：`login` 云函数的 `toSafe` 返回的 user 对象含 `_id` 但不含 `userID` 字段。前端各页面从 `wx.getStorageSync('userInfo')` 读取 `info.userID`，结果恒为 `undefined`，经 `|| ''` 传空串给云函数。`home` 云函数在返回时合成了 `userID: user.userID || user._id`，因此首页加载后 `userInfo` 才会有 `userID` 字段——但此时传入的值是 `user._id`，而非数据库文档中的 `userID` 字段。共涉及 10 处前端调用。

**影响**：云函数的 `userID` 查询分支实际传入空串或 `_id`，与数据库文档中的 `userID` 字段不匹配，导致查询结果不确定。此问题与 P0-2 叠加：虽然当前 `userID` 传参大多为空（部分缓解了越权风险），但 `home` 加载后 `userID` 被设为 `user._id`，攻击者可利用此值构造请求。

**修复建议**：统一身份标识方案——移除前端传 `userID` 参数的做法（配合 P0-2 修复），云函数仅依赖 `OPENID`。若确需 `userID`，应由云函数侧从 `OPENID` 查询 `users` 集合获取，不信任客户端传值。

---

### P1-3　全部云函数运行时 Nodejs16.13（EOL 2023-09）

**涉及文件**：
- [login/config.json](file:///c:/Users/17723/Desktop/bio/cloudfunctions/login/config.json#L6)（L6 — `"runtime": "Nodejs16.13"`）
- 其余 10 个云函数 `config.json` 同样为 `Nodejs16.13`

**来源**：审计 A-W3 + C-W1（合并）

**问题描述**：全部 11 个云函数的运行时为 `Nodejs16.13`，该版本已于 2023 年 9 月停止维护（EOL），不再接收安全补丁。

**影响**：存在已知漏洞未被修复的风险，且未来微信云开发可能停止支持该运行时。

**修复建议**：将全部云函数 `config.json` 的 `runtime` 升级为 `Nodejs18.15` 或 `Nodejs20.18`，测试兼容性后逐一部署。

---

### P1-4　getCourseList 存在 N+1 查询

**涉及文件**：
- [getCourseList/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/getCourseList/index.js#L42)（L42-L58 — 循环内逐课程查询 `lessons` 和 `study_progress`）

**来源**：审计 A-W2 + C-W6（合并）

**问题描述**：`getCourseList` 在获取课程列表后，对每个课程在循环内分别查询 `lessons` 集合（获取总课时数）和 `study_progress` 集合（获取已完成课时数），形成 N+1 查询模式。若一个教材下有 10 门课程，则产生 1 + 10×2 = 21 次数据库查询。

**影响**：课程数量增多时云函数执行时间线性增长，可能触发 10 秒超时。

**修复建议**：使用 `db.collection('lessons').where({ courseId: _.in(courseIds) }).get()` 一次性获取所有课程的课时，再在前端按 `courseId` 分组统计；`study_progress` 同理使用 `_.in()` 批量查询。

---

### P1-5　sitemap.json 允许索引所有页面（含 login/settings 等敏感页）

**涉及文件**：
- [sitemap.json](file:///c:/Users/17723/Desktop/bio/miniprogram/sitemap.json#L3)（L3-L6 — `"action": "allow", "page": "*"`）

**来源**：审计 B-I7 + C-W4（合并）

**问题描述**：`sitemap.json` 配置为 `"action": "allow", "page": "*"`，允许微信搜索引擎索引所有页面，包括 `login`、`settings`、`pet`、`report` 等不应被公开索引的页面。

**影响**：敏感页面可能被搜索引擎收录，存在隐私泄露风险。

**修复建议**：改为 `"action": "disallow", "page": "*"` 全局禁止索引，或逐页面配置仅允许 `home`/`study`/`ai` 等公开页面被索引。

---

### P1-6　project.config.json 上传时包含 SourceMap

**涉及文件**：
- [project.config.json](file:///c:/Users/17723/Desktop/bio/project.config.json#L20)（L20 — `"uploadWithSourceMap": true`）

**来源**：审计 C-W5

**问题描述**：`uploadWithSourceMap` 设为 `true`，上传代码包时将包含 SourceMap 文件，可能暴露源代码结构。

**影响**：攻击者可通过 SourceMap 还原源代码，获取业务逻辑和 API 路径。

**修复建议**：改为 `false`，仅在需要调试时临时开启。

---

### P1-7　全项目无下拉刷新、无分页，列表页一次性加载全部数据

**涉及文件**：
- 全项目（`grep onPullDownRefresh` / `onReachBottom` / `enablePullDownRefresh` 结果为 0）
- 涉及页面：[mistakes.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/mistakes/mistakes.js#L21)、[flashcards.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/flashcards/flashcards.js#L28)、[report.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/report/report.js)、[achievements.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/achievements/achievements.js)

**来源**：审计 B-C7

**问题描述**：全项目无任何页面实现下拉刷新或分页加载（`onPullDownRefresh`/`onReachBottom`/`enablePullDownRefresh` 均为 0 处）。列表页通过云函数 `limit(100)` 或 `limit(1000)` 一次性获取全部数据。

**影响**：数据量增大后首屏加载缓慢，内存占用高，无法手动刷新数据。

**修复建议**：为列表页（mistakes、flashcards、report、achievements）添加 `enablePullDownRefresh` 和分页加载（`onReachBottom` + `skip/limit` 递增）。

---

### P1-8　AI 流式输出体验问题：无取消机制 + 频繁 setData + wx:key 隐患

**涉及文件**：
- [ai.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/ai/ai.js#L361)（L361-L467 — `sendMessage` 无取消机制，`isStreaming` 期间无停止按钮）
- [ai.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/ai/ai.js#L409)（L409-L414 — `onText` 回调中每次 `delta` 都 `setData` + 全量 `parseMarkdown`）
- [ai.wxml](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/ai/ai.wxml#L71)（L71 — `wx:key="index"`）

**来源**：审计 B-W4 + B-W7 + B-W5

**问题描述**：
1. AI 流式输出期间无取消按钮，用户无法中止长回复。
2. `onText` 回调中每次收到 `delta` 都执行 `setData` + 全量 `parseMarkdown(fullText)`，长回复（数百字）可能触发数百次 `setData` 和解析，导致界面卡顿。
3. 消息列表使用 `wx:key="index"`，流式过程中频繁 `setData` 修改 `messages[index]` 可能导致渲染错乱。

**影响**：长回复时界面卡顿，无法取消，可能出现渲染异常。

**修复建议**：
1. 增加"停止生成"按钮，调用 `AbortController` 或设置标志位中止流式。
2. `onText` 中使用节流（throttle），每 100-200ms 才 `setData` 一次；或仅在 `onFinish` 时全量解析，流式过程中仅更新 `content` 不更新 `blocks`。
3. 消息列表 `wx:key` 改为唯一标识（如时间戳 + 随机数）。

---

### P1-9　settings 开关本地先生效、云端同步失败不回滚

**涉及文件**：
- [settings.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/settings/settings.js#L67)（L67-L91 — `onSwitch` 先本地 `setData` 再异步调云函数，失败仅 toast"已本地保存"）

**来源**：审计 B-W8

**问题描述**：`onSwitch` 中先本地 `setData` 使开关立即生效，再异步调用 `settings` 云函数同步。若云函数调用失败，仅 toast 提示"同步失败，已本地保存"，但不回滚开关状态。用户重启小程序后从云端读取到旧值，开关恢复为之前的状态。

**影响**：用户误以为设置已保存，重启后发现设置恢复原状，体验不一致。

**修复建议**：云函数同步失败时回滚本地 `setData`，并提示"同步失败，请重试"。

---

### P1-10　login emailLogin 无速率限制，可暴力破解

**涉及文件**：
- [login/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/login/index.js#L69)（L69-L95 — `emailLogin` 无任何速率限制/锁定机制）

**来源**：审计 A-W6

**问题描述**：`emailLogin` 不限制登录失败次数，不锁定账户，无验证码机制。攻击者可对邮箱登录接口进行暴力破解。

**影响**：弱密码账户可被暴力破解。

**修复建议**：在 `users` 集合中增加 `loginFailCount`/`lastFailAt` 字段，连续失败 5 次后锁定 15 分钟；或引入云开发限流配置。

---

### P1-11　knowledge/map 页核心功能为空桩

**涉及文件**：
- [knowledge.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/knowledge/knowledge.js#L73)（L73-L87 — `toggleBookmark`/`addToCards`/`askAI` 仅 `wx.showToast` 无实际逻辑）
- [map.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/map/map.js#L73)（L73-L80 — `tapNode` 仅 toast 不导航；L83-L84 — `startCurrent` 仅 `switchTab` 不指定关卡）

**来源**：审计 B-W1 + B-W2

**问题描述**：知识考点页的"收藏""加入速记卡""问AI"三个按钮均为空桩函数，仅弹 toast 无实际逻辑。知识地图页点击节点仅 toast 展示掌握度，不跳转到对应课时；"开始当前关卡"仅 `switchTab` 到 study 页但不传递 `courseId`/`lessonId`。

**影响**：知识考点页和知识地图页为纯展示，核心交互功能不可用。

**修复建议**：`toggleBookmark` 调用云函数持久化收藏状态；`addToCards` 调用 `flashcards` 云函数创建用户卡；`askAI` 跳转 AI 页并预填问题。`tapNode` 跳转到对应 course/knowledge 页；`startCurrent` 传递 `courseId` 和 `lessonIndex`。

---

### P1-12　project.config.json projectname 仍为模板名称 + README 为 quickstart 模板

**涉及文件**：
- [project.config.json](file:///c:/Users/17723/Desktop/bio/project.config.json#L48)（L48 — `"projectname": "quickstart-wx-cloud"`）
- [README.md](file:///c:/Users/17723/Desktop/bio/README.md#L1)（L1-L13 — 仍为"云开发 quickstart"模板内容）

**来源**：审计 C-W7 + C-W3

**问题描述**：项目名称仍为 `quickstart-wx-cloud`，README 仍为云开发快速启动指引模板，未更新为项目实际信息。

**影响**：项目标识不规范，影响团队协作和后续维护。

**修复建议**：将 `projectname` 改为 `bio` 或 `bio-study`，重写 README 为项目说明文档。

---

## 四、P2 中优先级问题

### P2-1　flashcards listCards 全表获取后内存过滤

**涉及文件**：[flashcards/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/flashcards/index.js#L10)（L10 — `db.collection('flashcards').get()` 无 `where` 条件）

**来源**：审计 A-W1

**问题描述**：`listCards` 对 `flashcards` 集合执行无条件的全表 `.get()`，然后在内存中按 `scope === 'system' || c._openid === openid` 过滤。集合数据量增大后将返回大量无关数据到云函数内存。

**影响**：性能浪费，数据量增大后可能超时或内存溢出。

**修复建议**：改为 `db.collection('flashcards').where(_.or([{scope:'system'},{_openid:openid}])).get()`。

---

### P2-2　report 查询 limit(1000) 全量加载后内存 filter 统计

**涉及文件**：[report/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/report/index.js#L59)（L59-L62 — `limit(1000)` 全量获取 `study_progress`；L69-L97 — 内存 `filter` 统计刷题数/正确率/近7天分布/章节掌握度）

**来源**：审计 A-W7

**问题描述**：`report` 云函数一次性获取用户全部 `study_progress` 记录（最多 1000 条），然后在内存中通过 `filter` 计算刷题统计、近7天分布、章节掌握度。

**影响**：数据量增大后内存占用高、统计耗时长。

**修复建议**：使用数据库 `aggregate` 管道在数据库侧完成分组统计，减少数据传输量。

---

### P2-3　getCourseDetail 完全不调用 getWXContext()，无身份认证

**涉及文件**：[getCourseDetail/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/getCourseDetail/index.js#L9)（L9-L48 — 不调用 `cloud.getWXContext()`，仅返回公开课程数据）

**来源**：审计 A-W4

**问题描述**：`getCourseDetail` 不获取调用者身份，仅根据 `courseId` 返回课程信息、推荐视频和核心考点。虽然当前仅返回公开数据无安全风险，但缺乏身份认证意味着无法实现个性化内容（如标记已学课时）。

**影响**：当前无安全风险，但限制了后续功能扩展。

**修复建议**：增加 `getWXContext()` 获取 `OPENID`，可用于标记已学课时、个性化推荐等。优先级低于 P0。

---

### P2-4　多个云函数输入参数缺类型校验与长度限制

**涉及文件**：多个云函数（除 `flashcards` 有输入截断、`login` 有密码长度检查外，其余云函数对 `courseId`/`action`/`userID` 等参数未做类型校验和长度限制）

**来源**：审计 A-W5

**问题描述**：多数云函数直接使用 `event` 中的参数，未校验类型（如 `courseId` 应为字符串）、长度（如 `action` 不应过长）、格式（如 `email` 格式）。

**影响**：异常输入可能导致查询异常或不可预期的行为。

**修复建议**：在各云函数入口增加参数校验，拒绝非法类型和过长字符串。

---

### P2-5　mistakes/achievements/pet/report 回退查询 userID:'demo' 数据

**涉及文件**：
- [mistakes/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/mistakes/index.js#L52)（L52-L56）
- [achievements/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/achievements/index.js#L43)（L43-L48）
- [pet/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/pet/index.js#L89)（L89-L90）
- [report/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/report/index.js#L13)（L13-L33 — `demoReport` 函数）

**来源**：审计 A-W8

**问题描述**：多个云函数在用户无记录时回退查询 `userID:'demo'` 的数据，返回 demo 示例。虽然 demo 数据本身不含敏感信息，但若被攻击者传入 `userID:'demo'` 可读到 demo 数据（与 P0-2 叠加）。

**影响**：信息泄露风险低，但行为不符合预期。

**修复建议**：配合 P0-2 修复，移除 `userID` 参数信任后，demo 回退逻辑改为返回空列表 + `isDemo: true` 标志，前端展示空状态引导。

---

### P2-6　study goMap 硬编码兜底 courseId

**涉及文件**：[study.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/study/study.js#L78)（L76-L80 — `goMap` 中 `const courseId = first ? first._id : 'course_required_1'`）

**来源**：审计 B-W3

**问题描述**：`goMap` 在课程列表为空时硬编码 `courseId:'course_required_1'` 跳转知识地图，若该课程不存在则知识地图页报错。

**影响**：边缘情况下用户看到错误页面。

**修复建议**：课程列表为空时 toast 提示"暂无课程"并阻止跳转。

---

### P2-7　course 页视频元数据字段可能不存在

**涉及文件**：[course.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/course/course.js#L79)（L79-L90 — `playCurrent` 使用 `v.aid`/`v.url`，若 videos 集合中对应字段缺失则 B 站跳转失败）

**来源**：审计 B-W11

**问题描述**：`playCurrent` 使用 `v.aid`（B站视频 AV 号）和 `v.url`（B站视频链接）进行跳转，若 `videos` 集合中对应记录缺少这些字段，`navigateToMiniProgram` 将失败，复制链接兜底也会复制 `undefined`。

**影响**：视频元数据不完整时播放功能不可用。

**修复建议**：增加 `v.aid`/`v.url` 存在性检查，缺失时 toast 提示"暂无视频源"。

---

### P2-8　无分包加载配置，15 页面全在主包

**涉及文件**：[app.json](file:///c:/Users/17723/Desktop/bio/miniprogram/app.json#L2)（L2-L18 — 15 个页面全部在 `pages` 数组中，无 `subPackages` 配置）

**来源**：审计 C-W2

**问题描述**：15 个页面全部在主包中，无分包配置。当前主包约 332KB（占 2MB 上限的 16%），无即时风险，但随功能增加主包将逐渐膨胀。

**影响**：当前无风险，但影响后续扩展。

**修复建议**：规划分包——主包保留 `home`/`study`/`ai`/`mine`；分包1「学习工具」包含 `course`/`knowledge`/`quiz`/`flashcards`/`mistakes`/`map`；分包2「个人中心」包含 `report`/`achievements`/`settings`/`pet`/`login`。

---

### P2-9　残留 console.log + 空目录 + 空组件

**涉及文件**：
- [ai.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/ai/ai.js#L301)（L301-L302 — `console.log('prefetch done:', ...)` 调试日志未清理）
- `miniprogram/components/cloudTipModal/`（空目录）
- `miniprogram/pages/example/`（空目录未注册）
- `miniprogram/pages/index/`（空目录未注册）

**来源**：审计 C-W8 + B-W9 + B-W10 + C-I2（合并）

**问题描述**：AI 页面残留调试用 `console.log`；`cloudTipModal` 组件目录为空；`example` 和 `index` 页面目录为空且未在 `app.json` 注册。

**影响**：代码卫生问题，无功能影响。

**修复建议**：删除残留 `console.log`（保留 `console.error`）；删除空目录或补充实现。

---

### P2-10　云函数无 package-lock.json

**涉及文件**：全部 11 个云函数目录（均无 `package-lock.json`）

**来源**：审计 A-I6

**问题描述**：云函数目录仅含 `package.json`，无 `package-lock.json`，依赖版本未锁定。

**影响**：不同环境安装依赖时版本可能不一致。

**修复建议**：在各云函数目录执行 `npm install` 生成 `package-lock.json` 并提交。

---

### P2-11　home onSearchConfirm 仅 toast 无搜索逻辑

**涉及文件**：[home.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/home/home.js#L92)（L92-L96 — `onSearchConfirm` 仅 `wx.showToast`）

**来源**：审计 B-W6

**问题描述**：首页搜索框确认后仅 toast 提示"搜索: xxx"，无实际搜索逻辑。

**影响**：搜索功能不可用。

**修复建议**：实现搜索逻辑（跳转到搜索结果页或调用云函数查询课程/知识点）。

---

### P2-12　云环境 ID 硬编码前端

**涉及文件**：[app.js](file:///c:/Users/17723/Desktop/bio/miniprogram/app.js#L8)（L8 — `env: "bio-d9gzmnqrif819033f"`）

**来源**：审计 C-C3

**问题描述**：云环境 ID 硬编码在前端 `app.js` 中。属云开发常规做法，但环境 ID 泄露后若数据库安全规则未配置（见 P0-3），攻击者可直接操作数据库。

**影响**：单独不构成风险，但与 P0-3 叠加后风险显著。

**修复建议**：配合 P0-3 数据库安全规则配置后，环境 ID 泄露不构成安全风险。可考虑通过云函数动态返回环境配置。

---

## 五、P3 低优先级问题

### P3-1　login toSafe 返回过多字段 + 允许空 openid 写入

**涉及文件**：
- [login/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/login/index.js#L16)（L16-L20 — `toSafe` 仅删 `passwordHash`，仍返回 `_openid`/`_id`/`username`）
- [login/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/login/index.js#L123)（L123 — `_openid: OPENID || ''` 允许空值写入）

**来源**：审计 A-I1 + A-I2

**修复建议**：`toSafe` 仅返回业务字段（`nickname`/`avatar`/`grade`/`streakDays`/`totalStudyMinutes`）；`emailRegister` 中 `OPENID` 为空时拒绝注册。

---

### P3-2　login 使用 bcrypt 同步操作

**涉及文件**：[login/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/login/index.js#L88)（L88 `compareSync`、L120 `hashSync`）

**来源**：审计 A-I3

**问题描述**：`compareSync`/`hashSync` 为同步阻塞操作，在云函数单线程环境中会阻塞事件循环。

**修复建议**：改为异步 `compare`/`hash`（bcryptjs 支持 Promise API）。优先级低，当前性能影响可接受。

---

### P3-3　home getContinueLearning 全量获取 study_progress 无 limit

**涉及文件**：[home/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/home/index.js#L73)（L73-L75 — `db.collection('study_progress').where(queryCondition).get()` 无 `limit`）

**来源**：审计 A-I4

**问题描述**：`getContinueLearning` 获取用户全部 `study_progress` 记录用于统计总数，无 `limit` 限制。`userID` 来自服务端认证用户，无安全问题。

**修复建议**：使用 `db.collection('study_progress').where(condition).count()` 替代全量获取后取 `length`。

---

### P3-4　全项目无 onShareAppMessage / 分享功能

**来源**：审计 B-I1

**修复建议**：为核心页面（home、course、ai、quiz）添加 `onShareAppMessage` 和 `onShareTimeline`。

---

### P3-5　app.js globalData 不完整

**涉及文件**：[app.js](file:///c:/Users/17723/Desktop/bio/miniprogram/app.js#L4)（L4 — `globalData` 仅含 `env`）

**来源**：审计 B-I2

**修复建议**：配合 P0-7 修复，增加 `userInfo`/`isLoggedIn` 字段。

---

### P3-6　markdown.js 不支持链接/图片/表格

**涉及文件**：[markdown.js](file:///c:/Users/17723/Desktop/bio/miniprogram/utils/markdown.js)（全文 — 支持 标题/加粗/行内代码/代码块/列表/引用，不支持 链接/图片/表格）

**来源**：审计 B-I3

**问题描述**：AI 回复中的 Markdown 链接、图片、表格无法渲染。但结构化节点输出（非 innerHTML）的设计正确，天然免疫 XSS。

**修复建议**：按需扩展 `parseInline` 支持 `[text](url)` 链接和 `![alt](url)` 图片语法。

---

### P3-7　仅 home 有骨架屏，其他页面加载仅"加载中..."文本

**来源**：审计 B-I4

**修复建议**：为 study、mistakes、flashcards、report 等列表页添加骨架屏组件。

---

### P3-8　home 功能宫格"错题本"使用 ic-close（X关闭）图标

**涉及文件**：[home.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/home/home.js#L19)（L19 — `{ icon: 'ic-close', name: '错题本' }`）

**来源**：审计 B-I5

**问题描述**：错题本入口使用 `ic-close`（X 关闭）图标，语义不当。

**修复建议**：更换为 `ic-book` 或 `ic-wrong` 等语义匹配的图标。

---

### P3-9　pet 初始数据硬编码，云函数失败显示假数据无错误提示

**涉及文件**：[pet.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/pet/pet.js#L7)（L7-L18 — 硬编码初始 `pet` 数据）

**来源**：审计 B-I6

**问题描述**：pet 页 `data` 中硬编码初始宠物数据，云函数调用失败时显示这些假数据，但无错误提示。

**修复建议**：云函数失败时 toast 提示"加载失败"并显示空状态或重试按钮。

---

### P3-10　cat-lying 5 张 PNG 共 131KB，可转 WebP

**涉及文件**：
- [cat-lying-5.png](file:///c:/Users/17723/Desktop/bio/miniprogram/images/cat-lying-5.png)（28.4KB）
- [cat-lying-2.png](file:///c:/Users/17723/Desktop/bio/miniprogram/images/cat-lying-2.png)（27.7KB）
- [cat-lying-4.png](file:///c:/Users/17723/Desktop/bio/miniprogram/images/cat-lying-4.png)（26KB）
- [cat-lying-1.png](file:///c:/Users/17723/Desktop/bio/miniprogram/images/cat-lying-1.png) / [cat-lying-3.png](file:///c:/Users/17723/Desktop/bio/miniprogram/images/cat-lying-3.png)

**来源**：审计 C-I4

**问题描述**：5 张猫咪图片共约 131KB，占主包约 39%。

**修复建议**：转为 WebP 格式可减少 40-60% 体积；或改为 CDN 远程图片。

---

### P3-11　project.config.json scopeDataCheck:false

**涉及文件**：[project.config.json](file:///c:/Users/17723/Desktop/bio/project.config.json#L16)（L16 — `"scopeDataCheck": false`）

**来源**：审计 C-I1

**修复建议**：开启 `scopeDataCheck` 以在开发阶段检测未授权的 scope 使用。

---

### P3-12　云函数超时统一 10 秒，home 聚合查询数据量增大可能超时

**涉及文件**：各云函数 `config.json`（`"timeout": 10`）

**来源**：审计 C-I3

**修复建议**：对 `home`、`getCourseList` 等聚合查询较多的云函数，超时调整为 15-20 秒；同时优化查询效率（见 P1-4）。

---

### P3-13　project.private.config.json urlCheck:false（仅本地开发覆盖）

**涉及文件**：[project.private.config.json](file:///c:/Users/17723/Desktop/bio/project.private.config.json#L4)（L4 — `"urlCheck": false`）

**来源**：审计 C-I5

**问题描述**：本地开发配置关闭了 URL 合法性校验。`project.private.config.json` 仅本地生效，不影响线上。

**修复建议**：确认正式发布前 `project.config.json` 中 `urlCheck` 为 `true`（当前已为 `true`，无风险）。

---

### P3-14　getCourseList textbook 使用 RegExp（硬编码无注入风险）

**涉及文件**：[getCourseList/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/getCourseList/index.js#L18)（L18 — `db.RegExp({ regexp: '^选择性必修', options: 'i' })`）

**来源**：审计 A-I5

**问题描述**：`textbook` 参数为硬编码的 `"选择性必修"` 时使用 RegExp 匹配，非用户输入，无注入风险。

**影响**：无安全风险，仅代码风格问题。

**修复建议**：无需修改。

---

## 六、数据库集合清单与建议权限模型

| 集合名 | 用途 | 当前访问方式 | 建议权限模型 | 风险等级 |
|---|---|---|---|---|
| `users` | 账户信息（含 `passwordHash`/`email`） | 云函数 login/home/report/settings | 仅创建者读写；`passwordHash` 字段 `"read": false` | **高** |
| `courses` | 课程信息 | 云函数 + 前端直读（ai.js） | 所有用户可读，仅管理员可写 | 中 |
| `lessons` | 课时信息 | 云函数 + 前端直读（ai.js） | 所有用户可读，仅管理员可写 | 中 |
| `quiz_questions` | 题目（含 `answer`/`explanation`） | 前端直读（ai.js） | **仅云函数可读**（`"read": false`） | **高** |
| `study_progress` | 学习进度 | 云函数 | 仅创建者读写 | 中 |
| `achievements` | 成就定义 | 云函数 | 所有用户可读，仅管理员可写 | 低 |
| `user_achievements` | 用户成就 | 云函数 | 仅创建者读写 | 中 |
| `mistakes` | 错题记录 | 云函数 | 仅创建者读写 | 中 |
| `pet` | 猫咪状态 | 云函数 | 仅创建者读写 | 中 |
| `pet_diary` | 互动日记 | 云函数 | 仅创建者读写 | 中 |
| `videos` | 推荐视频 | 云函数 | 所有用户可读 | 低 |
| `knowledge_points` | 核心考点 | 云函数 | 所有用户可读 | 低 |
| `flashcards` | 速记卡（system + user） | 云函数 | system 卡所有用户可读，user 卡仅创建者读写 | 中 |
| `ai_chat_sessions` | AI 对话记录 | 前端直读写（ai.js） | 仅创建者读写（修复后改为云函数访问） | **高** |

> **关键风险**：`quiz_questions` 和 `ai_chat_sessions` 当前可被前端直接访问，是最高优先级修复目标。`users.passwordHash` 若默认权限为"所有用户可读"则可被任意读取。

---

## 七、性能与代码包分析

### 7.1 代码包大小

| 项目 | 大小 | 说明 |
|---|---|---|
| miniprogram 总大小 | 332 KB | 主包上限 2 MB，占 16%，风险低 |
| images/ | 130.99 KB | 占 39.5%，主要为 cat-lying 系列 PNG |
| pages/ai/ | 31.97 KB | AI 页面最大 |
| 根级文件 | 22.55 KB | app.js/app.json/app.wxss 等 |
| pages/home/ | 13.82 KB | |
| pages/pet/ | 12.87 KB | |

### 7.2 大文件清单

| 文件 | 大小 | 说明 |
|---|---|---|
| [cat-lying-5.png](file:///c:/Users/17723/Desktop/bio/miniprogram/images/cat-lying-5.png) | 28.4 KB | 可转 WebP |
| [cat-lying-2.png](file:///c:/Users/17723/Desktop/bio/miniprogram/images/cat-lying-2.png) | 27.7 KB | 可转 WebP |
| [cat-lying-4.png](file:///c:/Users/17723/Desktop/bio/miniprogram/images/cat-lying-4.png) | 26.0 KB | 可转 WebP |
| [ai.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/ai/ai.js) | ~17 KB | 476 行，含 RAG 逻辑 |

### 7.3 N+1 查询

| 云函数 | 位置 | 问题 |
|---|---|---|
| [getCourseList](file:///c:/Users/17723/Desktop/bio/cloudfunctions/getCourseList/index.js#L42) | L42-L58 | 循环内逐课程查 `lessons` + `study_progress` |
| [home](file:///c:/Users/17723/Desktop/bio/cloudfunctions/home/index.js#L45) | L45-L75 | `getContinueLearning` 内串行查 4 个集合（非严格 N+1，但可优化为并行） |

### 7.4 全量加载问题

| 云函数 | 位置 | 问题 |
|---|---|---|
| [flashcards](file:///c:/Users/17723/Desktop/bio/cloudfunctions/flashcards/index.js#L10) | L10 | 无 `where` 全表 `.get()` |
| [report](file:///c:/Users/17723/Desktop/bio/cloudfunctions/report/index.js#L59) | L59-L62 | `limit(1000)` 全量加载后内存 `filter` |
| [home](file:///c:/Users/17723/Desktop/bio/cloudfunctions/home/index.js#L73) | L73-L75 | `study_progress` 全量 `.get()` 无 `limit` |

### 7.5 分包建议

| 分包 | 包含页面 | 说明 |
|---|---|---|
| 主包 | home, study, ai, mine | 4 个 tab 页 |
| 分包1「学习工具」 | course, knowledge, quiz, flashcards, mistakes, map | 学习相关功能 |
| 分包2「个人中心」 | report, achievements, settings, pet, login | 个人数据与设置 |

### 7.6 已启用的优化项

| 优化项 | 状态 | 位置 |
|---|---|---|
| `lazyCodeLoading: "requiredComponents"` | 已启用 | [app.json](file:///c:/Users/17723/Desktop/bio/miniprogram/app.json#L54) L54 |
| `minified: true` | 已启用 | [project.config.json](file:///c:/Users/17723/Desktop/bio/project.config.json#L10) L10 |
| `minifyWXSS: true` | 已启用 | [project.config.json](file:///c:/Users/17723/Desktop/bio/project.config.json#L37) L37 |
| `minifyWXML: true` | 已启用 | [project.config.json](file:///c:/Users/17723/Desktop/bio/project.config.json#L39) L39 |
| `es6: true` | 已启用 | [project.config.json](file:///c:/Users/17723/Desktop/bio/project.config.json#L6) L6 |

---

## 八、各模块审查小结

### 8.1 Login 模块

**云函数**：`wxLogin` 使用 `OPENID` 隔离正确，密码 `bcrypt` 哈希（salt=10），注册有密码长度校验。但 `emailLogin` 不校验 `OPENID`（P0-4），无速率限制（P1-10），`toSafe` 返回过多字段（P3-1），`emailRegister` 允许空 `OPENID` 写入（P3-1）。

**前端**：login 页有"跳过"按钮可绕过登录（P0-7），邮箱格式校验和密码长度校验完善，loading 标志防重复提交。

### 8.2 Course & Study 模块

**云函数**：`getCourseList` 的 `OPENID` 隔离正确（不接受客户端 `userID`），但存在 N+1 查询（P1-4）。`getCourseDetail` 无身份认证（P2-3），仅返回公开数据。

**前端**：study→course 参数传递正确，course 页有 B 站跳转+复制链接兜底。但"继续学习"功能断裂（P0-6），`goMap` 硬编码兜底 courseId（P2-6），course 页视频元数据可能缺失（P2-7）。知识考点页和知识地图页核心功能为空桩（P1-11）。

### 8.3 AI 模块

**安全**：前端直连数据库暴露答案（P0-1），是最高优先级修复项。

**体验**：流式输出无取消机制、频繁 setData、wx:key 隐患（P1-8）。`markdown.js` 解析器结构化节点输出设计正确，免疫 XSS，但不支持链接/图片/表格（P3-6）。错误提示分级（403/429 差异化）设计良好。会话管理（多会话、标题自动总结、清空）功能完整。

### 8.4 Quiz & Flashcards 模块

**Quiz**：完全硬编码 Mock 数据，刷题功能不可用（P0-5）。

**Flashcards**：云函数 `OPENID` 隔离正确，`addCard` 有输入截断，`removeCard` 有所有权校验。但 `listCards` 全表获取后内存过滤（P2-1），章节筛选仅客户端过滤，所有卡片一次性加载（无分页）。前端 `submitting` 标志防重复提交，删除操作有二次确认。

### 8.5 Achievements & Report & Mistakes 模块

**云函数**：三者均信任客户端 `userID`（P0-2），均有 `userID:'demo'` 回退查询（P2-5）。`report` 全量加载 `limit(1000)` 后内存统计（P2-2）。

**前端**：mistakes 页有 loading/empty 三态，解析展开/收起交互完善，删除有二次确认。但全项目无下拉刷新无分页（P1-7）。

### 8.6 Mine & Settings 模块

**Mine**：统计与成就为硬编码常量（P1-1），`goMenu` 不拦截未登录（P0-7），`refreshUser` 不调云函数获取真实数据。退出登录功能正常。

**Settings**：`onSwitch` 本地先生效云端同步失败不回滚（P1-9），`clearCache` 备份 userInfo 再清空再恢复设计正确。云函数 `update` 白名单仅允许 4 个布尔字段（安全设计正确），但 `findUser` 信任客户端 `userID`（P0-2）。

### 8.7 Pet 模块

**云函数**：信任客户端 `userID`（P0-2），`feed`/`pat` 可修改他人宠物。首次访问自动建档设计合理，经验值/升级逻辑完善，成长日记功能完整。

**前端**：初始数据硬编码，云函数失败显示假数据无错误提示（P3-9）。`interacting` 标志防重复提交，猫咪图片随机选择增加趣味性。

### 8.8 云函数总体

**安全**：11 个云函数均使用 `cloud.DYNAMIC_CURRENT_ENV`（未硬编码环境 ID），`openapi:[]` 最小权限，依赖精简（除 `login` 需 `bcryptjs` 外仅 `wx-server-sdk`），`main` 均有 `try/catch`，catch 块返回通用错误消息。但 6 个云函数信任客户端 `userID`（P0-2），运行时 `Nodejs16.13` EOL（P1-3），无 `package-lock.json`（P2-10）。

---

## 九、确认通过的检查项

以下实践经审计确认实现正确，无需修改：

### 安全实践
1. 密码 `bcrypt` 哈希存储（salt=10），未明文存储 — [login/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/login/index.js#L120) L120
2. `emailRegister` 密码最少 6 位校验 — [login/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/login/index.js#L106) L106-L108
3. `toSafe` 删除 `passwordHash` 字段 — [login/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/login/index.js#L16) L16-L20
4. `wxLogin` 使用 `OPENID` 隔离，不接受客户端 `userID` — [login/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/login/index.js#L33) L33-L35, L51
5. `home` 云函数 `userID` 来自服务端认证用户，非客户端传入 — [home/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/home/index.js#L126) L126
6. `getCourseList` 使用 `OPENID` 隔离，不接受客户端 `userID` — [getCourseList/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/getCourseList/index.js#L35) L35, L55
7. `flashcards` 云函数 `OPENID` 隔离正确：`list` 过滤正确，`add` 绑定 `openid`，`remove` 仅 `openid` 校验所有权 — [flashcards/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/flashcards/index.js#L12) L12, L37, L60
8. `flashcards` `addCard` 输入截断（title 30 字、content 500 字） — [flashcards/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/flashcards/index.js#L40) L40-L41
9. `flashcards` `removeCard` 删除前检查 `_openid` 归属，系统卡不可删 — [flashcards/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/flashcards/index.js#L60) L60
10. `settings` `update` 白名单仅允许 4 个布尔字段 — [settings/index.js](file:///c:/Users/17723/Desktop/bio/cloudfunctions/settings/index.js#L47) L47-L50
11. 全部 11 个云函数 `config.json` `openapi:[]` 最小权限
12. 全部 11 个云函数 `main` 有 `try/catch`，catch 块返回通用错误消息，详细错误仅 `console.error`
13. `userCondition` 在 `openid` 和 `userID` 均空时返回 `null` 避免空匹配全表（设计正确，问题在于 `userID` 不应被信任）
14. 云函数均使用 `cloud.DYNAMIC_CURRENT_ENV` 未硬编码环境 ID
15. `markdown.js` 结构化节点输出非 innerHTML，天然免疫 XSS — [markdown.js](file:///c:/Users/17723/Desktop/bio/miniprogram/utils/markdown.js)
16. `parseMarkdown` 对未闭合代码块容错 — [markdown.js](file:///c:/Users/17723/Desktop/bio/miniprogram/utils/markdown.js#L97) L97-L100

### 前端体验实践
17. `app.json` tabBar 4 项与 custom-tab-bar 一致，4 个 tab 页 `onShow` 正确 `getTabBar().setData({selected:N})`
18. 所有页面 `navigationStyle:"custom"` 统一 `statusBarHeight` 占位 + 自定义 navbar
19. 大部分页面云函数调用 `success`/`fail` 双回调，`fail` 时 `console.error` + `wx.showToast`
20. `course`/`knowledge` 有完整 loading/empty/error 三态；`mistakes`/`flashcards` 有 loading + empty
21. `mistakes`/`flashcards`/`pet` 删除操作 `wx.showModal` 二次确认
22. `login` loading 标志 / `flashcards` submitting / `pet` interacting 防重复提交
23. 列表 `wx:key` 多数用 `_id`（仅 AI 消息列表用 `index` 有隐患）
24. `course` `playCurrent` 有 `navigateToMiniProgram` 失败复制链接兜底 — [course.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/course/course.js#L82) L82-L89
25. `app.wxss` 完整 CSS 变量体系 + 通用组件类，设计统一
26. AI 错误提示分级（403/429 差异化） — [ai.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/ai/ai.js#L453) L453-L457
27. `settings` `clearCache` 备份 `userInfo` 再清空再恢复 — [settings.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/settings/settings.js#L101) L101-L105
28. `lazyCodeLoading: "requiredComponents"` 已启用 — [app.json](file:///c:/Users/17723/Desktop/bio/miniprogram/app.json#L54) L54
29. `minified`/`minifyWXSS`/`minifyWXML` 均开启
30. `cat-lying` 图片均被引用（[home.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/home/home.js#L29) L29-L33, [pet.js](file:///c:/Users/17723/Desktop/bio/miniprogram/pages/pet/pet.js#L27) L27-L31），无死图
31. 无 `debugger` 语句，无 `TODO`/`FIXME`
32. 依赖精简（除 `login` 需 `bcryptjs` 外仅 `wx-server-sdk`）

---

## 十、上线前必做清单

| 序号 | 事项 | 优先级 | 涉及文件 |
|---|---|---|---|
| 1 | 新建 `aiChat` 云函数，迁移 AI 页面全部数据库直连操作；`quiz_questions` 答案仅在云函数侧注入 | P0 | ai.js L91-L352 |
| 2 | 移除 6 个云函数对客户端 `userID` 的信任，查询条件仅用 `OPENID` | P0 | knowledgeMap/mistakes/achievements/report/pet/settings index.js |
| 3 | 配置 14 个数据库集合的安全规则（`quiz_questions` 仅云函数可读、`users.passwordHash` 禁客户端读） | P0 | 云开发控制台 / database.json |
| 4 | `emailLogin` 增加 `OPENID` 校验与绑定；`toSafe` 删除 `_openid`；`emailRegister` 拒绝空 `OPENID` | P0 | login/index.js L69-L95, L16-L20, L123 |
| 5 | Quiz 页面接入云函数，实现真实题目加载、作答判定、错题收藏 | P0 | quiz.js L5-L87 |
| 6 | study 页 `onShow` 消费 `pendingCourseId`，实现"继续学习"定向跳转 | P0 | study.js L23-L28 |
| 7 | 实现全局登录拦截：`app.js` globalData 增加登录态，受保护页面 `onShow` 检查，移除 login"跳过"按钮 | P0 | app.js, mine.js, login.wxml L108 |
| 8 | Mine 页面调用 `report`/`achievements` 云函数获取真实统计与成就 | P1 | mine.js L15-L66 |
| 9 | 统一前端身份标识方案，移除 `userID` 传参（配合 #2） | P1 | mistakes.js/pet.js/settings.js/map.js/quiz.js |
| 10 | 升级全部云函数运行时至 Nodejs18+ | P1 | 11 个 config.json |
| 11 | 优化 `getCourseList` N+1 查询为批量查询 | P1 | getCourseList/index.js L42-L58 |
| 12 | 修改 `sitemap.json` 禁止索引敏感页面 | P1 | sitemap.json |
| 13 | 关闭 `uploadWithSourceMap` | P1 | project.config.json L20 |
| 14 | 列表页添加下拉刷新与分页加载 | P1 | mistakes/flashcards/report/achievements |
| 15 | AI 流式增加取消机制、节流 setData、修正 wx:key | P1 | ai.js L409-L414, ai.wxml L71 |
| 16 | `settings` `onSwitch` 云端同步失败时回滚本地状态 | P1 | settings.js L67-L91 |
| 17 | `emailLogin` 增加速率限制/账户锁定 | P1 | login/index.js L69-L95 |
| 18 | 实现 knowledge/map 页核心交互功能 | P1 | knowledge.js L73-L87, map.js L73-L84 |
| 19 | 修改 `projectname` 和重写 README | P1 | project.config.json L48, README.md |
| 20 | `flashcards` `listCards` 改为 `where` 条件查询 | P2 | flashcards/index.js L10 |
| 21 | `report` 改用 `aggregate` 统计 | P2 | report/index.js L59-L97 |
| 22 | 配置分包加载 | P2 | app.json |
| 23 | 清理残留 `console.log`、空目录、空组件 | P2 | ai.js L301, components/, pages/example/ |
| 24 | 各云函数生成 `package-lock.json` | P2 | 11 个云函数目录 |

---

## 附录：用户流程闭环验证

| 核心流程 | 步骤 | 状态 | 说明 |
|---|---|---|---|
| 登录 → 浏览课程 | login → home → study → course | ✅ 闭环 | study→course 参数传递正确 |
| 继续学习 | home continueStudy → study 消费 pendingCourseId | ❌ 断点 | study 页未读取 `pendingCourseId`（P0-6） |
| 观看视频 | course → navigateToMiniProgram(B站) | ✅ 闭环 | B站跳转 + 复制链接兜底 |
| 答题 | quiz → 加载题目 → 作答 → 下一题 | ❌ 断点 | Quiz 为硬编码 Mock，无云函数集成（P0-5） |
| 成绩提交 | quiz → 提交答题结果到云函数 | ❌ 断点 | Quiz 无成绩提交逻辑（P0-5） |
| 错题收藏 | quiz saveToMistakes → mistakes 云函数 | ⚠️ 部分 | 云函数调用正常，但 `questionId` 硬编码为 `quiz_demo_1`（P0-5） |
| 查看成绩 | report 云函数 → 前端展示 | ⚠️ 部分 | report 正常运行，但不含 Quiz 贡献（因 Quiz 无成绩提交） |
| AI 答疑 | ai → streamText → persistSession | ⚠️ 闭环(安全风险) | 功能闭环，但前端直连数据库暴露答案（P0-1） |
| 闪卡学习 | flashcards → 云函数 list/add/remove | ✅ 闭环 | OPENID 隔离正确，功能完整 |
| 宠物互动 | pet → 云函数 get/feed/pat | ⚠️ 闭环(安全风险) | 功能闭环，但 `userID` 信任缺陷可改他人宠物（P0-2） |
| 知识地图 | map → knowledgeMap 云函数 → tapNode/startCurrent | ❌ 断点 | 节点点击仅 toast，"开始关卡"不传参（P1-11） |
| 知识考点 | knowledge → toggleBookmark/addToCards/askAI | ❌ 断点 | 三个按钮均为空桩（P1-11） |

---

> **报告结束**  
> 本报告基于 2026-07-17 的代码状态生成，共发现 P0 阻塞项 7 项、P1 高优先级 12 项、P2 中优先级 12 项、P3 低优先级 14 项。  
> 综合就绪度评分 3.5/10，**当前不建议直接上线**，需完成全部 P0 阻塞项后方可进入灰度发布。
