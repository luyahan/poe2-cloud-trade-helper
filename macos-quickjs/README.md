# PoeQuick — macOS AppKit + QuickJS 查价工具

原生纯 AppKit 菜单栏应用，无窗口、无 Dock 图标，用 QuickJS 内嵌 JS 引擎运行 PoE2 查价逻辑。

## 架构

```
┌─────────────────────────────────────────────┐
│  AppKit NSStatusItem（纯菜单栏）            │
│  ├─ HotkeyManager    Ctrl+Alt+C 只读监听     │
│  │                   延迟 600ms 读剪贴板      │
│  ├─ ClipboardReader  读取剪贴板              │
│  └─ QuickJSHost      JS 桥接                 │
└──────────────────┬──────────────────────────┘
                   │
        ┌──────────▼──────────┐
        │   QuickJS 引擎      │
        │  ├─ core.js         │  ← esbuild 打包（仓库根 core/，@poe2/core）
        │  │  ├─ parse-item   │
        │  │  ├─ match-stats  │
        │  │  └─ query        │
        │  └─ compiledDict    │  ← 编译期生成的 JS 字面量（Map 结构）
        └─────────────────────┘
                   │
        ┌──────────▼──────────┐
        │  Swift gzip + URL   │
        │  打开浏览器          │
        └─────────────────────┘
```

## 构建

```bash
# 前置：词典数据由仓库根统一生成（首次或换了赛季时跑一次）
(cd .. && npm run prepare-data)

# build.sh 内部完成：esbuild 打 core.js → 同步词典 → swift build
./build.sh

# 运行 CLI 验证（解析 → 匹配 → 构造查询 → 出 URL）
./.build/debug/PoeQuickCLI

# 运行菜单栏应用
./.build/debug/PoeQuick
```

> `build.sh` 里 `swift build` 带 `--disable-sandbox`：SwiftPM 在受限环境
> （CI、sandbox 内）无法 apply 自身沙箱，会报 `Invalid manifest`。

## 触发流程与权限

`Ctrl+Alt+C` 使用 `CGEventTap` 的 `.listenOnly` 模式，**不消费、不拦截按键**，云游戏仍会收到复制指令。命中后等待与 Electron 默认一致的 **600ms**，再读取本机剪贴板、确认是装备文本、构造查询并打开市集。菜单栏“解析剪贴板”可跳过等待手动执行同一查价流程。

需在“系统设置 → 隐私与安全性 → 辅助功能”中允许 PoeQuick（裸二进制开发运行时授权终端），授权后重启应用。未授权时菜单会提示“热键监听未授权”，不影响手动解析剪贴板。

## 体积

| 组件 | 大小 |
|---|---|
| Swift 二进制（含 QuickJS）| ~1.7 MB |
| core.js | ~44 KB |
| cn-stats.compiled.js | ~1.0 MB |
| **总计** | **~2.5 MB** |

## 性能

| 阶段 | 耗时 |
|---|---|
| 初始化（QuickJS + core.js + 词典）| ~160 ms |
| 单次查询（parse + match + buildQuery + gzip）| ~74 ms |
| 内存常驻 | ~20 MB |

## 与 Electron 对比

| 维度 | Electron | PoeQuick |
|---|---|---|
| 包体积 | ~80 MB | **~2.5 MB** |
| 启动时间 | ~500 ms | **~160 ms** |
| 内存常驻 | ~150 MB | **~20 MB** |
| 跨平台代码复用 | JS 全栈 | JS（core.js）+ Swift 壳 |
| 热更新 | 替换 ASAR | **直接换 core.js / compiled.js** |

## 关键决策

### 为什么用 JS 字面量而非 bjson？

bellard 原版 QuickJS 的 `JS_WriteObject` **不支持 Map/Set**（只有 QuickJS-NG 加了支持）。
QuickJS-Swift 1.0.0 用 bellard 原版，所以：
- ❌ 不能用 `qjs:bjson` 模块
- ❌ 不能用 `JS_WriteObject` 序列化 Map
- ✅ **用 JS 字面量**：编译期把 compiled 写成 `new Map([...])` 的 JS 源码，启动时 QuickJS 直接 evaluate，~5ms。

### 为什么 gzip 放在 Swift 层？

QuickJS 没有 `node:zlib`，且纯 JS gzip 实现体积大（~30KB）。
Swift 层直接调 `/usr/bin/gzip`，零依赖。

### 为什么 core.js 用 esbuild 打包？

业务逻辑收在**仓库根 `core/`**（独立包 `@poe2/core`：`parse-item` / `match-stats` / `query` /
`weapon-dps` / `defences` / `map-mods` / `item-text`），该目录刻意保持零平台依赖，
是 CommonJS 但可整份移植。QuickJS 只支持 ES Module，esbuild 打包成单文件 ESM。

本目录与 `electron/` 之间**不存在代码或数据依赖**：
- 代码：`core-entry.js` 直接 import 仓库根 `../../../core/*.js`
- 数据：词典从仓库根 `../data/` 取，由根级 `npm run prepare-data` 统一生成

gzip 是唯一原本卡住移植的地方：`query.js` 里已把 `encodeTradeUrl` 换成纯字符串拼接的
`buildTradeUrl`，压缩下沉到各宿主（Electron 用 `host/encode.js` 的 node:zlib，这里用 Swift 调
`/usr/bin/gzip`）。所以连 `zlib-stub` 都已不再需要——它是历史残留，留着只为兼容旧构建脚本。

## 后续

- [ ] Windows C# + QuickJsWasi 壳（复用同一份 core.js）
- [ ] 热更新：启动时从 CDN 拉取 core.js / compiled.js
- [ ] 用菜单栏展示查价详情，保持无独立窗口
- [ ] Release 构建 + 公证（Notarization）
