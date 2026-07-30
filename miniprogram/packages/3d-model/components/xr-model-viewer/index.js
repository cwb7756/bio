// miniprogram/packages/3d-model/components/xr-model-viewer/index.js
// 3D 模型展示组件：基于微信官方 xr-frame，仅支持 glTF/glb 格式
// 属性:
//   modelPath  模型文件路径（wx.downloadFile 返回的本地路径或 https 链接）
// 事件:
//   loaded  模型加载完成
//   error   模型加载失败（detail.message）
const LOAD_TIMEOUT = 20000 // 资产加载超时兜底（xr-frame 部分失败场景不触发 error）
const AUTO_ROTATE_SPEED = 0.5 // 自动旋转角速度（rad/s）

Component({
  properties: {
    modelPath: {
      type: String,
      value: '',
      observer(newVal) {
        if (newVal && this._sceneReady) {
          this._loadModel(newVal)
        }
      }
    }
  },

  data: {
    src: '',
    loaded: false
  },

  lifetimes: {
    detached() {
      this._clearTimer()
      this.scene = null
      this._modelTrs = null
    }
  },

  methods: {
    // xr-scene 就绪
    handleReady(e) {
      this.scene = e.detail.value
      this._sceneReady = true

      // 触摸中暂停自动旋转（orbit-control 手势期间不与自转叠加）
      this.scene.event.add('touchstart', () => { this._touching = true })
      this.scene.event.add('touchend', () => { this._touching = false })
      this.scene.event.add('tick', this._handleTick.bind(this))

      if (this.data.modelPath) {
        this._loadModel(this.data.modelPath)
      }
    },

    _loadModel(path) {
      this._clearTimer()
      this._modelTrs = null
      this.setData({ src: path, loaded: false })

      this._loadTimer = setTimeout(() => {
        this._loadTimer = null
        if (!this.data.loaded) {
          this.triggerEvent('error', { message: '模型加载超时' })
        }
      }, LOAD_TIMEOUT)
    },

    // 全部资产加载完成
    handleAssetsLoaded() {
      this._clearTimer()
      this.setData({ loaded: true })
      this.triggerEvent('loaded')
    },

    // 单个资产加载失败
    handleAssetError(e) {
      this._clearTimer()
      console.error('xr-model-viewer: 模型资源加载失败', e.detail)
      this.triggerEvent('error', { message: '模型加载失败' })
    },

    // 每帧绕 y 轴自转
    _handleTick(deltaTime) {
      if (!this.scene || !this.data.loaded || this._touching) return

      if (!this._modelTrs) {
        const el = this.scene.getElementById('model-wrap')
        if (!el) return
        this._modelTrs = el.getComponent(wx.getXrFrameSystem().Transform)
      }
      this._modelTrs.rotation.y += (deltaTime / 1000) * AUTO_ROTATE_SPEED
    },

    _clearTimer() {
      if (this._loadTimer) {
        clearTimeout(this._loadTimer)
        this._loadTimer = null
      }
    }
  }
})
