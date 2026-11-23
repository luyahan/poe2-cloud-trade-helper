# PoeQuick — macOS SwiftUI + QuickJS 查价工具

原生 macOS 菜单栏应用，用 QuickJS 内嵌 JS 引擎运行 PoE2 查价逻辑。

## 架构

```
┌─────────────────────────────────────────────┐
│  SwiftUI 菜单栏（AppKit NSStatusItem）       │
│  ├─ HotkeyManager    Cmd+Shift+D 全局热键    │
│  ├─ ClipboardReader  读取剪贴板              │
│  └─ QuickJSHost      JS 桥接                 │
└──────────────────┬──────────────────────────┘
                   │
        ┌──────────▼──────────┐
        │   QuickJS 引擎      │
        │  ├─ core.js         │  ← esbuild 打包（复用 Electron 端逻辑）
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
# 1. 打包 core.js（复用 Electron 端 JS）
./build.sh

# 2. 编译 Swift
swift build

# 3. 运行 CLI 验证
./.build/debug/PoeQuickCLI

# 4. 运行菜单栏应用
./.build/debug/PoeQuick
```

## 体积

| 组件 | 大小 |
|---|---|
| Swift 二进制（含 QuickJS）| ~1.7 MB |
| core.js | ~44 KB |
| cn-stats.compiled.js | ~740 KB |
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

Electron 端的 `parse-item.js` / `match-stats.js` / `query.js` 是 CommonJS，
QuickJS 只支持 ES Module。esbuild 打包成单文件 ESM，同时 tree-shake 掉 `node:zlib` 等 Node 特有模块。

## 后续

- [ ] Windows C# + QuickJsWasi 壳（复用同一份 core.js）
- [ ] 热更新：启动时从 CDN 拉取 core.js / compiled.js
- [ ] 悬浮窗显示价格（SwiftUI Overlay）
- [ ] Release 构建 + 公证（Notarization）
