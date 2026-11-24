# 架构与分层

## 仓库结构

仓库由三块组成，业务逻辑只有一份，两个壳共用：

```
core/            @poe2/core —— 纯业务逻辑，零平台依赖（Node / QuickJS 均可跑）
  parse-item.js    国服简中装备文本解析
  match-stats.js   词缀模板 → 真实 trade id 匹配（含词典编译/序列化）
  query.js         匹配结果 → trade2 查询 JSON
  pseudo.js        同族词缀合并（总抗/总属性/总生命，来源保留只禁用）
  weapon-dps.js    q20 武器面板 DPS + 伤害/攻速/暴击面板过滤
  defences.js      装备防御面板 → equipment_filters
  map-mods.js      引路石面板 → map_filters
  item-text.js     剪贴板文本特征识别
  index.js         统一入口 + buildPricedQuery 便捷流程

electron/        Electron 托盘壳（macOS 菜单栏 / Windows 通知区）
  src/host/        平台能力：主进程、热键旁听、gzip 编码、设置持久化
  src/ui/          视图：设置窗口 HTML + preload IPC
  test/host.test.js  仅宿主层测试（热键、编码）

macos-quickjs/   macOS 原生壳（AppKit + QuickJS，~2.5MB）
  PoeQuick/        菜单栏应用（CGEventTap 旁听热键）
  PoeQuickCLI/     命令行验证入口

data/            所有数据（词典、联赛元信息、真实样本），根级脚本统一生成
scripts/         prepare-data.js：拉取国服词典与当前联赛
test/            纯业务逻辑测试（不启动 Electron）
prototypes/      早期原型，死代码，不参与运行
```

## data/ 里有什么

| 文件 | 用途 | 生成方式 |
|---|---|---|
| `cn-stats.json` | 词缀词典原始数据 | `npm run prepare-data` |
| `cn-stats.compiled.json` | 预建索引（数组元组，跨引擎通用） | 同上 |
| `cn-stats.compiled.js` | 同上内容的 JS 字面量（QuickJS 直接 evaluate） | 同上 |
| `build-meta.json` | 拉取时间 + 当前联赛 | 同上 |
| `cn-filters.json` | 国服 filters 枚举存档（filter 分组/中文类别的权威依据） | 手工存档 |
| `sample-item.txt` | 真实稀有单手锤样本（8 词缀，含亵渎/打造） | 手工 |
| `sample-spear.txt` | 真实战矛样本（基底属性/混合词缀/技能） | 手工 |
| `sample-hateforge.txt` | 真实腐化传奇样本（区域护甲/瓦尔词缀/正负区间） | 手工 |

## 依赖方向

单向，无环：

```
electron/src/ui  →  electron/src/host  →  core/  ←  macos-quickjs（经 core-entry.js + esbuild）
```

- `core/` 不认识任何宿主：没有 `node:*`、没有 `electron`、没有 `uiohook`，也不读数据文件。
  唯一的平台能力（gzip 压缩）已下沉到宿主：Electron 用 `host/encode.js`（node:zlib），
  Swift 用 `/usr/bin/gzip`；`core/query.js` 只提供纯字符串的 `buildTradeUrl`。
- `macos-quickjs/` 与 `electron/` 之间**零依赖**：代码引用仓库根 `core/`，数据引用仓库根 `data/`。

## 测试为什么分两处

- **`test/`（仓库根）** 只测 `core/`，完全不碰 Electron。`require('electron')` 在这里是禁忌，
  所以这 107 项在任何有 Node 的环境都能跑（CI 不需要图形环境）。
- **`electron/test/`** 只测进入 Electron 之后才存在的能力：uiohook 热键旁听、node:zlib 编码。
  这些天然依赖宿主，放根目录会让 core 测试失去「纯 Node 可跑」的性质。

## 为什么要这样分

`macos-quickjs` 需要一个 2.5MB 的原生壳替代 80MB 的 Electron（云端/低配机器友好）。
它复用的方式是把业务逻辑 esbuild 成单文件 ESM 塞进 QuickJS。只要 `core/` 里混进一个
`require('node:zlib')`，原生壳立刻编译不过——所以 core 必须物理上独立，而不是
「放在 electron 里但约定不引用」。

这条边界现在由 `test/architecture.test.js` 的 16 项测试守卫，不是靠自觉。
