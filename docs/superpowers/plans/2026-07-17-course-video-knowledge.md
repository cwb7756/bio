# 课程视频播放与考点双向跳转实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 courselist.md 的 30 个 B 站视频与 30 条核心考点落地：新建 videos/knowledge_points 集合 + getCourseDetail 云函数 + 课程详情页（播放框/视频列表/考点跳转）+ 考点页改造（动态数据/课程跳转）。

**Architecture:** 单云函数 getCourseDetail 同时服务课程详情页与考点页；数据通过 cloudbase MCP 直接写入；播放采用自定义播放框（封面+跳 B 站小程序+复制链接兜底+previewImage 全屏）。

**Tech Stack:** 微信小程序原生、微信云开发（wx-server-sdk）、cloudbase MCP（数据写入/函数部署/调用验证）。

**Spec:** `docs/superpowers/specs/2026-07-17-course-video-knowledge-design.md`

**说明：** 项目无测试框架，验证方式为 MCP 调用云函数 + GetProblems 编译检查 + 开发者工具人工核对。不执行 git commit（用户未要求）。

---

### Task 1: 抓取 30 个视频的 B 站封面与补充信息

**Files:** 无（产出为内存中的 bvid→信息 映射表，供 Task 2 使用）

- [ ] **Step 1: 批量请求 B 站 API**

对以下 30 个 bvid 逐个请求 `https://api.bilibili.com/x/web-interface/view?bvid=<bvid>`（WebFetch；返回内容较大时会写入缓存文件，再用 Grep 正则 `"pic":"([^"]+)"` 提取封面 URL）：

```
BV1J424YAEAL BV1suiGBaEm8 BV1Ka411h7Nh BV1jk6mBhEsJ BV1Z34y1w73r BV1UM2ABqEDd
BV1HP4y1f72i BV1PA28YjEu9 BV1db411a7G4 BV1a7411P7fm BV1MM4y1Q7gX
BV1T5411G7Q8 BV1mF411v7JD BV1TS4y1E7Lq BV1Eh2bYMEbH BV1vF4NeYE8P BV1f8411L7oM
BV1g8411875h BV1Vq4y1A7un BV19R4y1S7r8 BV1bT2BY1Egk BV1GoUWBGEyv BV1UP411u7p1
BV1R24y1x7K7 BV1itUVBHExk BV1nu4m1T7b5 BV1dr4y1K7VM BV1H2421T7Wc BV1xY4y1D7cF BV1Xuo9YRERH
```

- [ ] **Step 2: 记录映射与兜底**

- 成功：`cover = data.pic`（http 可原样存储，小程序 image 组件支持；若担心 https 可替换协议头为 https）
- 失败兜底对应该课程 `courses.image`：
  - 必修一 → `https://i1.hdslb.com/bfs/archive/39a0cf151147489f326daddf6667d6dff106f74a.jpg`
  - 必修二 → `https://i1.hdslb.com/bfs/archive/81080cdeb5cc7f9e882b492fbaa6081ce1e1a338.jpg`
  - 选必一 → `https://i1.hdslb.com/bfs/archive/3ce20a3293af187002d385154c312a35815c8ac6.jpg`
  - 选必二 → `https://i0.hdslb.com/bfs/archive/0bb583920210b6a8a041b75d42cb46e1a2fa5bd6.jpg`
  - 选必三 → `https://i0.hdslb.com/bfs/archive/cd700289152f17d1341b811d45690ea8e9b9e43d.jpg`
- 3 个补充视频（BV1UM2ABqEDd / BV1f8411L7oM / BV1Xuo9YRERH）courselist 缺 UP主/播放/点赞，从 API 的 `owner.name`、`stat.view`、`stat.like` 补齐；数字格式化规则：`>=10000 → (n/10000).toFixed(1)+"万"`，`>=1000 → (n/1000).toFixed(1)+"千"`，否则原值。

---

### Task 2: 写入 videos 集合（30 条）

**Files:** 无（cloudbase MCP 数据操作）

- [ ] **Step 1: 调用 writeNoSqlDatabaseContent insert**

