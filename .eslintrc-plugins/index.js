/**
 * @bio/eslint-plugin-security - 自定义 ESLint 安全规则插件
 * 
 * 规则列表：
 * - no-trust-userid: 禁止从 event 参数中读取 userID（必须使用 cloud.getWXContext().OPENID）
 * - require-openid-isolation: 强制数据库查询必须使用_openid 进行隔离
 */

module.exports = {
  rules: {
    'no-trust-userid': require('./rules/no-trust-userid'),
    'require-openid-isolation': require('./rules/require-openid-isolation'),
  },
  configs: {
    recommended: {
      plugins: ['@bio/security'],
      rules: {
        '@bio/security/no-trust-userid': 'error',
        '@bio/security/require-openid-isolation': 'error',
      },
    },
  },
};
