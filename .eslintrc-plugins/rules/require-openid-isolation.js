/**
 * Rule: require-openid-isolation
 * 
 * 强制所有数据库查询必须使用 _openid 进行用户数据隔离
 * 
 * 错误示例：
 * - db.collection('users').where({})  // 未指定隔离条件
 * - db.collection('users').where({ username: 'xxx' })  // 未使用_openid
 * - db.collection('study_progress').where({ courseId: 'xxx' })  // 未使用_openid
 * 
 * 正确做法：
 * - db.collection('users').where({ _openid: OPENID })
 * - db.collection('study_progress').where({ _openid: OPENID, courseId: 'xxx' })
 */

'use strict';

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
      missingOpenid: '数据库查询必须使用 _openid 进行用户隔离：db.collection(\'xxx\').where({ _openid: OPENID })',
      emptyWhere: 'where() 不能为空对象或不存在 where()，必须指定 _openid 隔离条件',
      validAlternative: '如果查询公共数据（非用户专属），请在注释中说明原因：// allow: public data query',
    },
  },

  create(context) {
    const collectionWhitelist = new Set([
      'courses',
      'lessons',
      'topics',
      'knowledge_nodes',
      'public_announcements',
    ]);

    /**
     * 检查 whether a function call uses .collection().where() pattern
     */
    function checkCollectionChain(node) {
      if (node.callee.type !== 'MemberExpression') return;
      
      // 检测 db.collection('xxx')
      const collectionCall = node.callee;
      if (!isDbCollectionCall(collectionCall)) return;

      const collectionName = getCollectionName(collectionCall);
      if (!collectionName) return;

      // 检查是否有 .where() 调用
      let whereCall = null;
      let whereArg = null;
      let whereNode = null;

      if (node.type === 'CallExpression') {
        let current = node.callee;
        while (current.type === 'MemberExpression') {
          if (
            current.property &&
            current.property.type === 'Identifier' &&
            current.property.name === 'where'
          ) {
            whereCall = current;
            break;
          }
          current = current.object;
        }
      }

      if (!whereCall) {
        // 没有 where() 调用的情况需要特别处理
        reportMissingWhere(node, collectionName);
        return;
      }

      // 查找 where() 的参数
      if (whereCall.parent && whereCall.parent.type === 'CallExpression') {
        whereArg = whereCall.parent.arguments[0];
        whereNode = whereCall.parent;
      }

      if (!whereArg) {
        reportEmptyWhere(whereNode || node, collectionName);
        return;
      }

      // 检查 where() 参数是否为对象字面量
      if (whereArg.type !== 'ObjectExpression') {
        // 允许使用 _.or(), _.and() 等组合查询
        if (
          !isCompoundQuery(whereArg) &&
          !allowsCommentException(whereNode || node)
        ) {
          reportMissingOpenid(whereNode || node, collectionName);
        }
        return;
      }

      // 检查是否包含 _openid 或合法的条件组合
      const hasOpenid = whereArg.properties.some((prop) => {
        if (prop.key && prop.key.type === 'Literal' && prop.value.key?.name === '_openid') {
          return true;
        }
        if (prop.key && prop.key.name === '_openid') {
          return true;
        }
        return false;
      });

      // 如果是 compound query（_.or/_.and），递归检查子条件
      if (isCompoundQuery(whereArg)) {
        if (!hasValidSubconditions(whereArg)) {
          reportMissingOpenid(whereNode || node, collectionName);
        }
      } else if (!hasOpenid && !isPublicCollection(collectionName)) {
        reportMissingOpenid(node, collectionName);
      }
    }

    /**
     * 判断是否是 db.collection() 调用
     */
    function isDbCollectionCall(node) {
      return (
        node.type === 'MemberExpression' &&
        node.object.type === 'Identifier' &&
        node.object.name === 'db' &&
        node.property.type === 'Identifier' &&
        node.property.name === 'collection'
      );
    }

    /**
     * 获取集合名称
     */
    function getCollectionName(node) {
      if (
        node.type === 'MemberExpression' &&
        node.property.type === 'Identifier' &&
        node.property.name === 'collection' &&
        node.arguments &&
        node.arguments[0]
      ) {
        const arg = node.arguments[0];
        if (arg.type === 'Literal' && typeof arg.value === 'string') {
          return arg.value;
        }
      }
      return null;
    }

    /**
     * 检查是否是复合查询（_.or / _.and）
     */
    function isCompoundQuery(node) {
      if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
        const callee = node.callee;
        if (
          callee.object.type === 'Identifier' &&
          callee.object.name === '_' &&
          (callee.property.name === 'or' || callee.property.name === 'and')
        ) {
          return true;
        }
      }
      return false;
    }

    /**
     * 检查子条件是否包含_openid
     */
    function hasValidSubconditions(node) {
      if (node.type !== 'CallExpression') return false;

      const args = node.arguments;
      for (const arg of args) {
        if (arg.type === 'ArrayExpression') {
          // _.or([{_openid: openid1}, {_openid: openid2}]) 类型
          for (const item of arg.elements) {
            if (item && item.type === 'ObjectExpression') {
              const hasOpenid = item.properties.some(
                (prop) =>
                  (prop.key &&
                    ((prop.key.name === '_openid' ||
                      (prop.key.type === 'Literal' && prop.key.value === '_openid'))))
              );
              if (hasOpenid) return true;
            }
          }
        } else if (arg.type === 'ObjectExpression') {
          // _.or({_openid: openid}) 类型
          const hasOpenid = arg.properties.some(
            (prop) =>
              (prop.key &&
                ((prop.key.name === '_openid' ||
                  (prop.key.type === 'Literal' && prop.key.value === '_openid'))))
          );
          if (hasOpenid) return true;
        }
      }
      return false;
    }

    /**
     * 检查集合是否在公共数据白名单中
     */
    function isPublicCollection(name) {
      return collectionWhitelist.has(name);
    }

    /**
     * 检查是否有允许的注释
     */
    function allowsCommentException(node) {
      const comments = context.getCommentsBefore(node);
      for (const comment of comments) {
        if (
          comment.value &&
          comment.value.toLowerCase().includes('// allow:')
        ) {
          return true;
        }
      }
      return false;
    }

    /**
     * 报告缺少_openid 的问题
     */
    function reportMissingOpenid(node, collectionName) {
      context.report({
        node: node,
        messageId: 'missingOpenid',
        data: {
          collection: collectionName,
        },
      });
    }

    /**
     * 报告空的 where() 调用
     */
    function reportEmptyWhere(node, collectionName) {
      context.report({
        node: node,
        messageId: 'emptyWhere',
        data: {
          collection: collectionName,
        },
      });
    }

    return {
      CallExpression: checkCollectionChain,
    };
  },
};
