// miniprogram/packages/3d-model/components/xr-model-viewer/index.js
// 3D 模型展示组件：基于微信官方 xr-frame，仅支持 glTF/glb 格式
// 属性:
//   modelPath  模型文件路径（wx.downloadFile 返回的本地路径或 https 链接）
// 事件:
//   loaded  模型加载完成
//   error   模型加载失败（detail.message）
// 手势（自定义，不用 camera-orbit-control）:
//   单指拖动旋转模型，松手后按惯性继续滑动衰减，最终回到自动旋转
//   双指捏合缩放模型（缩放 model-wrap 节点）
const LOAD_TIMEOUT = 20000       // 资产加载超时兜底（xr-frame 部分失败场景不触发 error）
const AUTO_ROTATE_SPEED = 0.5    // 自动旋转角速度（rad/s）
const ROTATE_FACTOR = 0.008      // 拖动灵敏度（rad/px）
const PITCH_LIMIT = 1.1          // 俯仰角限制（rad，避免翻转）
const INERTIA_DAMPING = 0.94     // 惯性衰减系数（每 16.7ms）
const MIN_SCALE = 0.4            // 双指缩放倍率下限
const MAX_SCALE = 3              // 双指缩放倍率上限

// 兼容不同事件源的触点坐标字段
function touchX(t) {
  return t.pageX !== undefined ? t.pageX : (t.clientX !== undefined ? t.clientX : t.x)
}
function touchY(t) {
  return t.pageY !== undefined ? t.pageY : (t.clientY !== undefined ? t.clientY : t.y)
}
function pinchDistance(touches) {
  const dx = touchX(touches[0]) - touchX(touches[1])
  const dy = touchY(touches[0]) - touchY(touches[1])
  return Math.sqrt(dx * dx + dy * dy)
}

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

      // 手势状态
      this._touching = false
      this._pinching = false
      this._velX = 0        // 俯仰角速度（rad/s）
      this._velY = 0        // 水平角速度（rad/s）
      this._autoDir = 1     // 自动旋转方向，跟随最后一次惯性方向
      this._scale = 1       // 双指缩放累积倍率

      this.scene.event.add('touchstart', this._onTouchStart.bind(this))
      this.scene.event.add('touchmove', this._onTouchMove.bind(this))
      this.scene.event.add('touchend', this._onTouchEnd.bind(this))
      this.scene.event.add('touchcancel', this._onTouchEnd.bind(this))
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
    // 注意：src 为空时 xr-assets 内无资产也会立即触发 loaded，必须过滤掉该空轮回调
    handleAssetsLoaded() {
      if (!this.data.src || this.data.loaded) return
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

    // 获取模型节点 Transform（懒加载）
    _getModelTrs() {
      if (!this._modelTrs && this.scene) {
        const el = this.scene.getElementById('model-wrap')
        if (el) {
          this._modelTrs = el.getComponent(wx.getXrFrameSystem().Transform)
        }
      }
      return this._modelTrs
    },

    // ---- 手势：单指旋转 / 双指捏合缩放 ----
    _onTouchStart(e) {
      const touches = e.touches || []
      this._touching = true
      this._velX = 0
      this._velY = 0

      if (touches.length >= 2) {
        this._pinching = true
        this._pinchDist = pinchDistance(touches)
      } else if (touches.length === 1) {
        this._pinching = false
        this._lastX = touchX(touches[0])
        this._lastY = touchY(touches[0])
        this._lastMoveTime = Date.now()
      }
    },

    _onTouchMove(e) {
      const touches = e.touches || []
      const trs = this._getModelTrs()
      if (!trs || !this.data.loaded) return

      // 双指捏合缩放
      if (touches.length >= 2) {
        if (!this._pinching) {
          this._pinching = true
          this._pinchDist = pinchDistance(touches)
          return
        }
        const dist = pinchDistance(touches)
        if (this._pinchDist > 0) {
          this._scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this._scale * (dist / this._pinchDist)))
          trs.scale.x = this._scale
          trs.scale.y = this._scale
          trs.scale.z = this._scale
        }
        this._pinchDist = dist
        return
      }

      // 单指拖动旋转（同时采集角速度供惯性使用）
      if (touches.length === 1 && !this._pinching) {
        const x = touchX(touches[0])
        const y = touchY(touches[0])
        const now = Date.now()
        const dx = x - this._lastX
        const dy = y - this._lastY
        const dt = Math.max(1, now - this._lastMoveTime) / 1000

        trs.rotation.y += dx * ROTATE_FACTOR
        trs.rotation.x = Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, trs.rotation.x + dy * ROTATE_FACTOR))

        // 低通滤波平滑瞬时角速度，避免抖动
        const instVy = (dx * ROTATE_FACTOR) / dt
        const instVx = (dy * ROTATE_FACTOR) / dt
        this._velY = this._velY * 0.3 + instVy * 0.7
        this._velX = this._velX * 0.3 + instVx * 0.7

        this._lastX = x
        this._lastY = y
        this._lastMoveTime = now
      }
    },

    _onTouchEnd(e) {
      const touches = e.touches || []

      if (touches.length === 0) {
        this._touching = false
        this._pinching = false
        // 停留超过 100ms 才松手视为静止，不触发惯性
        if (Date.now() - (this._lastMoveTime || 0) > 100) {
          this._velX = 0
          this._velY = 0
        }
        if (Math.abs(this._velY) > 0.01) {
          this._autoDir = this._velY > 0 ? 1 : -1
        }
      } else if (touches.length === 1) {
        // 双指抬起一指：回到单指旋转，重新锚定起点
        this._pinching = false
        this._lastX = touchX(touches[0])
        this._lastY = touchY(touches[0])
        this._lastMoveTime = Date.now()
        this._velX = 0
        this._velY = 0
      }
    },

    // 每帧：惯性滑动衰减 -> 自动旋转
    _handleTick(deltaTime) {
      if (!this.scene || !this.data.loaded || this._touching) return

      const trs = this._getModelTrs()
      if (!trs) return

      const dtSec = deltaTime / 1000

      // 惯性阶段：按松手时的角速度继续滑动，指数衰减
      if (Math.abs(this._velY) > AUTO_ROTATE_SPEED || Math.abs(this._velX) > 0.05) {
        trs.rotation.y += this._velY * dtSec
        trs.rotation.x = Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, trs.rotation.x + this._velX * dtSec))

        const damping = Math.pow(INERTIA_DAMPING, deltaTime / 16.7)
        this._velY *= damping
        this._velX *= damping
        return
      }

      // 自动旋转阶段：沿最后惯性方向匀速自转
      this._velX = 0
      this._velY = 0
      trs.rotation.y += dtSec * AUTO_ROTATE_SPEED * this._autoDir
    },

    _clearTimer() {
      if (this._loadTimer) {
        clearTimeout(this._loadTimer)
        this._loadTimer = null
      }
    }
  }
})
