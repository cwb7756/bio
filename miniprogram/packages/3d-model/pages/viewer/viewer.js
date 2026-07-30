// miniprogram/packages/3d-model/pages/viewer/viewer.js
// 3D 模型查看器页面：流程编排（获取信息 -> 下载提示 -> 下载/缓存 -> 渲染组件）
// 渲染逻辑见 components/model-viewer，下载与缓存逻辑见 utils/model-loader
import { modelLoader, ModelLoader } from '../../utils/model-loader'

Page({
  data: {
    modelName: '',
    modelId: '',
    fileSize: 0,
    fileName: '',
    fileSizeText: '',
    modelPath: '',        // 本地模型文件路径，传给 model-viewer 组件
    downloading: false,
    downloadProgress: 0,
    isReady: false,
    loading: true,
    showDownloadTip: false,
    tipFileSize: ''
  },

  onLoad: function (options) {
    const { id, name } = options
    this.setData({
      modelId: id,
      modelName: decodeURIComponent(name || '3D 模型')
    })

    // 命中本地缓存则直接渲染
    const cached = modelLoader.getCached(id)
    if (cached) {
      this.setData({
        fileName: cached.fileName || '',
        fileSize: cached.fileSize || 0,
        fileSizeText: ModelLoader.formatFileSize(cached.fileSize || 0)
      })
      this.initViewer(cached.path)
      return
    }

    // 未缓存：获取模型信息并提示用户下载
    this.fetchModelInfo(id)
  },

  // 获取模型信息并提示下载
  fetchModelInfo: function (modelId) {
    modelLoader.fetchModelInfo(modelId)
      .then(info => {
        this.modelInfo = info
        this.setData({
          fileName: info.fileName,
          fileSize: info.fileSize,
          fileSizeText: ModelLoader.formatFileSize(info.fileSize),
          loading: false,
          showDownloadTip: true,
          tipFileSize: ModelLoader.formatFileSize(info.fileSize)
        })
      })
      .catch(err => {
        console.error('获取模型信息失败:', err)
        this.setData({ loading: false })
        wx.showToast({ title: err.message || '网络错误', icon: 'error' })
      })
  },

  // 用户确认下载
  confirmDownload: function () {
    this.setData({ showDownloadTip: false, downloading: true, downloadProgress: 0 })

    modelLoader.download(this.data.modelId, this.modelInfo, progress => {
      this.setData({ downloadProgress: progress })
    })
      .then(filePath => {
        this.setData({ downloading: false })
        this.initViewer(filePath)
      })
      .catch(err => {
        console.error('文件下载失败:', err)
        this.setData({ downloading: false })
        wx.showToast({ title: err.message || '下载失败', icon: 'error' })
      })
  },

  // 取消下载
  cancelDownload: function () {
    wx.navigateBack()
  },

  // 空函数，阻止弹窗点击穿透
  noop: function () {},

  // 下载/缓存就绪，挂载查看器
  initViewer: function (modelPath) {
    this.setData({
      modelPath: modelPath,
      isReady: true,
      loading: false
    })
  },

  // 组件模型加载完成
  onModelLoaded: function () {
    wx.hideLoading()
  },

  // 组件错误
  onModelError: function (e) {
    wx.hideLoading()
    wx.showToast({
      title: (e.detail && e.detail.message) || '模型加载失败',
      icon: 'error'
    })
  },

  onShareAppMessage: function () {
    return {
      title: `查看 ${this.data.modelName} 的 3D 模型`,
      path: `/packages/3d-model/pages/viewer/viewer?id=${this.data.modelId}&name=${encodeURIComponent(this.data.modelName)}`
    }
  }
})
