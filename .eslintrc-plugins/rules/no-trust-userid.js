/**
 * Rule: no-trust-userid
 * 
 * 禁止从 event 参数中读取或解构 userID
 * 所有用户身份必须通过 cloud.getWXContext().OPENID 获取
 * 
 * 错误示例：
 * - const { userID } = event;
 * - const userID = event.userID;
 * - const { userID: uid } = event;
 */

'use strict';

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: '禁止从 event 参数中信任 userID，必须使用 cloud.getWXContext().OPENID',
      category: 'security',
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      directAccess: '禁止从 event 直接访问 userID: const { userID } = event; 必须使用 cloud.getWXContext().OPENID',
      propertyAccess: '禁止从 event.property 访问 userID: event.userID。必须使用 cloud.getWXContext().OPENID',
    },
  },

  create(context) {
    return {
      // const { userID } = event;
      VariableDeclarator(node) {
        if (node.init && node.init.type === 'Identifier' && node.init.name === 'event') {
          if (node.id.type === 'ObjectPattern') {
            for (const prop of node.id.properties) {
              if (prop.type === 'Property' && !prop.computed) {
                const keyName = prop.key.name || (prop.key.type === 'Literal' ? prop.key.value : null);
                if (keyName && keyName.toLowerCase() === 'userid') {
                  context.report({
                    node: prop,
                    messageId: 'directAccess',
                  });
                }
              }
            }
          }
        }
      },

      // const userId = event.userID;
      MemberExpression(node) {
        // 检测 event.userID、event.userId 等
        if (
          node.object.type === 'Identifier' &&
          node.object.name === 'event' &&
          !node.computed &&
          node.property &&
          node.property.type === 'Identifier' &&
          node.property.name.toLowerCase() === 'userid'
        ) {
          context.report({
            node: node.property,
            messageId: 'propertyAccess',
          });
        }
      },
    };
  },
};
