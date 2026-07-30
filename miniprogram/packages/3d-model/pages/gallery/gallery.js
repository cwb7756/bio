// miniprogram/packages/3d-model/pages/gallery/gallery.js
Page({
  data: {
    models: [],
    loading: true,
    error: ''
  },
  
  onLoad: function() {
    this.loadModels();
  },
  
  onPullDownRefresh: function() {
    this.loadModels(() => {
      wx.stopPullDownRefresh();
    });
  },
  
  loadModels: function(callback) {
    const self = this;
    wx.cloud.callFunction({
      name: 'modelLibrary',
      data: {
        action: 'user.listModels',
        skip: 0,
        limit: 20
      },
      success: res => {
        if (res.result.code === 0) {
          // 预先格式化文件大小，供 WXML 直接渲染
          const models = (res.result.data || []).map(item => ({
            ...item,
            sizeText: self.formatFileSize(item.fileSize)
          }));
          self.setData({
            models: models,
            loading: false,
            error: ''
          });
        } else {
          self.setData({
            loading: false,
            error: res.result.msg || '加载失败'
          });
        }
      },
      fail: err => {
        console.error('加载模型列表失败:', err);
        self.setData({
          loading: false,
          error: '网络错误，请稍后重试'
        });
      },
      complete: callback || function() {}
    });
  },
  
  goToViewer: function(e) {
    const model = e.currentTarget.dataset.model;
    wx.navigateTo({
      url: `/packages/3d-model/pages/viewer/viewer?id=${model._id}&name=${encodeURIComponent(model.name)}`
    });
  },
  
  formatFileSize: function(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
})
