// cloudfunctions/modelLibrary/index.js
// 3D 模型库云函数（用户端）
// action 列表:
//   user.listModels     获取模型列表（公开，无需管理员）
//   user.downloadModel  获取模型临时下载链接
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { action } = event;

  if (!action) {
    return { code: 400, msg: '缺少 action 参数' };
  }

  const handlers = {
    'user.listModels': listModels,
    'user.downloadModel': downloadModel
  };

  const handler = handlers[action];
  if (!handler) {
    return { code: -1, msg: '未知的操作类型：' + action };
  }

  try {
    return await handler(db, cloud, event);
  } catch (err) {
    console.error('modelLibrary error [' + action + ']:', err);
    return {
      code: -1,
      msg: '服务器异常：' + (err.message || '未知错误')
    };
  }
};

/**
 * 获取模型列表（用户端）
 */
async function listModels(db, cloud, event) {
  const { skip = 0, limit = 20 } = event;

  if (typeof skip !== 'number' || skip < 0) {
    return { code: 400, msg: 'skip 参数错误' };
  }
  if (typeof limit !== 'number' || limit < 1 || limit > 100) {
    return { code: 400, msg: 'limit 参数错误，必须在 1-100 之间' };
  }

  const result = await db.collection('models')
    .skip(skip)
    .limit(limit)
    .orderBy('createdAt', 'desc')
    .get();

  // 为缩略图换取临时访问 URL
  const fileList = result.data
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
    data: result.data.map(item => ({
      _id: item._id,
      name: item.name,
      description: item.description,
      thumbnailUrl: item.thumbnailFileID ? (urlMap[item.thumbnailFileID] || '') : '',
      fileSize: item.fileSize,
      fileName: item.fileName,
      fileType: item.fileType
    }))
  };
}

/**
 * 获取模型临时下载链接（用户端）
 */
async function downloadModel(db, cloud, event) {
  const { modelId } = event;

  if (!modelId) {
    return { code: 400, msg: '缺少 modelId 参数' };
  }

  const model = await db.collection('models').doc(modelId).get();
  if (!model.data) {
    return { code: 404, msg: '模型不存在' };
  }

  if (!model.data.modelFileID) {
    return { code: 404, msg: '模型文件不存在' };
  }

  // 换取临时下载 URL（maxAge 单位秒）
  const tempRes = await cloud.getTempFileURL({
    fileList: [{ fileID: model.data.modelFileID, maxAge: 600 }]
  });

  const fileItem = tempRes.fileList && tempRes.fileList[0];
  if (!fileItem || fileItem.status !== 0) {
    return { code: -1, msg: '获取下载链接失败' };
  }

  return {
    code: 0,
    url: fileItem.tempFileURL,
    fileName: model.data.fileName,
    fileSize: model.data.fileSize
  };
}