`collectionName: "videos"`，`documents` 为 30 个对象。字段：`_id, bvid, title, up, playCount, likeCount, url, highlight, cover, sort`。url 固定为 `https://www.bilibili.com/video/<bvid>`。cover 取 Task 1 结果。数据（sort 即册内顺序）：

**必修一（courseId 关联用，videos 表不存 courseId，靠 courses.videoIds 关联）**
```json
[
  {"_id":"vid_BV1J424YAEAL","bvid":"BV1J424YAEAL","title":"必修1新授课教学视频合集","up":"汉水丑生侯伟","playCount":"228.4万","likeCount":"2.1万","url":"https://www.bilibili.com/video/BV1J424YAEAL","highlight":"教材同步精讲，抠课本、重框架，打基础首选","cover":"<Task1>","sort":1},
  {"_id":"vid_BV1suiGBaEm8","bvid":"BV1suiGBaEm8","title":"高中生物必修一最全大合集【从基础到拔高】","up":"一生儿","playCount":"114.7万","likeCount":"","url":"https://www.bilibili.com/video/BV1suiGBaEm8","highlight":"全集系统课，适合跟课复习","cover":"<Task1>","sort":2},
  {"_id":"vid_BV1Ka411h7Nh","bvid":"BV1Ka411h7Nh","title":"必修1第五章第4节：光合作用（第1课时）","up":"汉水丑生侯伟","playCount":"25.1万","likeCount":"8.3千","url":"https://www.bilibili.com/video/BV1Ka411h7Nh","highlight":"光合专题细讲（第2课时 BV1XL411N7Zh）","cover":"<Task1>","sort":3},
  {"_id":"vid_BV1jk6mBhEsJ","bvid":"BV1jk6mBhEsJ","title":"期末冲刺！光合呼吸16个图全讲解","up":"李林生物","playCount":"14.2万","likeCount":"6.0千","url":"https://www.bilibili.com/video/BV1jk6mBhEsJ","highlight":"光合/呼吸高频图形题，一轮提速利器","cover":"<Task1>","sort":4},
  {"_id":"vid_BV1Z34y1w73r","bvid":"BV1Z34y1w73r","title":"高中生物必修一：细胞周期同步化","up":"见医知二","playCount":"9.9万","likeCount":"4.1千","url":"https://www.bilibili.com/video/BV1Z34y1w73r","highlight":"动画可视化，秒懂有丝分裂/细胞周期","cover":"<Task1>","sort":5},
  {"_id":"vid_BV1UM2ABqEDd","bvid":"BV1UM2ABqEDd","title":"4K实录全册同步课（分子与细胞全册讲解）","up":"<Task1补齐>","playCount":"<Task1补齐>","likeCount":"<Task1补齐>","url":"https://www.bilibili.com/video/BV1UM2ABqEDd","highlight":"补充：4K实录全册同步课","cover":"<Task1>","sort":6}
]
```

**必修二**
```json
[
  {"_id":"vid_BV1HP4y1f72i","bvid":"BV1HP4y1f72i","title":"从0开始学遗传合集（最强系列）","up":"汉水丑生侯伟","playCount":"285.2万","likeCount":"7.6万","url":"https://www.bilibili.com/video/BV1HP4y1f72i","highlight":"遗传专题天花板，分离/自由组合/伴性系统讲","cover":"<Task1>","sort":1},
  {"_id":"vid_BV1PA28YjEu9","bvid":"BV1PA28YjEu9","title":"必修2新授课教学视频合集","up":"汉水丑生侯伟","playCount":"279.3万","likeCount":"2.5万","url":"https://www.bilibili.com/video/BV1PA28YjEu9","highlight":"教材同步全册","cover":"<Task1>","sort":2},
  {"_id":"vid_BV1db411a7G4","bvid":"BV1db411a7G4","title":"高中生物必修二·遗传与进化","up":"_苏苏苏","playCount":"270.3万","likeCount":"6.9万","url":"https://www.bilibili.com/video/BV1db411a7G4","highlight":"系统网课，讲解细致","cover":"<Task1>","sort":3},
  {"_id":"vid_BV1a7411P7fm","bvid":"BV1a7411P7fm","title":"【必修2合集】【全书更完】高中生物必修二","up":"靳老师生物课堂","playCount":"71.4万","likeCount":"1.9万","url":"https://www.bilibili.com/video/BV1a7411P7fm","highlight":"全书更完，适合二轮","cover":"<Task1>","sort":4},
  {"_id":"vid_BV1MM4y1Q7gX","bvid":"BV1MM4y1Q7gX","title":"如何让遗传题越做越爽？必修二学习方法","up":"一生儿","playCount":"31.2万","likeCount":"1.5万","url":"https://www.bilibili.com/video/BV1MM4y1Q7gX","highlight":"遗传解题方法论，赞播比极高","cover":"<Task1>","sort":5}
]
```

