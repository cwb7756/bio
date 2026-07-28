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
 * 
 * 正确做法：
 * - const { OPENID } = cloud.getWXContext();
 * - const { OPENID } = cloud.getWXContext(); const userID = getUserFromOpenID(OPENID);
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
      aliasMapping: '禁止将 event.userID 映射为其他变量名：const { userID: uid } = event。必须使用 cloud.getWXContext().OPENID',
    },
  },

  create(context) {
    /**
     * 检测解构赋值中的 userID，如：const { userID } = event;
     */
    function checkDestructuringPattern(node) {
      // 检查是否从 event 或类似对象解构 userID
      if (node.source && (node.source.name === 'event' || node.source.property?.name === 'event')) {
        for (const prop of node.properties) {
          if (prop.type === 'Property') {
            const keyName = prop.key.name;
            // 检测 userID、userId、USER_ID 等变体
            if (keyName.toLowerCase() === 'userid') {
              context.report({
                node: prop,
                messageId: 'directAccess',
              });
            }
          } else if (prop.type === 'RestElement') {
            // 检测剩余参数 ...rest 包含 event
            context.report({
              node: prop,
              messageId: 'directAccess',
            });
          }
        }
      }
    }

    /**
     * 检测属性访问，如：const userId = event.userID;
     */
    function checkMemberExpression(node) {
      // 检测 event.userID、event.userId 等
      if (
        node.object.type === 'Identifier' &&
        node.object.name === 'event' &&
        node.property &&
        node.property.name &&
        node.property.name.toLowerCase() === 'userid'
      ) {
        context.report({
          node: node.property,
          messageId: 'propertyAccess',
        });
      }

      // 检测 (event.userID).someMethod 等链式调用
      if (
        node.object.type === 'MemberExpression' &&
        node.object.object.type === 'Identifier' &&
        node.object.object.name === 'event' &&
        node.object.property.name &&
        node.object.property.name.toLowerCase() === 'userid'
      ) {
        context.report({
          node: node.object.property,
          messageId: 'propertyAccess',
        });
      }
    }

    /**
     * 检测变量初始化时的映射，如：const { userID: uid } = event;
     */
    function checkMappedDestructuring(node) {
      if (node.type === 'Property' && node.value.type === 'AssignmentPattern') {
        const left = node.value.left;
        if (left.type === 'Identifier' && left.name.toLowerCase() === 'userid') {
          // 检查源是否是 event
          const init = node.parent.init;
          if (init && init.callee && init.callee.name === 'Object' && 
              init.arguments[0] && init.arguments[0].name === 'event') {
            context.report({
              node: left,
              messageId: 'aliasMapping',
            });
          }
        }
      }
    }

    return {
      // const { userID } = event;
      VariableDeclarator(node) {
        if (node.init && node.init.type === 'Identifier' && node.init.name === 'event') {
          if (node.id.type === 'ObjectPattern') {
            checkDestructuringPattern(node.id);
          }
        }

        // const { userID: uid } = Object.fromEntries(Object.entries(event).filter(...))
        if (node.init && node.init.type === 'CallExpression') {
          checkMappedDestructuring(node);
        }
      },

      // const userId = event.userID;
      MemberExpression: checkMemberExpression,

      // Object.assign({}, event); 中的 userID 过滤
      CallExpression(node) {
        // 检测 event.userid 或 event.userId 作为参数
        if (node.callee.type === 'MemberExpression') {
          if (
            node.callee.object.type === 'Identifier' &&
            node.callee.object.name === 'event' &&
            node.callee.property.name &&
            node.callee.property.name.toLowerCase() === 'userid'
          ) {
            context.report({
              node: node.callee.property,
              messageId: 'propertyAccess',
            });
          }
        }
      },
    };
  },
};
