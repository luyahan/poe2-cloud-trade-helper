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

# ── 打包 .app ────────────────────────────────────────────────────────────
# SwiftPM 只产出裸可执行文件，这里套一个 bundle 壳，得到可双击启动 / open 启动的
# PoE2PriceHelper.app（Finder / 菜单栏 / 程序坞显示 CFBundleDisplayName
# 「PoE2 查价助手」）。.app 是构建产物，被根 .gitignore 的 *.app 忽略，不入库；
# 入库的是 Info.plist 模板。Swift 侧 Bundle.main 优先读 .app 内资源，
# 回落到 Bundle.module（裸二进制走 SwiftPM 资源包），两种形态共用同一份代码。
# 文件名用英文（命令行 open / 脚本路径免转义），显示名用中文。
echo "[build] 打包 PoE2PriceHelper.app…"
APP="PoE2PriceHelper.app"
BIN=".build/debug/PoeQuick"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp Info.plist "$APP/Contents/Info.plist"
cp "$BIN" "$APP/Contents/MacOS/PoeQuick"
cp PoeQuick/Resources/core.js "$APP/Contents/Resources/core.js"
cp PoeQuick/Resources/cn-stats.compiled.js "$APP/Contents/Resources/cn-stats.compiled.js"
# ad-hoc 签名：本地开发足够，无开发者证书也能通过 Gatekeeper 的本机校验。
codesign --force --deep --sign - "$APP" 2>/dev/null || \
  echo "[build] 警告：codesign 失败，.app 仍可直接运行（仅本机）" >&2
echo "[build] 完成：$APP（双击或 open $APP 启动）"
ls -lh "$APP/Contents/MacOS/PoeQuick"
