#!/bin/bash
# 打包 QuickJS 共用的核心脚本，并同步编译期词典到两个 Swift target。
#
# core 业务逻辑来自仓库根 core/（独立包 @poe2/core），词典数据来自仓库根 data/。
# 本目录与 electron/ 之间不存在任何代码或数据依赖。
set -e
cd "$(dirname "$0")"

echo "[build] 打包 core.js…"

# esbuild 发现顺序：PATH → 仓库根 node_modules → npx 临时拉取。
# 它不是本目录的 npm 依赖（PoeQuick 用 SwiftPM 管理，不装 node_modules），
# 所以不能假设 PATH 里一定有；但缺失时应给出明确提示，而不是 "command not found"。
# 注意：本目录与 electron/ 零依赖（架构守卫 test/architecture.test.js 强制），
# 因此不要到 electron/node_modules 下借二进制。
if command -v esbuild >/dev/null 2>&1; then
  ESBUILD=(esbuild)
elif [ -x ../node_modules/.bin/esbuild ]; then
  ESBUILD=(../node_modules/.bin/esbuild)
elif command -v npx >/dev/null 2>&1; then
  # --yes 免交互确认；--package 只临时使用，不写入任何 package.json
  ESBUILD=(npx --yes --package esbuild@0.28.2 esbuild)
else
  echo "[build] 错误：找不到 esbuild，也没有 npx 可用。" >&2
  echo "       任选其一：npm i -g esbuild   或   brew install esbuild" >&2
  exit 1
fi

"${ESBUILD[@]}" PoeQuick/Resources/core-entry.js \
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
