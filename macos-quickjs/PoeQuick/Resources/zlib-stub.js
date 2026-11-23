// QuickJS stub for node:zlib（gzip 由宿主 Swift 层处理）
module.exports = {
  gzipSync() {
    throw new Error('node:zlib 在 QuickJS 中不可用，请由宿主层处理 gzip');
  },
};
