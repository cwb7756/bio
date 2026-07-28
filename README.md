# Bio - 高中生物学习助手 🧬

<div align="center">

**AI 赋能的个性化生物学习系统 · 知识图谱 · 智能刷题 · 错题本 · AI 答疑 · 学习成就**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![WeChat Mini Program](https://img.shields.io/badge/WeChat-Mini%20Program-green)](https://developers.weixin.qq.com/miniprogram/dev/framework/)
[![CloudBase](https://img.shields.io/badge/Cloud-CloudBase-orange)](https://developers.weixin.qq.com/miniprogram/dev/wxopen/cloud-development/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D16.0.0-339933?logo=node.js)](https://nodejs.org/)
[![ESLint](https://img.shields.io/badge/ESLint-8.x-4B32C3)](https://eslint.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](.github/CONTRIBUTING.md)

</div>

---

基于微信云开发的高中生物学习小程序，涵盖课程学习、知识图谱、AI 答疑、刷题测验、错题本、闪卡复习、学习宠物与成就系统等功能模块，帮助高中生高效学习生物知识。

## ✨ 核心特性

### 🎓 系统化学习

| 功能 | 描述 |
| --- | --- |
| 📚 **课程学习** | 按课程/课时结构浏览高中生物教学内容，支持视频播放和学习进度追踪 |
| 🗺️ **知识图谱** | 以可视化图谱形式展示知识点间的关联，清晰把握知识脉络 |
| 📊 **知识地图** | 全局视角查看所有考点及其掌握程度，针对性强化薄弱环节 |

### 🤖 AI 驱动的智能学习

| 功能 | 描述 |
| --- | --- |
| 💬 **AI 答疑** | 基于腾讯混元/DeepSeek 模型的智能问答，支持流式输出与会话历史管理 |
| 🎯 **AI 课件生成** | 输入主题自动生成结构化课件大纲、多场景讲解内容、TTS 语音讲解 |
| 📝 **智能命题** | LLM 辅助生成符合教材大纲的学习卡片和练习题 |

### ✅ 强化训练系统

| 功能 | 描述 |
| --- | --- |
| 📝 **刷题测验** | 覆盖全册题库的单题练习与分类测验，支持单选/多选题型，即时判分解析 |
| 📒 **错题本** | 自动收录做错题目，支持按章节/知识点筛选、导出复习 |
| 🎴 **闪卡复习** | 科学间隔重复算法（SRS），翻转卡片记忆核心概念 |
| 📖 **学习笔记** | 自定义创建图文笔记，支持本地存储与分类管理 |

### 🎮 游戏化激励体系

| 功能 | 描述 |
| --- | --- |
| 🐱 **学习宠物** | 陪伴成长虚拟宠物，根据学习时长解锁不同形态与互动动作 |
| 🏆 **成就系统** | 达成学习里程碑获得勋章奖励，记录学习荣誉墙 |
| 📈 **学习报告** | 多维度数据分析（学习时长/正确率分布/知识点掌握度） |

### 👤 用户中心

| 功能 | 描述 |
| --- | --- |
| 🔐 **账号管理** | 微信扫码登录 + 邮箱密码备用，JWT 安全认证，支持密码重置 |
| ⚙️ **个性化设置** | 界面主题切换（彩色/手绘/复古）、通知控制、隐私管理 |
| 💌 **意见反馈** | 问题反馈入口，连接开发团队获取支持

## 功能模块

| 模块 | 说明 |
| --- | --- |
| 课程学习 | 按课程/课时结构浏览高中生物教学内容 |
| 知识图谱 | 以图谱形式可视化知识点之间的关联 |
| AI 答疑 | 基于云开发 AI 能力的智能问答，支持流式输出与会话历史 |
| 刷题测验 | 针对知识点进行选择题练习并即时判分 |
| 错题本 | 自动收录做错的题目，方便针对性复习 |
| 闪卡复习 | 以卡片翻转形式复习核心知识点 |
| 学习宠物 | 陪伴式虚拟宠物，随学习进度成长 |
| 成就系统 | 学习里程碑与成就解锁 |

## 技术栈

- **前端**：微信小程序（原生开发，自定义 TabBar）
- **后端**：微信云开发
  - 云函数（Node.js）：业务逻辑处理
  - 云数据库：数据存储与读写
  - 云开发 AI 能力：AI 答疑（hunyuan-v3 / deepseek 等模型）

## 🛠️ 技术栈

### 前端技术

- **框架**: 微信小程序（原生开发，WXML + WXSS + JS）
- **自定义组件**: TabBar、导航栏、知识图谱可视化
- **状态管理**: App 全局 `globalData`
- **缓存机制**: 本地 Storage + 缓存管理器 (`utils/cache.js`)
- **UI 设计**: 手绘风格主题，SVG 线性图标（Tabler Icons）

### 后端技术

- **运行时**: Node.js 18.15 (微信云开发 CloudBase)
- **架构模式**: 多云函数单体，action 路由分发
- **数据库**: 云开发 NoSQL (collections: users, courses, study_progress, etc.)
- **AI 模型**: 
  - 对话：hunyuan-v3, deepseek
  - 图像：HY-Image-3.0-Plus-4090-Tob-v1.0
  - TTS：腾讯云语音合成（多种音色可选）
- **认证**: JWT + OpenID 双重验证
- **工具链**: ESLint 8.x + 自定义安全规则插件

### 基础设施

- **云开发环境**: CloudBase (自动扩缩容 Serverless)
- **持续集成**: GitHub Actions (CI 工作流)
- **代码质量**: ESLint 静态检查，语法验证

### 第三方服务

| 服务 | 用途 | 提供商 |
| --- | --- | --- |
| 微信登录 | 用户身份认证 | 微信 |
| 云开发 | 后端服务托管 | 微信 CloudBase |
| AI 对话 | 智能问答 | 腾讯混元 / DeepSeek |
| 图像生成 | 课件插图 | 腾讯云 AI |
| TTS 语音 | 音频讲解 | 腾讯云语音合成 |
| 邮件服务 | 密码重置提醒 | 腾讯云 SMS |

## 📁 项目结构

```bio/
├── .github/
│   ├── ISSUE_TEMPLATE/          # GitHub Issue 模板
│   │   ├── bug_report.md
│   │   ├── feature_request.md
│   │   └── question.md
│   ├── workflows/
│   │   └── ci.yml                 # CI 工作流配置
│   └── PULL_REQUEST_TEMPLATE.md   # PR 模板
│
├── cloudfunctions/                # 云函数集合
│   ├── achievements/              # 成就系统：查询/获取勋章详情
│   ├── admin/                     # 后台管理：用户管理、认证中间件
│   ├── aiChat/                    # AI 对话：流式问答、会话历史
│   ├── aiCourseware/              # AI 课件：LLM 生成大纲、场景、配图、TTS
│   ├── flashcards/                # 闪卡卡片：CRUD、复习记录
│   ├── feedback/                  # 意见反馈：提交反馈
│   ├── getCourseDetail/           # 课程详情：API 封装
│   ├── getCourseList/             # 课程列表：教材切换/章节统计
│   ├── home/                      # 首页：热门推荐、继续学习
│   ├── knowledgeMap/              # 知识图谱：节点数据、边关系图
│   ├── login/                     # 用户登录：微信扫码 + 邮箱密码
│   ├── mistakes/                  # 错题本：增删改查
│   ├── notebook/                  # 学习笔记：保存/获取/删除笔记
│   ├── pet/                       # 学习宠物：状态查询/交互操作
│   ├── quiz/                      # 刷题测验：题目获取/答题处理/成绩分析
│   ├── report/                    # 学习报告：统计数据聚合
│   ├── search/                    # 搜索功能：关键词检索
│   ├── settings/                  # 设置：偏好修改
│   └── flashcards/                # 闪卡复习：卡片 CRU D
│
├── miniprogram/                   # 小程序前端
│   ├── assets/sounds/             # 音效资源（crisp/retro/soft 三套风格）
│   ├── custom-tab-bar/            # 自定义底部导航栏（4 Tab）
│   ├── images/                    # 图片与图标资源（宠物状态/教学插图）
│   ├── pages/                     # 页面组件
│   │   ├── home/                  # 首页
│   │   ├── study/                 # 学习中心（课程概览）
│   │   ├── course/                # 课程详情页
│   │   ├── ai/                    # AI 课堂（AI 课件与讲解）
│   │   ├── aiClassroom/           # AI 答疑（AI 对话界面）
│   │   ├── aiHub/                 # AI 功能入口页（已迁移为刷题页）
│   │   ├── mine/                  # 我的（个人中心）
│   │   ├── knowledge/             # 知识图谱详情页
│   │   ├── map/                   # 知识地图总览
│   │   ├── quiz/                  # 刷题测验入口
│   │   ├── quizEntry/             # 选择题考试界面
│   │   ├── quizSummary/           # 测验结果总结
│   │   ├── flashcards/            # 闪卡复习
│   │   ├── mistakes/              # 错题本
│   │   ├── notebook/              # 学习笔记
│   │   ├── report/                # 学习报告
│   │   ├── achievements/          # 成就系统
│   │   ├── pet/                   # 学习宠物养成
│   │   ├── login/                 # 登录页
│   │   ├── settings/              # 设置页
│   │   └── feedback/              # 意见反馈
│   ├── utils/                     # 工具函数
│   │   ├── cache.js               # 缓存管理器
│   │   ├── courseGenJob.js        # 课件生成任务调度器
│   │   ├── courseware.js          # LLM API 调用封装
│   │   ├── markdown.js            # Markdown 渲染器
│   │   ├── notebook.js            # 笔记处理工具
│   │   └── sound.js               # 音效播放器
│   ├── app.js                     # 小程序入口
│   ├── app.json                   # 全局配置（路由/窗口样式/TabBar）
│   ├── app.wxss                   # 全局样式
│   └── sitemap.json               # 搜索引擎索引配置
│
├── docs/                          # 文档归档（不纳入 Git）
│   ├── check.md                   # 上线前检查报告
│   ├── courselist.md              # 课程列表规范
│   ├── database-index-config.md   # 数据库索引配置指南
│   ├── overview.md                # 项目交付概览
│   └── performance-optimization.md # 性能优化方案
│
├── .eslintrc-plugins/             # ESLint 本地插件
│   ├── index.js                   # 插件入口
│   ├── package.json               # 依赖声明
│   └── rules/                     # 自定义规则实现
│
├── .gitignore                     # Git 忽略规则
├── .eslintrc.json                 # ESLint 主配置
├── .eslintignore                  # ESLint 忽略文件列表
├── AGENTS.md                      # Agent 指引文档
├── CHANGELOG.md                   # 版本变更日志
├── CONTRIBUTING.md                # 贡献指南
├── DEPLOYMENT.md                  # 部署指南
├── LICENSE                        # MIT 许可证
├── database.json                  # 数据库权限配置
├── package.json                   # 项目依赖（根目录）
├── package-lock.json              # 依赖锁定文件
├── project.config.json            # 微信项目配置
├── project.private.config.json    # 本地私有配置（忽略）
├── README.md                      # 项目说明（本文档）
└── logo.png                       # 项目 Logo
```

## 📄 开源协议

本项目采用 [MIT 许可证](LICENSE)。允许自由使用、修改、分发，包括商业项目。

## 🤝 贡献指南

欢迎提交 Issues 和 Pull Requests！以下是几种参与方式：

- 🐛 [报告 Bug](.github/ISSUE_TEMPLATE/bug_report.md)
- 💡 [提出新功能](.github/ISSUE_TEMPLATE/feature_request.md)
- ❓ [提出问题](.github/ISSUE_TEMPLATE/question.md)
- 📝 [阅读贡献指南](CONTRIBUTING.md)

## 🔐 安全策略

我们重视代码安全。如果发现安全问题，请直接通过以下方式联系：

- Email: cwb7756@example.com

我们会尽快响应并修复漏洞。**请勿公开披露未授权的安全问题。**

## 📊 项目统计

<div align="center">

![](https://repobeats.axiom.co/api/embed/8a3b3c4d5e6f7g8h9i0j.svg "Repobeats analytics image")

[🔄 Sync to Repobeats](https://github.com/cwb7756/bio/blob/main/.repobeatsrc)

</div>

## 🙏 致谢

感谢以下开源项目和技术提供强大支持：

- [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/) 
- [CloudBase](https://cloud.tencent.com/product/cloudbase)
- [Tabler Icons](https://tablericons.com/)
- [ESLint](https://eslint.org/)
- 所有 contributors 和社区支持者

---

<div align="center">

**Bio - 用 AI 编程 × 用 AI 学习** 🧬

Made with ❤️ for high school biology students

[Report Issues](https://github.com/cwb7756/bio/issues) • [View on GitHub](https://github.com/cwb7756/bio)

</div>

```
bio/
├── cloudfunctions/                # 云函数
│   ├── achievements/              # 成就系统
│   ├── flashcards/                # 闪卡复习
│   ├── getCourseDetail/           # 课程详情
│   ├── getCourseList/             # 课程列表
│   ├── home/                      # 首页数据
│   ├── knowledgeMap/              # 知识图谱
│   ├── login/                     # 登录
│   ├── mistakes/                  # 错题本
│   ├── pet/                       # 学习宠物
│   ├── quiz/                      # 刷题测验
│   ├── report/                    # 学习报告
│   └── settings/                  # 设置
├── miniprogram/                   # 小程序前端
│   ├── custom-tab-bar/            # 自定义底部导航栏
│   ├── images/                    # 图片与图标资源
│   ├── pages/                     # 页面
│   │   ├── home/                  # 首页
│   │   ├── study/                 # 学习中心
│   │   ├── course/                # 课程详情
│   │   ├── ai/                    # AI 答疑
│   │   ├── mine/                  # 我的
│   │   ├── knowledge/             # 知识图谱
│   │   ├── quiz/                  # 刷题测验
│   │   ├── quizSummary/           # 测验总结
│   │   ├── flashcards/            # 闪卡复习
│   │   ├── mistakes/              # 错题本
│   │   ├── report/                # 学习报告
│   │   ├── achievements/          # 成就系统
│   │   ├── pet/                   # 学习宠物
│   │   ├── map/                   # 知识地图
│   │   ├── login/                 # 登录
│   │   └── settings/              # 设置
│   ├── utils/                     # 工具函数
│   ├── app.js                     # 小程序入口
│   ├── app.json                   # 全局配置
│   ├── app.wxss                   # 全局样式
│   └── sitemap.json               # 搜索索引配置
├── docs/                          # 项目文档
├── project.config.json            # 项目配置
└── README.md                      # 项目说明
```

## 🚀 快速开始

### 前置要求

- [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)（最新版本）
- Node.js 16.x 或更高版本
- WeChat Mini-program Account（可选）

### 配置步骤

#### 1️⃣ 克隆项目

```bash
git clone https://github.com/cwb7756/bio.git
cd bio
```

#### 2️⃣ 安装依赖

每个云函数目录需独立安装依赖：

```bash
# 方式一：逐个安装
cd cloudfunctions/<function-name>
npm install

# 方式二：批量安装所有云函数
cd c:\Users\17723\Desktop\bio
for /d %i in (cloudfunctions\*) do (@cd "%i" & npm install & cd ..)

# PowerShell 版本
Get-ChildItem cloudfunctions -Directory | ForEach-Object { Set-Location $_.FullName; npm install; Set-Location .. }
```

#### 3️⃣ 配置云开发环境

在微信开发者工具中：

1. 打开项目，点击「云开发」按钮
2. 创建新环境或选择现有环境
3. 记录环境 ID（如 `bio-d9gzmnqrif819033f`）
4. 更新 `miniprogram/app.js` 第 8 行中的 `env` 字段

#### 4️⃣ 上传并部署云函数

在微信开发者工具中：

1. 右键点击任意云函数目录（如 `login`）
2. 选择「上传并部署：云端安装依赖」
3. 等待部署完成
4. 对所有云函数重复此操作（achievements, flashcards, getCourseList, ...）

或使用命令行：

```bash
# 使用 CloudBase CLI（需先安装）
npm install -g @wechat-miniprogram/devcli
wxdevcli cf deploy
```

#### 5️⃣ 运行调试

1. 在微信开发者工具中编译项目
2. 检查控制台无报错信息
3. 测试模拟器或真机预览

详细部署说明请查看 [DEPLOYMENT.md](DEPLOYMENT.md)
