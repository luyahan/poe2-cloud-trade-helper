#!/bin/bash
# 启动 PoE2 查价托盘助手
# 注意：必须清除 ELECTRON_RUN_AS_NODE，否则 Electron 会退化成纯 Node 导致 app undefined
# （从 WorkBuddy 等 Electron 应用的终端启动时，该变量常被继承）
cd "$(dirname "$0")"
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron . "$@"
