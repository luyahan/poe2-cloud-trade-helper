#!/bin/bash
# 打包 core.js：把 Electron 端的 JS 模块打包成 QuickJS 兼容的单文件
set -e
cd "$(dirname "$0")/.."

echo "[build] 打包 core.js…"
esbuild PoeQuick/Resources/core-entry.js \
  --bundle \
  --format=esm \
  --target=es2020 \
  --outfile=PoeQuick/Resources/core.js \
  --external:node:zlib \
  --external:node:fs \
  --external:node:path

echo "[build] 复制词典 bjson…"
cp ../electron/build-data/cn-stats.qjs.bin PoeQuick/Resources/cn-stats.qjs.bin

echo "[build] 完成"
ls -lh PoeQuick/Resources/
