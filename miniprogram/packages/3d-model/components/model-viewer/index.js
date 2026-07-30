// miniprogram/packages/3d-model/components/model-viewer/index.js
// 3D 模型展示组件：基于 three-platformize（three.js 微信小程序版）
// 属性:
//   modelPath  本地模型文件路径（wx.downloadFile 返回的临时路径）
//   fileName   模型文件名（用于判断 gltf/glb/obj 格式）
import { WechatPlatform } from '../../assets/three-platformize/src/WechatPlatform/index'
import * as THREE from '../../assets/three-platformize/build/three.module'

Component({
  properties: {
    modelPath: {
      type: String,
      value: '',
      observer(newVal) {
        if (newVal && this.data.ready) {
          this._loadModel(newVal)
        }
      }
    },
    fileName: {
      type: String,
      value: ''
    }
  },

  data: {
    ready: false
  },

  lifetimes: {
    ready() {
      this._setupCanvas()
    },
    detached() {
      this._dispose()
    }
  },

  methods: {
    _setupCanvas() {
      const query = this.createSelectorQuery()
      query.select('#modelViewerCanvas')
        .node()
        .boundingClientRect()
        .exec(res => {
          if (!res || !res[0] || !res[0].node) {
            console.error('model-viewer: Canvas 节点未找到')
            this.triggerEvent('error', { message: '渲染初始化失败' })
            return
          }
          this._canvas = res[0].node
          this._initScene(res[0].node, res[1].width, res[1].height)
        })
    },

    _initScene(canvas, width, height) {
      try {
        // 初始化微信平台适配层（注入 URL/Blob/atob/XMLHttpRequest 等）
        this._platform = new WechatPlatform(canvas)

        const pixelRatio = wx.getWindowInfo
          ? wx.getWindowInfo().pixelRatio
          : wx.getSystemInfoSync().pixelRatio

        this._renderer = new THREE.WebGLRenderer({
          canvas: canvas,
          antialias: true,
          alpha: true
        })
        this._renderer.setSize(width, height)
        this._renderer.setPixelRatio(pixelRatio)
        this._renderer.setClearColor(0x1a1a2e, 1)

        this._scene = new THREE.Scene()

        this._camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000)
        this._camera.position.set(0, 1, 4)
        this._camera.lookAt(0, 0, 0)

        // 灯光
        this._scene.add(new THREE.AmbientLight(0xffffff, 0.6))

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.9)
        dirLight.position.set(5, 10, 7)
        this._scene.add(dirLight)

        const backLight = new THREE.DirectionalLight(0x8899ff, 0.4)
        backLight.position.set(-5, -3, -5)
        this._scene.add(backLight)

        // 网格地面
        this._scene.add(new THREE.GridHelper(10, 20, 0x444466, 0x333355))

        this.setData({ ready: true })

        // 如果 modelPath 已经传入，立即加载
        if (this.data.modelPath) {
          this._loadModel(this.data.modelPath)
        }

        this._animate()
      } catch (err) {
        console.error('model-viewer: Three.js 初始化失败', err)
        this.triggerEvent('error', { message: '初始化失败' })
      }
    },

    _loadModel(modelPath) {
      const fileType = (this.data.fileName || '').split('.').pop().toLowerCase()
      const fs = wx.getFileSystemManager()

      try {
        const data = fs.readFileSync(modelPath)
        const arrayBuffer = data instanceof ArrayBuffer ? data : data.buffer

        if (fileType === 'glb' || fileType === 'gltf') {
          this._parseGLTF(arrayBuffer)
        } else if (fileType === 'obj') {
          this._parseOBJ(this._arrayBufferToString(arrayBuffer))
        } else {
          this.triggerEvent('error', { message: '不支持的模型格式' })
        }
      } catch (err) {
        console.error('model-viewer: 读取模型文件失败', err)
        this._addPlaceholder()
      }
    },

    _parseGLTF(arrayBuffer) {
      import('../../assets/three-platformize/examples/jsm/loaders/GLTFLoader').then(module => {
        const { GLTFLoader } = module
        const loader = new GLTFLoader()

        loader.parse(arrayBuffer, '', gltf => {
          this._mountModel(gltf.scene)
        }, err => {
          console.error('model-viewer: GLTF 解析失败', err)
          this._addPlaceholder()
        })
      }).catch(err => {
        console.error('model-viewer: GLTFLoader 加载失败', err)
        this._addPlaceholder()
      })
    },

    _parseOBJ(text) {
      import('../../assets/three-platformize/examples/jsm/loaders/OBJLoader').then(module => {
        const { OBJLoader } = module
        const loader = new OBJLoader()
        const object = loader.parse(text)
        this._mountModel(object)
      }).catch(err => {
        console.error('model-viewer: OBJLoader 加载失败', err)
        this._addPlaceholder()
      })
    },

    // 模型居中缩放后挂载到场景
    _mountModel(object) {
      if (!this._scene) return

      const box = new THREE.Box3().setFromObject(object)
      const size = box.getSize(new THREE.Vector3()).length()
      const center = box.getCenter(new THREE.Vector3())

      object.position.x -= center.x
      object.position.y -= center.y
      object.position.z -= center.z

      const scale = 2.5 / (size || 1)
      object.scale.setScalar(scale)

      this._model = object
      this._scene.add(object)
      this.triggerEvent('loaded')
    },

    // 占位几何体（模型解析失败时显示）
    _addPlaceholder() {
      if (!this._scene) return
      const geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5)
      const material = new THREE.MeshPhongMaterial({
        color: 0x1890ff,
        transparent: true,
        opacity: 0.85
      })
      this._model = new THREE.Mesh(geometry, material)
      this._scene.add(this._model)
      this.triggerEvent('loaded')
    },

    _arrayBufferToString(buffer) {
      const uint8 = new Uint8Array(buffer)
      let result = ''
      const chunkSize = 8192
      for (let i = 0; i < uint8.length; i += chunkSize) {
        result += String.fromCharCode.apply(null, uint8.subarray(i, i + chunkSize))
      }
      return decodeURIComponent(escape(result))
    },

    _animate() {
      if (!this._renderer || !this._scene || !this._camera || !this._canvas) return

      this._animationId = this._canvas.requestAnimationFrame(this._animate.bind(this))

      if (this._model && !this._isTouching) {
        this._model.rotation.y += 0.005
      }

      this._renderer.render(this._scene, this._camera)
    },

    // 触摸旋转
    onTouchStart(e) {
      if (e.touches.length === 1) {
        this._isTouching = true
        this._touchX = e.touches[0].x
        this._touchY = e.touches[0].y
      }
    },

    onTouchMove(e) {
      if (!this._model || !this._isTouching || e.touches.length !== 1) return

      const deltaX = e.touches[0].x - this._touchX
      const deltaY = e.touches[0].y - this._touchY

      this._model.rotation.y += deltaX * 0.01
      this._model.rotation.x += deltaY * 0.01

      this._touchX = e.touches[0].x
      this._touchY = e.touches[0].y
    },

    onTouchEnd() {
      this._isTouching = false
    },

    _dispose() {
      if (this._animationId && this._canvas) {
        this._canvas.cancelAnimationFrame(this._animationId)
      }
      if (this._renderer) {
        this._renderer.dispose()
        if (this._renderer.forceContextLoss) this._renderer.forceContextLoss()
      }
      if (this._platform) {
        this._platform.dispose()
      }
      this._scene = null
      this._camera = null
      this._renderer = null
      this._model = null
      this._canvas = null
    }
  }
})
