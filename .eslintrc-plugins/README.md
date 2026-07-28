# ESLint Security Rules - OpenID Isolation Enforcement

## 概述

这是为微信小程序云开发项目定制的 ESLint 安全规则插件，用于强制执行 OPENID 隔离和禁止信任客户端传入的 userID。

## 规则列表

### 1. `bio-security/no-trust-userid`

**禁止从 event 参数中读取或解构 userID。** 所有用户身份必须通过 `cloud.getWXContext().OPENID` 获取。

**错误示例：**
```javascript
// ❌ 禁止：从 event 解构 userID
const { userID } = event;
const userId = event.userID;
```

**例外 - 防御性检查：**
对于防御性验证（检查客户端是否尝试传入 userID），可以使用 ESLint 行内禁用注释：

```javascript
// 防御性断言：拒绝客户端传入 userID
// eslint-disable-next-line bio-security/no-trust-userid
if (event.userID) {
  console.warn('home: rejected client-supplied userID');
  return { code: 403, msg: '非法请求' };
}
```

**正确做法：**
```javascript
// ✅ 使用 cloud.getWXContext().OPENID
const { OPENID } = cloud.getWXContext();
```

---

### 2. `bio-security/require-openid-isolation`

**强制所有数据库查询必须使用 `_openid` 进行用户数据隔离。**

**错误示例：**
```javascript
// ❌ 禁止：未使用_openid 隔离
const data = await db.collection('users')
  .where({}) // 空 where
  .get();

const progress = await db.collection('study_progress')
  .where({ courseId: 'course123' }) // 缺少_openid
  .get();
```

**正确做法：**
```javascript
// ✅ 使用_openid 隔离
const { OPENID } = cloud.getWXContext();

const data = await db.collection('users')
  .where({ _openid: OPENID })
  .get();

const progress = await db.collection('study_progress')
  .where({ _openid: OPENID, courseId: 'course123' })
  .get();
```

**允许的公共数据查询（无需_openid）：**
- `courses`
- `lessons`
- `topics`
- `knowledge_nodes`
- `public_announcements`

## 安装与配置

### 已自动配置

本项目已自动配置了这些规则，无需手动安装。配置文件位于：
- `.eslintrc.json` - 主 ESLint 配置
- `.eslintrc.local.js` - 本地测试配置
- `node_modules/eslint-plugin-bio-security/` - 自定义规则插件

### 运行 lint

```bash
# 检查所有文件
npx eslint .

# 仅检查云函数
npm run lint:cf

# 仅检查小程序前端
npm run lint:mp
```

## 规则验证

规则已经过验证，可以捕获以下模式：

### ✅ 被捕获的错误代码

```javascript
// ✅ 正确捕获：event 解构 userID
const { userID } = event;

// ✅ 正确捕获：property 访问 userID  
const userId = event.userID;

// ✅ 正确捕获：未使用_openid 隔离
db.collection('users').where({}).get();
db.collection('study_progress').where({ courseId: 'x' }).get();
```

### ✅ 不会被误报的正确代码

```javascript
// ✅ 正确使用 OPENID
const { OPENID } = cloud.getWXContext();

// ✅ 正确使用_openid 隔离
db.collection('users').where({ _openid: OPENID }).get();

// ✅ 支持组合查询
db.collection('progress').where(
  _.and([
    { _openid: OPENID },
    { type: 'lesson' }
  ])
).get();

// ✅ 允许白名单集合的查询
db.collection('courses').where({ tag: 'biology' }).get();
```

## 集成到 CI/CD

建议在 `.github/workflows/ci.yml` 中添加 lint 步骤：

```yaml
jobs:
  lint:
    name: Lint Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run ESLint with security rules
        run: npm run lint
```

## 安全最佳实践

遵循以下最佳实践确保数据安全：

1. **始终使用 OPENID**：所有用户数据的读写操作都必须通过 `cloud.getWXContext().OPENID` 获取当前用户标识
   
2. **数据隔离**：每个数据库查询条件必须包含 `_openid` 字段，防止越权访问其他用户数据

3. **输入验证**：对所有事件参数进行严格的类型和长度验证

4. **脱敏返回**：返回给客户端的数据必须经过脱敏处理，不包含敏感字段如 `passwordHash`、`_openid` 等

5. **速率限制**：对登录等敏感操作实施速率限制，防止暴力破解

## 维护说明

### 添加新规则

在 `.eslintrc-plugins/rules/` 目录下创建新的规则文件：

```javascript
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: '规则描述',
      category: 'security',
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      messageId: '错误消息',
    },
  },
  create(context) {
    return {
      // AST 节点监听器
      CallExpression(node) {
        // 检测逻辑
      },
    };
  },
};
```

然后在 `node_modules/eslint-plugin-bio-security/index.js` 中导出新规则。

### 更新规则配置

修改 `.eslintrc.json`中的`rules` 部分添加或调整规则级别：

```json
{
  "rules": {
    "bio-security/no-trust-userid": "error",
    "bio-security/require-openid-isolation": "error"
  }
}
```

## 参考资源

- [ESLint 开发者文档](https://eslint.org/docs/developer-guide/working-with-rules)
- [微信云开发安全指南](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/security.html)
- [本文档规范](file:///c:/Users/17723/Desktop/bio/.github/workflows/ci.yml#L21-L36)
