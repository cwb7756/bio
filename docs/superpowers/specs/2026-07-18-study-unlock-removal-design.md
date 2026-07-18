# 学习系统升级：移除解锁限制 + 学习页猫咪装饰 — 设计文档

日期：2026-07-18
状态：已确认

## 背景与目标

当前学习系统存在两级前置解锁限制，影响自由学习体验：

1. **章节级锁**：`getCourseList` 云函数按"前一章节 progress=100 才解锁后续章节"输出 `color='lock'`，`study.js` 点击拦截（toast「请先完成前置章节」），WXML 渲染锁徽章与灰色样式。
2. **地图节点锁**：`knowledgeMap` 云函数输出 `done / current / lock` 三态，`map.js` 点击 lock 节点拦截（toast「先完成前面的关卡吧」），WXML 渲染锁图标与「未解锁」文案。

课程详情页（course）本身无锁，任何课时均可自由切换视频，无需改动。

**目标**：

- 任意章节视频可直接观看，无需完成前置章节
- 知识地图仅按真实学习记录显示进度（看了哪些就点亮哪些），无 lock 状态、无 current 引导高亮
- 学习页最上方卡片（学习概览绿色渐变卡片）右上角叠放随机猫咪图，呈「趴在框上」效果

## 已确认决策

| 决策点 | 结论 |
| --- | --- |
| 地图未完成节点呈现 | 完全平铺无引导：done=打勾点亮；所有未学=todo（显示 0%），无 current 高亮，移除底部「开始当前关卡」操作栏 |
| 猫咪位置 | 学习概览卡片右上角，底部压住卡片上边框 |
| 猫咪随机时机 | 每次进入学习页（onShow）从 cat-lying-1~5.png 随机选一张 |

## 改动清单

### 1. getCourseList 云函数（`cloudfunctions/getCourseList/index.js`）

- 删除第 114-126 行锁逻辑块
- 章节 `color` 仅保留两态：`done`（progress===100）/ `green`（其他）

### 2. knowledgeMap 云函数（`cloudfunctions/knowledgeMap/index.js`）

- 节点组装：done（有 study_progress 记录）/ todo（无记录，mastery=0）
- 移除 `currentAssigned` 逻辑与 current/lock 状态
- 返回值移除 `currentLessonTitle`

### 3. 学习页前端

**study.js**：
- `goChapter` 删除 lock 拦截分支，直接跳转课程页
- data 新增 `catImage: ''`；onShow 中随机赋值 `/images/cat-lying-${1~5}.png`

**study.wxml**：
- 删除章节卡锁徽章节点（`ch-badge-lock`）
- `study-overview` 卡片内新增 `<image class="overview-cat" src="{{catImage}}" mode="aspectFit">`

**study.wxss**：
- 删除 `.ch-lock` 相关样式（图标灰底、进度条灰色）
- `.study-overview` 加 `position: relative; overflow: visible;`，`margin-top` 加大为猫咪留位
- 新增 `.overview-cat`：absolute 定位于卡片右上，底部压住卡片上边框，宽约 180rpx，`pointer-events: none` 避免遮挡点击

### 4. 知识地图页前端

**map.js**：
- `tapNode` 删除 lock 拦截，任何节点直接跳课程页
- 移除 `startCurrent` 方法与 `currentLessonTitle` 数据

**map.wxml**：
- 节点圆圈：done=打勾；todo=显示 `{{mastery}}%`
- 移除 `node-current-ring`、`node-tag「当前」`、「未解锁」文案分支
- 移除底部 `action-bar`

**map.wxss**：
- `.node-lock` 改为 `.node-todo` 中性样式（纸面底色 + 描边，非灰色锁定感）
- 删除 `.node-title-lock`、`.node-current-ring`、`.node-tag`、`.action-bar` 相关样式

## 数据与兼容性

- 不改动任何数据库集合结构与写入逻辑；`study_progress` 的 type='lesson' 记录仍是唯一进度数据源
- 云函数返回结构向后兼容：getCourseList 仅 `color` 取值范围收窄；knowledgeMap 移除 `currentLessonTitle` 字段（前端同步移除引用）
- study 页 `mapOverview` 的 `isDemo` 置零逻辑保留（云函数恒返回 `isDemo: false`，无副作用）

## 验证

1. 全部改动 JS 文件执行 `node --check` 语法检查
2. getCourseList、knowledgeMap 两云函数通过 cloudbase MCP 上传部署
3. 微信开发者工具人工走查：任意章节可直接进入；地图节点点击全部可跳；猫咪图随机出现且趴于卡片上框
