/**
 * 市集 URL 编码（宿主能力层）
 *
 * JSON → gzip → base64url 依赖平台提供的压缩能力：
 *   - Electron：本文件用 node:zlib
 *   - PoeQuick：Swift 层调 /usr/bin/gzip
 * 算法必须一致（base64url = base64 换掉 +/ 并去掉 = 填充），否则市集解不开。
 *
 * core/query.js 只提供 buildTradeUrl（纯字符串拼接），不碰压缩，
 * 这样 core 能整份复用到 QuickJS。
 */

const zlib = require('node:zlib');
const { buildTradeUrl } = require('@poe2/core');

/** 查询对象 → base64url 载荷 */
function encodePayload(queryObj) {
  const json = JSON.stringify(queryObj);
  const gz = zlib.gzipSync(Buffer.from(json, 'utf8'));
  return gz.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * 编码成市集 URL：JSON → gzip → base64url → 拼接
 * 保持 Promise 返回，调用方 await 时不关心底层是否同步。
 */
function encodeTradeUrl(queryObj, league, host = 'poe.game.qq.com') {
  return Promise.resolve(buildTradeUrl(encodePayload(queryObj), league, host));
}

module.exports = { encodePayload, encodeTradeUrl };