**选必一**
```json
[
  {"_id":"vid_BV1T5411G7Q8","bvid":"BV1T5411G7Q8","title":"【2026更新】高中高二生物选择性必修1全册讲解（稳态与调节）","up":"高中生物莫西老师","playCount":"211.1万","likeCount":"5.2万","url":"https://www.bilibili.com/video/BV1T5411G7Q8","highlight":"全册系统课，更新至新版","cover":"<Task1>","sort":1},
  {"_id":"vid_BV1mF411v7JD","bvid":"BV1mF411v7JD","title":"高中生物【选必1】难点专攻！内环境/神经/神经体液/特异性免疫","up":"一生儿","playCount":"136.6万","likeCount":"5.4万","url":"https://www.bilibili.com/video/BV1mF411v7JD","highlight":"难点集中突破","cover":"<Task1>","sort":2},
  {"_id":"vid_BV1TS4y1E7Lq","bvid":"BV1TS4y1E7Lq","title":"高中生物选必1 激素与内分泌系统","up":"一生儿","playCount":"122.6万","likeCount":"3.1万","url":"https://www.bilibili.com/video/BV1TS4y1E7Lq","highlight":"体液调节细讲","cover":"<Task1>","sort":3},
  {"_id":"vid_BV1Eh2bYMEbH","bvid":"BV1Eh2bYMEbH","title":"选择性必修1新授课教学视频合集","up":"汉水丑生侯伟","playCount":"120.8万","likeCount":"9.2千","url":"https://www.bilibili.com/video/BV1Eh2bYMEbH","highlight":"教材同步精讲","cover":"<Task1>","sort":4},
  {"_id":"vid_BV1vF4NeYE8P","bvid":"BV1vF4NeYE8P","title":"一口气讲完高中生物选必一！（神经+体液+免疫+植物调节）","up":"李林生物","playCount":"24.2万","likeCount":"8.7千","url":"https://www.bilibili.com/video/BV1vF4NeYE8P","highlight":"全体系速通，考前救急","cover":"<Task1>","sort":5},
  {"_id":"vid_BV1f8411L7oM","bvid":"BV1f8411L7oM","title":"高中生物新教材选择性必修一","up":"金晶生物","playCount":"15.1万","likeCount":"<Task1补齐>","url":"https://www.bilibili.com/video/BV1f8411L7oM","highlight":"补充：系统讲解","cover":"<Task1>","sort":6}
]
```

**选必二**
```json
[
  {"_id":"vid_BV1g8411875h","bvid":"BV1g8411875h","title":"【高中生物选择性必修二】开更啦！种群来喽！0基础救星","up":"一生儿","playCount":"199.4万","likeCount":"2.9万","url":"https://www.bilibili.com/video/BV1g8411875h","highlight":"入门首选，种群模块","cover":"<Task1>","sort":1},
  {"_id":"vid_BV1Vq4y1A7un","bvid":"BV1Vq4y1A7un","title":"高中生物【选择性必修二】全书重难点梳理！种群/群落/生态系统","up":"一生儿","playCount":"127.2万","likeCount":"4.2万","url":"https://www.bilibili.com/video/BV1Vq4y1A7un","highlight":"全书框架速建","cover":"<Task1>","sort":2},
  {"_id":"vid_BV19R4y1S7r8","bvid":"BV19R4y1S7r8","title":"生态系统能量流动题型精讲【选必二】","up":"一生儿","playCount":"98.5万","likeCount":"3.0万","url":"https://www.bilibili.com/video/BV19R4y1S7r8","highlight":"能量流动计算高频题","cover":"<Task1>","sort":3},
  {"_id":"vid_BV1bT2BY1Egk","bvid":"BV1bT2BY1Egk","title":"选择性必修2新授课教学视频合集","up":"汉水丑生侯伟","playCount":"58.6万","likeCount":"4.8千","url":"https://www.bilibili.com/video/BV1bT2BY1Egk","highlight":"教材同步精讲","cover":"<Task1>","sort":4},
  {"_id":"vid_BV1GoUWBGEyv","bvid":"BV1GoUWBGEyv","title":"种群的数量特征和种群密度的调查方法","up":"一生儿","playCount":"13.7万","likeCount":"9.3千","url":"https://www.bilibili.com/video/BV1GoUWBGEyv","highlight":"种群密度调查实验","cover":"<Task1>","sort":5},
  {"_id":"vid_BV1UP411u7p1","bvid":"BV1UP411u7p1","title":"（新高考）高中生物选择性必修二一轮复习课程","up":"晶晶带你学生物","playCount":"5.8万","likeCount":"1.2千","url":"https://www.bilibili.com/video/BV1UP411u7p1","highlight":"一轮复习串讲","cover":"<Task1>","sort":6}
]
```

