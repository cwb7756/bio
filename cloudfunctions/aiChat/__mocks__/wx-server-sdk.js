// wx-server-sdk 可配置 mock —— 用于单元测试
// 通过 __store 设置 mock 数据与 OPENID

var _store = {
  openid: 'test-openid-123',
  collections: {} // { collectionName: { data: [...] } }
};

function filterData(data, where) {
  if (!where || Object.keys(where).length === 0) return data;
  return data.filter(function (doc) {
    return Object.keys(where).every(function (key) {
      var cond = where[key];
      if (cond === null || cond === undefined) return true;
      if (typeof cond !== 'object') return doc[key] === cond;
      // Command objects
      if (cond.__neq !== undefined) return doc[key] !== cond.__neq;
      if (cond.__in !== undefined) {
        return cond.__in.indexOf(doc[key]) >= 0 || cond.__in.indexOf(String(doc[key])) >= 0;
      }
      return doc[key] === cond;
    });
  });
}

function createChain(collectionName) {
  var _where = {};
  var _limit = 1000;
  var _field = null;
  var _orderBy = null;

  var chain = {
    where: function (cond) { _where = cond || {}; return chain; },
    field: function (fields) { _field = fields; return chain; },
    limit: function (n) { _limit = n; return chain; },
    orderBy: function (field, dir) { _orderBy = { field: field, dir: dir }; return chain; },
    get: async function () {
      var col = _store.collections[collectionName] || { data: [] };
      var data = filterData(col.data || [], _where);
      if (_orderBy) {
        data = data.slice().sort(function (a, b) {
          var av = a[_orderBy.field], bv = b[_orderBy.field];
          if (av === bv) return 0;
          var r = av > bv ? 1 : -1;
          return _orderBy.dir === 'desc' ? -r : r;
        });
      }
      if (_field) {
        data = data.map(function (doc) {
          var proj = { _id: doc._id };
          Object.keys(_field).forEach(function (k) {
            if (_field[k]) proj[k] = doc[k];
          });
          return proj;
        });
      }
      return { data: data.slice(0, _limit) };
    },
    count: async function () {
      var col = _store.collections[collectionName] || { data: [] };
      var data = filterData(col.data || [], _where);
      return { total: data.length };
    },
    add: async function (opts) {
      if (!_store.collections[collectionName]) {
        _store.collections[collectionName] = { data: [] };
      }
      var newDoc = Object.assign({ _id: 'mock-id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) }, opts.data);
      _store.collections[collectionName].data.push(newDoc);
      return { _id: newDoc._id };
    },
    update: async function (opts) {
      var col = _store.collections[collectionName] || { data: [] };
      var matching = filterData(col.data || [], _where);
      matching.forEach(function (doc) {
        Object.assign(doc, opts.data);
      });
      return { stats: { updated: matching.length } };
    },
    doc: function (id) {
      return {
        update: async function (opts) {
          var col = _store.collections[collectionName] || { data: [] };
          var doc = (col.data || []).find(function (d) { return d._id === id; });
          if (doc) Object.assign(doc, opts.data);
          return { stats: { updated: doc ? 1 : 0 } };
        },
        get: async function () {
          var col = _store.collections[collectionName] || { data: [] };
          var doc = (col.data || []).find(function (d) { return d._id === id; });
          return { data: doc ? [doc] : [] };
        },
        remove: async function () {
          return { stats: { removed: 1 } };
        }
      };
    }
  };
  return chain;
}

var dbInstance = {
  collection: function (name) { return createChain(name); },
  command: {
    neq: function (val) { return { __neq: val }; },
    in: function (arr) { return { __in: arr }; },
    eq: function (val) { return val; },
    and: function () { return {}; },
    or: function () { return {}; }
  }
};

module.exports = {
  init: function () {},
  DYNAMIC_CURRENT_ENV: 'test-dynamic-env',
  database: function () { return dbInstance; },
  getWXContext: function () { return { OPENID: _store.openid }; },
  __store: _store
};
