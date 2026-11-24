#!/bin/bash
# 打包 QuickJS 共用的核心脚本，并同步编译期词典到两个 Swift target。
#
# core 业务逻辑来自仓库根 core/（独立包 @poe2/core），词典数据来自仓库根 data/。
# 本目录与 electron/ 之间不存在任何代码或数据依赖。
set -e
cd "$(dirname "$0")"

echo "[build] 打包 core.js…"
esbuild PoeQuick/Resources/core-entry.js \
  --bundle \
  --format=esm \
  --target=es2020 \
  --outfile=PoeQuick/Resources/core.js

cp PoeQuick/Resources/core.js PoeQuickCLI/Resources/core.js

DICT="../data/cn-stats.compiled.js"
if [ ! -f "$DICT" ]; then
  echo "[build] 错误：找不到 $DICT，请先在仓库根运行 npm run prepare-data" >&2
  exit 1
fi
cp "$DICT" PoeQuick/Resources/cn-stats.compiled.js
cp "$DICT" PoeQuickCLI/Resources/cn-stats.compiled.js

echo "[build] 编译 Swift…"
# --disable-sandbox：SwiftPM 在受限环境（CI/沙箱）里无法 apply 自身沙箱，会报 Invalid manifest
swift build --disable-sandbox
ls -lh PoeQuick/Resources/core.js PoeQuick/Resources/cn-stats.compiled.js .build/debug/PoeQuick
