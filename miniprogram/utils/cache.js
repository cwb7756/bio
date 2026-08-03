// utils/cache.js
// 统一缓存管理工具
// 版本控制：修改 CACHE_VERSION 可清空所有旧缓存

const CACHE_VERSION = 'v1';

/**
 * 生成缓存键
 */
function getCacheKey(name, params) {
  const hash = params ? JSON.stringify(params) : '';
  return `cache_${CACHE_VERSION}_${name}_${hash}`;
}

/**
 * 获取缓存数据
 * @param {string} name - 缓存名称（如 'home', 'quiz'）
 * @param {object} params - 查询参数（用于区分不同参数的缓存）
 * @param {number} ttl - 缓存有效期（毫秒），默认 5 分钟
 * @returns {any|null} 缓存数据，过期或不存在返回 null
 */
export function cacheGet(name, params = {}, ttl = 5 * 60 * 1000) {
  const key = getCacheKey(name, params);
  try {
    const cached = wx.getStorageSync(key);
    if (!cached) return null;
    
    // 检查是否过期
    if (Date.now() - cached.timestamp > ttl) {
      wx.removeStorageSync(key);
      return null;
    }
    
    return cached.data;
  } catch (e) {
    console.warn(`cacheGet error for ${key}:`, e);
    // Storage 异常时清除该缓存
    wx.removeStorageSync(key);
    return null;
  }
}

/**
 * 设置缓存数据
 * @param {string} name - 缓存名称
 * @param {any} data - 要缓存的数据
 * @param {object} params - 查询参数
 * @param {number} ttl - 缓存有效期（毫秒），默认 5 分钟
 */
export function cacheSet(name, data, params = {}) {
  const key = getCacheKey(name, params);
  try {
    wx.setStorageSync(key, {
      timestamp: Date.now(),
      data
    });
  } catch (e) {
    console.error(`cacheSet error for ${key}:`, e);
    // Storage 空间不足时提示
    if (e.message && e.message.includes('quota')) {
      wx.showToast({ title: '存储已满', icon: 'none' });
      clear(); // 尝试清空旧缓存
    }
  }
}

/**
 * 删除指定缓存
 * @param {string} name - 缓存名称
 * @param {object} params - 查询参数
 */
export function cacheRemove(name, params = {}) {
  wx.removeStorageSync(getCacheKey(name, params));
}

/**
 * 清除所有缓存
 * 注意：调用此操作会清除所有带有当前 CACHE_VERSION 的缓存
 */
export function clear() {
  try {
    const list = wx.getStorageInfoSync();
    const pattern = new RegExp(`^cache_${CACHE_VERSION}_`);
    
    list.keys.forEach(key => {
      if (pattern.test(key)) {
        wx.removeStorageSync(key);
      }
    });
  } catch (e) {
    console.error('clear cache error:', e);
  }
}

/**
 * 清除指定类型的缓存
 * @param {string} name - 缓存类型名
 */
export function clearType(name) {
  try {
    const list = wx.getStorageInfoSync();
    const pattern = new RegExp(`^cache_${CACHE_VERSION}_${name}_`);
    
    list.keys.forEach(key => {
      if (pattern.test(key)) {
        wx.removeStorageSync(key);
      }
    });
  } catch (e) {
    console.error(`clear type ${name} error:`, e);
  }
}

/**
 * 检查是否有有效缓存
 * @param {string} name - 缓存名称
 * @param {object} params - 查询参数
 * @param {number} ttl - 缓存有效期
 * @returns {boolean}
 */
export function hasValidCache(name, params = {}, ttl = 5 * 60 * 1000) {
  return cacheGet(name, params, ttl) !== null;
}

/**
 * 获取缓存大小（字节）
 * @returns {number} 总占用字节数
 */
export function getCacheSize() {
  try {
    const list = wx.getStorageInfoSync();
    let size = 0;
    const pattern = new RegExp(`^cache_${CACHE_VERSION}_`);
    
    list.keys.forEach(key => {
      if (pattern.test(key)) {
        const cached = wx.getStorageSync(key);
        if (cached && cached.data) {
          size += JSON.stringify(cached).length;
        }
      }
    });
    
    return size;
  } catch (e) {
    console.error('get cache size error:', e);
    return 0;
  }
}

// 导出默认对象
export default {
  get: cacheGet,
  set: cacheSet,
  remove: cacheRemove,
  clear,
  clearType,
  hasValidCache,
  getCacheSize
};
