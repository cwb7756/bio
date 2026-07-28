/**
 * Rule: require-openid-isolation
 * 
 * 强制所有数据库查询必须使用 _openid 进行用户数据隔离
 */

'use strict';

const COLLECTION_WHITELIST = new Set([
  'courses',
  'lessons',
  'topics',
  'knowledge_nodes',
  'public_announcements',
]);

function isPublicCollection(collectionName) {
  return COLLECTION_WHITELIST.has(collectionName);
}

function hasOpenIdProperty(props) {
  if (!props) return false;
  for (const prop of props) {
    if (prop.type === 'Property') {
      const key = prop.key;
      const keyName = key.name || (key.type === 'Literal' ? key.value : null);
      if (keyName === '_openid') {
        return true;
      }
    }
  }
  return false;
}

function checkCompoundQuery(node) {
  if (node.type !== 'CallExpression') return false;
  
  const callee = node.callee;
  if (callee.type !== 'MemberExpression') return false;
  if (callee.property.type !== 'Identifier') return false;
  if (callee.object.type !== 'Identifier' || callee.object.name !== '_') return false;
  if (callee.property.name !== 'or' && callee.property.name !== 'and') return false;
  
  if (!node.arguments || node.arguments.length === 0) return false;
  
  for (const arg of node.arguments) {
    if (arg.type === 'ArrayExpression') {
      for (const item of arg.elements) {
        if (item && item.type === 'ObjectExpression') {
          if (hasOpenIdProperty(item.properties)) return true;
        } else if (item && item.type === 'CallExpression') {
          if (checkCompoundQuery(item)) return true;
        }
      }
    } else if (arg.type === 'ObjectExpression') {
      if (hasOpenIdProperty(arg.properties)) return true;
    }
  }
  
  return false;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: '强制数据库查询必须使用 _openid 进行用户数据隔离',
      category: 'security',
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      missingOpenid: '数据库查询必须使用 _openid 进行用户隔离：db.collection(\'{{collection}}\').where({ _openid: OPENID })',
      emptyWhere: 'where() 调用无效或未指定 _openid 条件',
    },
  },

  create(context) {
    function findCollectionNode(node) {
      // 在 db.collection('xxx').where(...).get() 中找 .collection('xxx') 的 CallExpression
      let current = node;
      
      while (current && current.type === 'CallExpression') {
        const callee = current.callee;
        if (!callee || callee.type !== 'MemberExpression') return null;
        
        if (
          callee.property &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'collection'
        ) {
          return current;
        }
        
        // 沿链式调用向内层遍历：callee.object 可能是下一个 CallExpression
        current = callee.object;
      }
      
      return null;
    }

    function checkDbQueryPattern(node) {
      if (node.type !== 'CallExpression') return;
      
      const callee = node.callee;
      if (callee.type !== 'MemberExpression') return;
      
      const innerProp = callee.property;
      if (innerProp.type !== 'Identifier') return;
      
      const validOperations = ['get', 'count', 'remove', 'add', 'update', 'find'];
      if (!validOperations.includes(innerProp.name)) return;
      
      // 获取集合名称
      const collectionNode = findCollectionNode(node);
      let collectionName = null;
      
      if (collectionNode && collectionNode.arguments && collectionNode.arguments[0]) {
        const arg = collectionNode.arguments[0];
        if (arg.type === 'Literal' && typeof arg.value === 'string') {
          collectionName = arg.value;
        }
      }
      
      // 获取.where() 调用
      let whereCall = null;
      if (
        callee.object &&
        callee.object.type === 'CallExpression' &&
        callee.object.callee &&
        callee.object.callee.type === 'MemberExpression' &&
        callee.object.callee.property &&
        callee.object.callee.property.type === 'Identifier' &&
        callee.object.callee.property.name === 'where'
      ) {
        whereCall = callee.object;
      }
      
      if (!whereCall) return;
      
      const whereArg = whereCall.arguments[0];
      
      if (!whereArg) {
        context.report({
          node: whereCall,
          messageId: 'emptyWhere',
          data: { collection: collectionName || 'unknown' },
        });
        return;
      }
      
      if (whereArg.type !== 'ObjectExpression') {
        // 检查是否是函数调用（如 progressCond(openid, userID, {...})）
        if (
          whereArg.type === 'CallExpression' &&
          whereArg.callee.type === 'Identifier'
        ) {
          const funcName = whereArg.callee.name;
          // 允许特定的辅助函数，如 progressCond、getMistakesQuery 等
          const allowedHelperFunctions = ['progressCond', 'getUserProgressCondition', 'buildUserQuery'];
          if (allowedHelperFunctions.includes(funcName)) {
            return; // 允许的辅助函数，跳过检查
          }
        }
        
        context.report({
          node: whereCall,
          messageId: 'missingOpenid',
          data: { collection: collectionName || 'unknown' },
        });
        return;
      }
      
      if (whereArg.properties.length === 0) {
        context.report({
          node: whereCall,
          messageId: 'emptyWhere',
          data: { collection: collectionName || 'unknown' },
        });
        return;
      }
      
      if (hasOpenIdProperty(whereArg.properties)) {
        return;
      }
      
      if (checkCompoundQuery(whereArg)) {
        return;
      }
      
      if (isPublicCollection(collectionName)) {
        return;
      }
      
      context.report({
        node: whereCall,
        messageId: 'missingOpenid',
        data: { collection: collectionName || 'unknown' },
      });
    }

    return {
      CallExpression: checkDbQueryPattern,
    };
  },
};
