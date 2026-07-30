// miniprogram/packages/3d-model/utils/model-loader.js
// 3D 模型加载工具：云函数获取临时链接 -> wx.downloadFile 下载 -> wx.setStorage 缓存管理
//
// 用法:
//   const loader = new ModelLoader()
//   const info = await loader.fetchModelInfo(modelId)        // 获取下载链接与文件信息
//   const path = await loader.ensureLocal(modelId, info, cb) // 命中缓存或下载后返回本地路径

// v2: 模型格式迁移 OBJ -> glb（xr-frame），旧前缀缓存的 obj 路径不再可用
const CACHE_PREFIX = 'model_v2_'
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000 // 缓存 7 天

export class ModelLoader {
  /**
   * 调用云函数获取模型临时下载链接
   * @param {string} modelId
   * @returns {Promise<{url, fileName, fileSize}>}
   */
  fetchModelInfo(modelId) {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'modelLibrary',
        data: { action: 'user.downloadModel', modelId },
        success: res => {
          if (res.result && res.result.code === 0) {
            resolve({
              url: res.result.url,
              fileName: res.result.fileName,
              fileSize: res.result.fileSize
            })
          } else {
            reject(new Error((res.result && res.result.msg) || '获取模型信息失败'))
          }
        },
        fail: err => reject(err)
      })
    })
  }

  /**
   * 读取有效缓存的本地文件路径
   * @param {string} modelId
   * @returns {{path, fileName, fileSize} | null}
   */
  getCached(modelId) {
    try {
      const cached = wx.getStorageSync(CACHE_PREFIX + modelId)
      if (cached && cached.path && cached.timestamp > Date.now() - CACHE_TTL) {
        return cached
      }
    } catch (err) {
      console.warn('读取模型缓存失败:', err)
    }
    return null
  }

  /**
   * 确保模型文件在本地可用：命中缓存直接返回，否则下载后缓存
   * @param {string} modelId
   * @param {{url, fileName, fileSize}} info fetchModelInfo 的返回
   * @param {(progress: number) => void} [onProgress] 下载进度回调（0-100）
   * @returns {Promise<string>} 本地文件路径
   */
  ensureLocal(modelId, info, onProgress) {
    const cached = this.getCached(modelId)
    if (cached) {
      return Promise.resolve(cached.path)
    }
    return this.download(modelId, info, onProgress)
  }

  /**
   * 下载模型文件并写入缓存
   * @param {string} modelId
   * @param {{url, fileName, fileSize}} info
   * @param {(progress: number) => void} [onProgress]
   * @returns {Promise<string>} 本地文件路径
   */
  download(modelId, info, onProgress) {
    return new Promise((resolve, reject) => {
      const task = wx.downloadFile({
        url: info.url,
        success: res => {
          if (res.statusCode !== 200) {
            reject(new Error('下载失败（HTTP ' + res.statusCode + '）'))
            return
          }
          const filePath = res.tempFilePath
          try {
            wx.setStorageSync(CACHE_PREFIX + modelId, {
              path: filePath,
              timestamp: Date.now(),
              fileName: info.fileName,
              fileSize: info.fileSize
            })
          } catch (err) {
            console.warn('写入模型缓存失败:', err)
          }
          resolve(filePath)
        },
        fail: err => reject(err)
      })

      if (typeof onProgress === 'function' && task && task.onProgressUpdate) {
        task.onProgressUpdate(res => {
          onProgress(Math.round(res.progress))
        })
      }
    })
  }

  /**
   * 清理指定模型的缓存
   * @param {string} modelId
   */
  clearCache(modelId) {
    try {
      wx.removeStorageSync(CACHE_PREFIX + modelId)
    } catch (err) {
      console.warn('清理模型缓存失败:', err)
    }
  }

  /**
   * 格式化文件体积
   * @param {number} bytes
   * @returns {string}
   */
  static formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
}

// 导出共享实例
export const modelLoader = new ModelLoader()
