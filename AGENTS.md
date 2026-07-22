# AGENTS.md — 项目入口指引

## 项目类型

微信小程序 + 微信云开发（CloudBase）。面向高中生物学习的教育类小程序，包含刷题、错题本、知识地图、AI 答疑、学习报告、成就系统、宠物养成等功能模块。

- 小程序端框架：原生微信小程序（WXML + WXSS + JS），自定义 TabBar，自定义导航栏
- 云函数运行时：Node.js，使用 `wx-server-sdk` 访问云开发资源
- 数据库：云开发 NoSQL（集合如 `users`、`study_progress`、`mistakes`、`quiz_questions`、`pet`、`achievements` 等）

## 源码根目录

| 目录 | 说明 |
|---|---|
| `miniprogram/` | 小程序前端源码（页面、组件、工具函数、静态资源） |
| `cloudfunctions/` | 云函数源码，每个子目录为一个独立云函数 |

### 前端结构（miniprogram/）

- `app.js` / `app.json` / `app.wxss` — 小程序入口与全局配置
- `pages/` — 各功能页面（home、study、quiz、mistakes、report、achievements、ai、aiClassroom、pet 等）
- `custom-tab-bar/` — 自定义底部导航栏
- `utils/` — 工具函数（markdown 渲染、音效播放、课件处理）
- `images/` — 图标与宠物图片资源
- `assets/sounds/` — 音效资源（crisp / retro / soft 三套风格）

### 云函数结构（cloudfunctions/）

每个云函数目录包含 `index.js`（入口）、`package.json`、`config.json`。现有云函数：

`login`、`home`、`getCourseList`、`getCourseDetail`、`quiz`、`mistakes`、`flashcards`、`report`、`achievements`、`knowledgeMap`、`pet`、`aiChat`、`aiCourseware`、`settings`、`feedback`

## 禁止修改的文件

- **`project.config.json` 中的 `appid` 字段** — 此值为小程序唯一标识，修改将导致项目无法上传发布。其余字段（编译配置等）可按需调整。
- **`project.private.config.json`** — 包含个人本地配置，不应提交到版本控制（已在 `.gitignore` 中排除）。

## 安全约束

### 1. 不接受客户端传入的 userID

云函数中用户的身份标识必须且只能通过 `cloud.getWXContext()` 获取的 `OPENID` 来确定。**严禁**从 `event` 参数中读取或信任客户端传入的 `userID`、`openid` 等身份字段。

正确做法：
```js
const { OPENID } = cloud.getWXContext();
// 后续所有数据查询与写入均使用此 OPENID
```

错误做法（禁止）：
```js
const { userID } = event; // 禁止：客户端可伪造
```

> 历史数据兼容说明：`study_progress` 和 `mistakes` 集合中部分旧记录使用 `userID` 字段（值为用户文档 `_id`）。查询时需兼容 `_openid` 和 `userID` 两种条件（使用 `_.or()`），但**写入新数据时必须使用 `_openid`**。

### 2. OPENID 隔离必须保留

所有涉及用户数据的云函数操作（读取、写入、删除）都必须以 `_openid` 作为数据隔离条件：

- **查询**：`db.collection('xxx').where({ _openid: OPENID })`
- **写入**：文档中必须包含 `_openid: OPENID` 字段
- **删除**：必须先校验文档的 `_openid` 与当前用户一致后方可删除

### 3. 其他安全实践

- **参数校验**：每个云函数入口应包含 `validateParams` 校验（字符串 ≤ 10000 字符，数组 ≤ 100 元素）
- **脱敏返回**：用户数据返回前端时必须经过 `toSafe` 等函数过滤，仅返回必要字段，不返回 `passwordHash`、`_openid` 等敏感信息
- **速率限制**：登录函数包含失败锁定机制（5 次失败锁定 15 分钟）
- **前端登录门控**：所有需要用户身份的页面在 `onShow` 中必须调用 `app.checkLogin()` 校验登录态，未登录跳转登录页

## 验证方式

### 语法检查

云函数修改后，使用 Node.js 语法检查确保无语法错误：

```bash
node --check cloudfunctions/<函数名>/index.js
```

检查所有云函数：

```powershell
Get-ChildItem cloudfunctions -Directory | ForEach-Object { node --check "$_\index.js" }
```

### 前端验证

前端 WXML/WXSS/JS 修改通过微信开发者工具的编译预览验证，无法通过 `node --check` 检查。

## 编码约定

- 云函数 `index.js` 顶部注释说明函数用途与 action 列表
- 云函数入口统一使用 `exports.main = async (event, context) => {}` 签名
- 错误处理：`try/catch` 包裹主逻辑，`catch` 中 `console.error` 记录并返回用户友好提示
- 分页参数：`skip`（偏移量）+ `limit`（每页条数），`limit` 上限 100
- 时间戳：统一使用 `Date.now()` 毫秒时间戳，字段名 `createdAt` / `updatedAt`
