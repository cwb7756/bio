# Bio - 高中生物学习助手

基于微信云开发的高中生物学习小程序，涵盖课程学习、知识图谱、AI 答疑、刷题测验、错题本、闪卡复习、学习宠物与成就系统等功能模块，帮助高中生高效学习生物知识。

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

## 目录结构

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

## 开发环境配置

### 前置要求

- [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)（最新稳定版）
- Node.js（建议 16.x 及以上）

### 配置步骤

1. **克隆项目**

   ```bash
   git clone <repository-url>
   cd bio
   ```

2. **安装云函数依赖**

   在每个云函数目录下执行 `npm install`：

   ```bash
   cd cloudfunctions/<function-name>
   npm install
   ```

3. **导入项目**

   打开微信开发者工具，选择「导入项目」，项目目录指向本项目根目录。AppID 已在 `project.config.json` 中配置。

4. **开通云开发**

   在微信开发者工具中开通云开发环境，确保云函数与云数据库正常可用。

5. **部署云函数**

   右键 `cloudfunctions/` 下的各云函数目录，选择「上传并部署：云端安装依赖」。

6. **运行调试**

   在模拟器或真机中预览小程序，确认各功能模块正常运行。