**选必三**
```json
[
  {"_id":"vid_BV1R24y1x7K7","bvid":"BV1R24y1x7K7","title":"从工具就开始埋下高考考点的【基因工程-1】0基础救星","up":"一生儿","playCount":"233.6万","likeCount":"5.7万","url":"https://www.bilibili.com/video/BV1R24y1x7K7","highlight":"基因工程入门必看","cover":"<Task1>","sort":1},
  {"_id":"vid_BV1itUVBHExk","bvid":"BV1itUVBHExk","title":"【基因工程】20min带你搭体系，大题答案直接抄！","up":"云鹏生物","playCount":"123.0万","likeCount":"7.1万","url":"https://www.bilibili.com/video/BV1itUVBHExk","highlight":"赞播比最高，大题模板","cover":"<Task1>","sort":2},
  {"_id":"vid_BV1nu4m1T7b5","bvid":"BV1nu4m1T7b5","title":"【选必三】基因工程 知识考点一网打尽！一轮复习","up":"一生儿","playCount":"108.5万","likeCount":"3.2万","url":"https://www.bilibili.com/video/BV1nu4m1T7b5","highlight":"基因工程系统复习","cover":"<Task1>","sort":3},
  {"_id":"vid_BV1dr4y1K7VM","bvid":"BV1dr4y1K7VM","title":"【选择性必修3合集】高中生物选择性必修3 生物技术与工程","up":"靳老师生物课堂","playCount":"108.4万","likeCount":"2.8万","url":"https://www.bilibili.com/video/BV1dr4y1K7VM","highlight":"全书更完，系统课","cover":"<Task1>","sort":4},
  {"_id":"vid_BV1H2421T7Wc","bvid":"BV1H2421T7Wc","title":"【选必三】传统发酵技术 微生物培养 发酵工程一网打尽","up":"一生儿","playCount":"69.0万","likeCount":"1.9万","url":"https://www.bilibili.com/video/BV1H2421T7Wc","highlight":"发酵工程专题","cover":"<Task1>","sort":5},
  {"_id":"vid_BV1xY4y1D7cF","bvid":"BV1xY4y1D7cF","title":"30分钟速记高中生物选必三100个重要考点","up":"生物岳老师","playCount":"68.7万","likeCount":"2.8万","url":"https://www.bilibili.com/video/BV1xY4y1D7cF","highlight":"考前速记清单","cover":"<Task1>","sort":6},
  {"_id":"vid_BV1Xuo9YRERH","bvid":"BV1Xuo9YRERH","title":"高考生物押题·基因探针为背景的两道题","up":"见医知二","playCount":"5.2万","likeCount":"<Task1补齐>","url":"https://www.bilibili.com/video/BV1Xuo9YRERH","highlight":"补充：选必三+必修二综合","cover":"<Task1>","sort":7}
]
```

- [ ] **Step 2: 验证**

`readNoSqlDatabaseContent` 查 videos 集合，预期 `total: 30`。

---

### Task 3: 写入 knowledge_points 集合（30 条）

**Files:** 无（cloudbase MCP 数据操作）

