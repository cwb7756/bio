# 课程视频播放与考点双向跳转设计

日期：2026-07-17
数据来源：courselist.md（B站高赞学习视频清单，人教版 2019 新高考 5 册）

## 1. 背景与目标

将 courselist.md 的 5 册推荐视频（30 个）与核心考点（30 条）落地到小程序：

- 新建**课程详情页**：视频播放框（加载封面、可全屏）+ 该册推荐视频列表 + 考点跳转按钮
- 改造**考点页**（knowledge）：按课程动态加载考点列表 + 课程跳转按钮
- 后端：新建 videos、knowledge_points 集合，新建 getCourseDetail 云函数

## 2. 现状诊断

- 云函数仅 getCourseList / home / login 三个有实现；getCourseDetail、getKnowledgeMap 等为空目录
- `courses.videoIds` 引用了不存在的 videos 集合（如 `vid_BV1tE411q7VE`）
- 前端无课程详情/播放页；study 页点击章节直接跳转写死 demo 的 knowledge 页
- knowledge 页内容为硬编码「细胞的结构」demo（含单主题细胞插画）

## 3. 数据层

### 3.1 videos 集合（新建，30 条）

courselist.md 全部推荐视频 + 补充视频（必修2 补充为 UP 主推荐非视频，不收录）。

| 字段 | 类型 | 说明 |
|---|---|---|
| _id | string | `vid_` + BV号，如 `vid_BV1J424YAEAL` |
| bvid | string | BV 号 |
| title | string | 视频标题 |
| up | string | UP 主 |
| playCount | string | 播放量（如 "228.4万"） |
| likeCount | string | 点赞（如 "2.1万"，无则空串） |
| url | string | B站链接 |
| highlight | string | 看点 |
| cover | string | 视频封面 URL |
| sort | number | 册内顺序 |

封面获取：导入时逐个请求 B站 API `https://api.bilibili.com/x/web-interface/view?bvid=<bvid>` 取 `data.pic`；失败则兜底用所属课程的 `courses.image`。

### 3.2 knowledge_points 集合（新建，30 条）

| 字段 | 类型 | 说明 |
|---|---|---|
| _id | string | 如 `kp_r1_1` |
| courseId | string | 关联 courses._id |
| chapter | string | 冗余字段，如 "必修一" |
| title | string | 考点主题（如 "细胞呼吸"） |
| desc | string | 子点（如 "有氧/无氧呼吸过程、影响因素、探究实验"） |
| icon | string | 复用全局图标类名（ic-dna / ic-bolt / ic-leaf / ic-microscope / ic-flask / ic-target 等） |
| sort | number | 册内顺序 |

条数分布：必修一 8、必修二 9、选必一 5、选必二 4、选必三 4。

### 3.3 courses 集合更新

5 册课程的 `videoIds` 更新为本册真实视频 _id 列表（含补充视频，按 courselist.md 顺序）。`course_review`（一轮复习）不在本次范围，保持不动。

## 4. 云函数 getCourseDetail（新建）

在现有空目录 `cloudfunctions/getCourseDetail/` 中实现。

- 入参：`{ courseId }`
- 返回：`{ code: 0, data: { course, videos, knowledgePoints } }`
  - course：courses 完整文档
  - videos：按 `courses.videoIds` 数组顺序从 videos 集合取出（保序）
  - knowledgePoints：按 courseId 查询 knowledge_points，sort 升序
- 错误：courseId 不存在返回 `{ code: 404, msg: '课程不存在' }`；异常返回 `{ code: -1, msg: '获取课程详情失败' }`
- 课程详情页与考点页共用此函数（数据量小，避免重复造函数）

## 5. 前端

### 5.1 新建 pages/course/course（课程详情页）

结构（遵循现有 UI 风格：bg-dots、page-pad、sec-title 等）：

1. **导航栏**：返回 + 课程标题
2. **视频播放框**（自定义，非原生 video 组件）：
   - 16:9 封面图（当前视频 cover，兜底 course.image）
   - 中央播放按钮、右下角全屏按钮
   - 新增 SVG 图标 `ic-play`、`ic-fullscreen`、`ic-external-link`，按细线规范（stroke-width 1.5、round、data URI）加入 app.wxss
3. **推荐视频列表**：标题 / UP主 / 播放量·点赞 / 看点；点击列表项切换"当前视频"（播放框封面同步切换），当前项高亮
4. **本册核心考点区**：考点 chips 横滑列表 + 「查看全部考点」按钮，点击跳 knowledge 页（可带 kpId 锚点）

交互：

- **点击播放**：`wx.navigateToMiniProgram` 跳 B站官方小程序（appId `wx7564fd5313d24844`，path 带 bvid，确切路径以真机验证为准）；`fail` 时降级 `wx.setClipboardData` 复制当前视频 url + toast「链接已复制，请前往B站观看」
- **点击全屏**：`wx.previewImage` 全屏查看当前封面（原生支持缩放）

### 5.2 改造 pages/knowledge（考点页）

- 删除写死 demo 数据与细胞插画（插画仅适配单主题，不适用通用考点列表）
- 顶部**课程横幅卡**：封面缩略图 + 课程名 + 「去看课程」按钮 → 跳 course 页
- 考点列表按 courseId 动态渲染（icon / title / desc）
- 支持 `kpId` 参数 scroll-into-view 锚点定位
- 底部操作栏保留（加入速记卡 / AI老师讲一讲，现状为 toast demo，不在本次范围）

### 5.3 修改 pages/study

`goChapter` 跳转目标由 knowledge 页改为 `/pages/course/course?courseId=xxx`。

### 5.4 app.json

注册 `pages/course/course`。

### 5.5 页面流转

`study（课程列表）→ course（播放+视频列表+考点按钮）⇄ knowledge（考点列表+课程按钮）`

## 6. 原型先行（工作流程要求）

重大 UI 变更先改 `prototype/index.html`：新增课程详情页原型 + 改造考点页原型，用户确认视觉效果后再动 miniprogram 前端代码。

## 7. 数据导入方式

通过 cloudbase MCP `writeNoSqlDatabaseContent` 直接写入 videos、knowledge_points，并更新 5 册 courses.videoIds；封面 URL 用 WebFetch 抓 B站 API（best-effort）。

## 8. 关键约束与决策记录

- **B站视频无法内嵌播放**：无直链；web-view 仅企业主体且域名需自有校验，bilibili.com 不可用；`wx.miniapp.openUrl` 仅多端应用 App 可用，小程序不可用。已核实官方文档（2026-07-17）。
- **选定方案**：自定义播放框展示封面；点击播放跳 B站官方小程序（appId wx7564fd5313d24844），失败兜底复制链接；全屏用 wx.previewImage。
- 原生 `<video>` 只传 poster 不传 src 会导致播放/全屏报错，弃用。

## 9. 错误处理

- 云函数：统一 try/catch，code/-1 + console.error
- 前端：加载失败 toast + 点击重试；跳转失败兜底复制链接；封面加载失败显示 coverColor 纯色底

## 10. 测试

- 开发者工具 + 真机：study→course→knowledge 双向跳转、kpId 锚点、视频切换高亮、播放跳 B站小程序/复制兜底、全屏查看封面
- 云函数：5 册 courseId 各调一次，校验 videos 顺序与 knowledgePoints 完整性、404 分支
