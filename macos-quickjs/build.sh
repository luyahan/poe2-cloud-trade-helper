#!/bin/bash
# 打包 QuickJS 共用的核心脚本，并同步编译期词典到两个 Swift target。
set -e
cd "$(dirname "$0")"

echo "[build] 打包 core.js…"
esbuild PoeQuick/Resources/core-entry.js \
  --bundle \
  --format=esm \
  --target=es2020 \
  --alias:node:zlib=./PoeQuick/Resources/zlib-stub.js \
  --outfile=PoeQuick/Resources/core.js

cp PoeQuick/Resources/core.js PoeQuickCLI/Resources/core.js
cp ../electron/build-data/cn-stats.compiled.js PoeQuick/Resources/cn-stats.compiled.js
cp ../electron/build-data/cn-stats.compiled.js PoeQuickCLI/Resources/cn-stats.compiled.js

echo "[build] 编译 Swift…"
swift build
ls -lh PoeQuick/Resources/core.js PoeQuick/Resources/cn-stats.compiled.js .build/debug/PoeQuick