- [ ] **Step 1: 调用 writeNoSqlDatabaseContent insert**

`collectionName: "knowledge_points"`，30 个对象，字段：`_id, courseId, chapter, title, desc, icon, sort`：

```json
[
  {"_id":"kp_r1_1","courseId":"course_required_1","chapter":"必修一","title":"细胞学说与生命系统","desc":"细胞学说、生命系统层次、原核 vs 真核细胞、显微镜使用","icon":"ic-microscope","sort":1},
  {"_id":"kp_r1_2","courseId":"course_required_1","chapter":"必修一","title":"组成细胞的分子","desc":"元素与化合物、蛋白质结构与相关计算、核酸、糖类脂质、水与无机盐","icon":"ic-flask","sort":2},
  {"_id":"kp_r1_3","courseId":"course_required_1","chapter":"必修一","title":"细胞的基本结构","desc":"细胞膜（流动镶嵌模型）、细胞器分工合作、细胞核、生物膜系统","icon":"ic-target","sort":3},
  {"_id":"kp_r1_4","courseId":"course_required_1","chapter":"必修一","title":"物质进出细胞","desc":"渗透作用与质壁分离、被动运输、主动运输、胞吞胞吐","icon":"ic-refresh","sort":4},
  {"_id":"kp_r1_5","courseId":"course_required_1","chapter":"必修一","title":"酶与ATP","desc":"酶的本质与特性、影响酶活性的因素","icon":"ic-bolt","sort":5},
  {"_id":"kp_r1_6","courseId":"course_required_1","chapter":"必修一","title":"细胞呼吸","desc":"有氧/无氧呼吸过程、影响因素、探究实验","icon":"ic-fire","sort":6},
  {"_id":"kp_r1_7","courseId":"course_required_1","chapter":"必修一","title":"光合作用","desc":"色素、光反应与暗反应、补偿点/饱和点移动、探究实验","icon":"ic-leaf","sort":7},
  {"_id":"kp_r1_8","courseId":"course_required_1","chapter":"必修一","title":"细胞的生命历程","desc":"有丝分裂、减数分裂、分化、衰老、凋亡、癌变","icon":"ic-dna","sort":8},
  {"_id":"kp_r2_1","courseId":"course_required_2","chapter":"必修二","title":"遗传因子的发现","desc":"分离定律、自由组合定律（正推/逆推、9:3:3:1 变型）","icon":"ic-dna","sort":1},
  {"_id":"kp_r2_2","courseId":"course_required_2","chapter":"必修二","title":"基因与染色体的关系","desc":"基因在染色体上、伴性遗传（X 连锁、系谱图判断）","icon":"ic-target","sort":2},
  {"_id":"kp_r2_3","courseId":"course_required_2","chapter":"必修二","title":"基因的本质","desc":"DNA 是主要遗传物质、DNA 双螺旋结构与复制","icon":"ic-dna","sort":3},
  {"_id":"kp_r2_4","courseId":"course_required_2","chapter":"必修二","title":"基因的表达","desc":"转录、翻译、中心法则、基因对性状的控制","icon":"ic-refresh","sort":4},
  {"_id":"kp_r2_5","courseId":"course_required_2","chapter":"必修二","title":"可遗传变异","desc":"基因突变、基因重组、染色体变异","icon":"ic-spark","sort":5},
  {"_id":"kp_r2_6","courseId":"course_required_2","chapter":"必修二","title":"人类遗传病","desc":"调查与预防、系谱分析","icon":"ic-student","sort":6},
  {"_id":"kp_r2_7","courseId":"course_required_2","chapter":"必修二","title":"生物育种","desc":"杂交育种、诱变育种、单倍体/多倍体育种、基因工程育种","icon":"ic-leaf","sort":7},
  {"_id":"kp_r2_8","courseId":"course_required_2","chapter":"必修二","title":"现代生物进化理论","desc":"种群基因频率、隔离与物种形成、共同进化","icon":"ic-chart","sort":8},
  {"_id":"kp_r2_9","courseId":"course_required_2","chapter":"必修二","title":"表观遗传","desc":"新高考新增考点","icon":"ic-star","sort":9},
  {"_id":"kp_e1_1","courseId":"course_elective_1","chapter":"选择性必修一","title":"内环境与稳态","desc":"体液组成、内环境稳态及意义","icon":"ic-flask","sort":1},
  {"_id":"kp_e1_2","courseId":"course_elective_1","chapter":"选择性必修一","title":"神经调节","desc":"反射与反射弧、兴奋在神经纤维/突触的传导、中枢分级调节","icon":"ic-bolt","sort":2},
  {"_id":"kp_e1_3","courseId":"course_elective_1","chapter":"选择性必修一","title":"体液调节","desc":"激素种类与本质、下丘脑—垂体轴、体温/水盐/血糖平衡调节","icon":"ic-target","sort":3},
  {"_id":"kp_e1_4","courseId":"course_elective_1","chapter":"选择性必修一","title":"免疫调节","desc":"非特异性免疫、体液免疫与细胞免疫、免疫失调（过敏/自身免疫/免疫缺陷）","icon":"ic-check-circle","sort":4},
  {"_id":"kp_e1_5","courseId":"course_elective_1","chapter":"选择性必修一","title":"植物生命活动调节","desc":"生长素及其他激素、环境因素（光/重力）调节","icon":"ic-leaf","sort":5},
  {"_id":"kp_e2_1","courseId":"course_elective_2","chapter":"选择性必修二","title":"种群","desc":"数量特征、种群密度调查方法（样方/标志重捕）、种群数量变化（J/S 型曲线）","icon":"ic-chart","sort":1},
  {"_id":"kp_e2_2","courseId":"course_elective_2","chapter":"选择性必修二","title":"群落","desc":"物种组成、种间关系、群落空间结构、演替","icon":"ic-folder","sort":2},
  {"_id":"kp_e2_3","courseId":"course_elective_2","chapter":"选择性必修二","title":"生态系统","desc":"组成结构、能量流动（计算、利用率）、物质循环、信息传递、稳定性","icon":"ic-refresh","sort":3},
  {"_id":"kp_e2_4","courseId":"course_elective_2","chapter":"选择性必修二","title":"生态环境保护","desc":"生物多样性、全球性生态环境问题、可持续发展","icon":"ic-leaf","sort":4},
  {"_id":"kp_e3_1","courseId":"course_elective_3","chapter":"选择性必修三","title":"发酵工程","desc":"传统发酵技术、微生物的培养与分离计数、发酵工程及应用","icon":"ic-flask","sort":1},
  {"_id":"kp_e3_2","courseId":"course_elective_3","chapter":"选择性必修三","title":"细胞工程","desc":"植物细胞工程（组织培养）、动物细胞工程（细胞融合、单克隆抗体）、胚胎工程","icon":"ic-microscope","sort":2},
  {"_id":"kp_e3_3","courseId":"course_elective_3","chapter":"选择性必修三","title":"基因工程","desc":"三种工具酶、操作程序（获取→表达→检测）、PCR、应用、蛋白质工程","icon":"ic-dna","sort":3},
  {"_id":"kp_e3_4","courseId":"course_elective_3","chapter":"选择性必修三","title":"生物技术的安全性与伦理","desc":"生物技术的安全性与伦理问题","icon":"ic-lock","sort":4}
]
```

