// cloudfunctions/admin/modules/modelModule.js
// 3D 模型管理模块（管理后台）
// 支持的操作:
//   model.list        获取模型列表
//   model.detail      获取模型详情
//   model.create      创建模型记录（上传后）
//   model.uploadFile  base64 文件上传（缩略图/模型文件）
//   model.update      更新模型信息
//   model.delete      删除模型（含云存储文件）
//   model.download    获取模型下载链接
const cloud = require('wx-server-sdk');

// 单文件 base64 上传大小上限（约 15MB 原始文件，base64 后约 20MB）
const MAX_BASE64_SIZE = 20 * 1024 * 1024;
// 允许的模型文件扩展名
const ALLOWED_MODEL_TYPES = ['gltf', 'glb', 'obj'];
// 允许的缩略图扩展名
const ALLOWED_IMAGE_TYPES = ['jpg', 'jpeg', 'png', 'webp'];

const modelModule = {
  /**
   * 获取模型列表
   */
  async list(db, event, admin) {
    const { skip = 0, limit = 20 } = event;

    if (typeof skip !== 'number' || skip < 0) {
      return { code: 400, msg: 'skip 参数错误' };
    }
    if (typeof limit !== 'number' || limit < 1 || limit > 100) {
      return { code: 400, msg: 'limit 参数错误，必须在 1-100 之间' };
    }

    const [countRes, listRes] = await Promise.all([
      db.collection('models').count(),
      db.collection('models')
        .skip(skip)
        .limit(limit)
        .orderBy('createdAt', 'desc')
        .get()
    ]);

    // 为缩略图换取临时访问 URL
    const fileList = listRes.data
      .filter(item => item.thumbnailFileID)
      .map(item => item.thumbnailFileID);

    let urlMap = {};
    if (fileList.length > 0) {
      try {
        const tempRes = await cloud.getTempFileURL({ fileList });
        tempRes.fileList.forEach(f => {
          if (f.status === 0) urlMap[f.fileID] = f.tempFileURL;
        });
      } catch (err) {
        console.error('获取缩略图临时 URL 失败:', err);
      }
    }

    return {
      code: 0,
      data: {
        total: countRes.total,
        list: listRes.data.map(item => ({
          _id: item._id,
          name: item.name,
          description: item.description,
          thumbnailUrl: item.thumbnailFileID ? (urlMap[item.thumbnailFileID] || '') : '',
          fileSize: item.fileSize,
          fileName: item.fileName,
          fileType: item.fileType,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt
        }))
      }
    };
  },

  /**
   * 获取模型详情
   */
  async detail(db, event, admin) {
    const { modelId } = event;

    if (!modelId) {
      return { code: 400, msg: '缺少 modelId 参数' };
    }

    const model = await db.collection('models').doc(modelId).get();

    if (!model.data) {
      return { code: 404, msg: '模型不存在' };
    }

    // 换取缩略图临时 URL
    let thumbnailUrl = '';
    if (model.data.thumbnailFileID) {
      try {
        const tempRes = await cloud.getTempFileURL({
          fileList: [model.data.thumbnailFileID]
        });
        if (tempRes.fileList[0] && tempRes.fileList[0].status === 0) {
          thumbnailUrl = tempRes.fileList[0].tempFileURL;
        }
      } catch (err) {
        console.error('获取缩略图 URL 失败:', err);
      }
    }

    const data = Object.assign({}, model.data, { thumbnailUrl });
    delete data._openid;

    return { code: 0, data };
  },

  /**
   * 创建模型记录（文件上传完成后调用）
   */
  async create(db, event, admin) {
    const { name, description, modelFileID, thumbnailFileID, fileSize, fileName } = event;

    if (!name || !modelFileID || !fileName) {
      return { code: 400, msg: '缺少必要参数：name / modelFileID / fileName' };
    }

    const fileType = fileName.split('.').pop().toLowerCase();
    if (!ALLOWED_MODEL_TYPES.includes(fileType)) {
      return { code: 400, msg: '不支持的模型格式，仅支持 ' + ALLOWED_MODEL_TYPES.join('/') };
    }

    const now = Date.now();
    const result = await db.collection('models').add({
      data: {
        name: String(name).slice(0, 100),
        description: String(description || '').slice(0, 500),
        modelFileID,
        thumbnailFileID: thumbnailFileID || '',
        fileSize: Number(fileSize) || 0,
        fileName: String(fileName).slice(0, 200),
        fileType,
        createdAt: now,
        updatedAt: now
      }
    });

    return {
      code: 0,
      data: { modelId: result._id }
    };
  },

  /**
   * base64 文件上传（供管理后台上传缩略图/模型文件）
   * kind: 'thumbnail' | 'model'
   */
  async uploadFile(db, event, admin) {
    const { kind, fileName, fileBase64 } = event;

    if (!kind || !fileName || !fileBase64) {
      return { code: 400, msg: '缺少必要参数：kind / fileName / fileBase64' };
    }

    const ext = fileName.split('.').pop().toLowerCase();

    if (kind === 'model' && !ALLOWED_MODEL_TYPES.includes(ext)) {
      return { code: 400, msg: '模型格式不支持，仅支持 ' + ALLOWED_MODEL_TYPES.join('/') };
    }
    if (kind === 'thumbnail' && !ALLOWED_IMAGE_TYPES.includes(ext)) {
      return { code: 400, msg: '图片格式不支持，仅支持 ' + ALLOWED_IMAGE_TYPES.join('/') };
    }
    if (kind !== 'model' && kind !== 'thumbnail') {
      return { code: 400, msg: 'kind 参数必须为 model 或 thumbnail' };
    }

    if (fileBase64.length > MAX_BASE64_SIZE) {
      return { code: 400, msg: '文件过大，base64 上传限制约 15MB 原始文件' };
    }

    let buffer;
    try {
      buffer = Buffer.from(fileBase64, 'base64');
    } catch (err) {
      return { code: 400, msg: 'base64 解码失败' };
    }

    const cloudPath = `models/${kind}s/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const uploadRes = await cloud.uploadFile({
      cloudPath,
      fileContent: buffer
    });

    return {
      code: 0,
      data: {
        fileID: uploadRes.fileID,
        fileSize: buffer.length
      }
    };
  },

  /**
   * 更新模型信息
   */
  async update(db, event, admin) {
    const { modelId, name, description } = event;

    if (!modelId) {
      return { code: 400, msg: '缺少 modelId 参数' };
    }

    const model = await db.collection('models').doc(modelId).get();

    if (!model.data) {
      return { code: 404, msg: '模型不存在' };
    }

    const updateData = { updatedAt: Date.now() };
    if (name) updateData.name = String(name).slice(0, 100);
    if (description !== undefined) updateData.description = String(description).slice(0, 500);

    await db.collection('models').doc(modelId).update({
      data: updateData
    });

    return { code: 0, msg: '更新成功' };
  },

  /**
   * 删除模型（含云存储文件）
   */
  async delete(db, event, admin) {
    const { modelId } = event;

    if (!modelId) {
      return { code: 400, msg: '缺少 modelId 参数' };
    }

    const model = await db.collection('models').doc(modelId).get();

    if (!model.data) {
      return { code: 404, msg: '模型不存在' };
    }

    // 删除云存储文件（模型本体 + 缩略图）
    const fileIDs = [];
    if (model.data.modelFileID) fileIDs.push(model.data.modelFileID);
    if (model.data.thumbnailFileID) fileIDs.push(model.data.thumbnailFileID);

    if (fileIDs.length > 0) {
      try {
        await cloud.deleteFile({ fileList: fileIDs });
      } catch (err) {
        console.error('删除云存储文件失败:', err);
        // 不中断流程，继续删除数据库记录
      }
    }

    await db.collection('models').doc(modelId).remove();

    return { code: 0, msg: '删除成功' };
  },

  /**
   * 获取模型下载链接
   */
  async download(db, event, admin) {
    const { modelId } = event;

    if (!modelId) {
      return { code: 400, msg: '缺少 modelId 参数' };
    }

    const model = await db.collection('models').doc(modelId).get();

    if (!model.data || !model.data.modelFileID) {
      return { code: 404, msg: '模型文件不存在' };
    }

    const tempRes = await cloud.getTempFileURL({
      fileList: [{ fileID: model.data.modelFileID, maxAge: 600 }]
    });

    const fileItem = tempRes.fileList && tempRes.fileList[0];
    if (!fileItem || fileItem.status !== 0) {
      return { code: -1, msg: '获取下载链接失败' };
    }

    return {
      code: 0,
      data: {
        url: fileItem.tempFileURL,
        fileName: model.data.fileName
      }
    };
  }
};

module.exports = modelModule;