- [ ] **Step 2: 验证**

`readNoSqlDatabaseContent` 查 knowledge_points 集合，预期 `total: 30`。

---

### Task 4: 更新 5 册 courses.videoIds

**Files:** 无（cloudbase MCP 数据操作）

- [ ] **Step 1: 调用 writeNoSqlDatabaseContent update（5 次）**

```json
// 1) query: {"_id":"course_required_1"}, update: {"$set":{"videoIds":["vid_BV1J424YAEAL","vid_BV1suiGBaEm8","vid_BV1Ka411h7Nh","vid_BV1jk6mBhEsJ","vid_BV1Z34y1w73r","vid_BV1UM2ABqEDd"]}}
// 2) query: {"_id":"course_required_2"}, update: {"$set":{"videoIds":["vid_BV1HP4y1f72i","vid_BV1PA28YjEu9","vid_BV1db411a7G4","vid_BV1a7411P7fm","vid_BV1MM4y1Q7gX"]}}
// 3) query: {"_id":"course_elective_1"}, update: {"$set":{"videoIds":["vid_BV1T5411G7Q8","vid_BV1mF411v7JD","vid_BV1TS4y1E7Lq","vid_BV1Eh2bYMEbH","vid_BV1vF4NeYE8P","vid_BV1f8411L7oM"]}}
// 4) query: {"_id":"course_elective_2"}, update: {"$set":{"videoIds":["vid_BV1g8411875h","vid_BV1Vq4y1A7un","vid_BV19R4y1S7r8","vid_BV1bT2BY1Egk","vid_BV1GoUWBGEyv","vid_BV1UP411u7p1"]}}
// 5) query: {"_id":"course_elective_3"}, update: {"$set":{"videoIds":["vid_BV1R24y1x7K7","vid_BV1itUVBHExk","vid_BV1nu4m1T7b5","vid_BV1dr4y1K7VM","vid_BV1H2421T7Wc","vid_BV1xY4y1D7cF","vid_BV1Xuo9YRERH"]}}
```

- [ ] **Step 2: 验证**

`readNoSqlDatabaseContent` 查 courses（projection `{"_id":1,"videoIds":1}`），确认 5 册 videoIds 与上面一致；`course_review` 保持原值不动。

---

### Task 5: 新建 getCourseDetail 云函数并部署验证

**Files:**
- Create: `cloudfunctions/getCourseDetail/index.js`
- Create: `cloudfunctions/getCourseDetail/package.json`
- Create: `cloudfunctions/getCourseDetail/config.json`

- [ ] **Step 1: 写 index.js**

```js
// 云函数 getCourseDetail - 课程详情（课程信息 + 推荐视频 + 核心考点）
// 课程详情页与考点页共用
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { courseId } = event;
  if (!courseId) {
    return { code: 400, msg: '缺少 courseId' };
  }

  try {
    // 1. 课程信息
    const { data: courseList } = await db.collection('courses')
      .where({ _id: courseId })
      .get();
    if (courseList.length === 0) {
      return { code: 404, msg: '课程不存在' };
    }
    const course = courseList[0];

    // 2. 推荐视频：按 course.videoIds 顺序保序返回
    const videoIds = course.videoIds || [];
    let videos = [];
    if (videoIds.length > 0) {
      const { data: videoList } = await db.collection('videos')
        .where({ _id: _.in(videoIds) })
        .get();
      const videoMap = {};
      videoList.forEach((v) => { videoMap[v._id] = v; });
      videos = videoIds.map((id) => videoMap[id]).filter(Boolean);
    }

    // 3. 核心考点（sort 升序）
    const { data: knowledgePoints } = await db.collection('knowledge_points')
      .where({ courseId })
      .orderBy('sort', 'asc')
      .get();

    return { code: 0, data: { course, videos, knowledgePoints } };
  } catch (err) {
    console.error('getCourseDetail error:', err);
    return { code: -1, msg: '获取课程详情失败' };
  }
};
```

- [ ] **Step 2: 写 package.json 与 config.json**

```json
// package.json
{
  "name": "getCourseDetail",
  "version": "1.0.0",
  "description": "课程详情云函数 - 课程信息 + 推荐视频 + 核心考点",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  }
}
```
```json
// config.json
{
  "permissions": {
    "openapi": []
  },
  "timeout": 10,
  "runtime": "Nodejs16.13"
}
```

- [ ] **Step 3: 部署**

`manageFunctions` → `queryFunctions` 确认 getCourseDetail 是否已存在；不存在则 `createFunction`：`func: { name: "getCourseDetail", runtime: "Nodejs16.13", handler: "index.main", timeout: 10, type: "Event" }`，`functionRootPath: "c:\\Users\\17723\\Desktop\\bio\\cloudfunctions"`；已存在则 `updateFunctionCode`。

- [ ] **Step 4: 调用验证**

`manageFunctions invokeFunction`，`functionName: "getCourseDetail"`：
1. `params: {"courseId":"course_required_1"}` → 预期 `code:0`，videos 6 条且顺序与 Task 4 一致，knowledgePoints 8 条
2. `params: {"courseId":"bad_id"}` → 预期 `code:404`
3. `params: {}` → 预期 `code:400`
