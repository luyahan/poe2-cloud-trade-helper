# PoE2 云游戏查价工具

在云游戏里按 `Ctrl+Alt+C` 复制装备 → 自动解析 → 匹配国服词典 → 打开交易市集。

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

## Pseudo 合并

装备上一堆抗性词缀（火 45 / 冰 50 / 电 30）分开写进 AND 组，市集几乎搜不到东西——
既要有人同时满足这三条，数值还得各自达标。合并就是换成一条「总元素抗性 ≥ 125」。

规则表在 `core/pseudo.js`，语义对齐 EE2 `filterPseudo`（与同项目油猴脚本同源）：

| 建议 | 计算方式 | 默认 |
|---|---|---|
| 总元素抗性 | Σ(数值 × 该词缀覆盖的元素个数)；全抗算 3 份，双抗算 2 份 | 写入 |
| 总抗性 | 需存在「三元素+混沌」全抗词缀；全抗合计 + min(火,冰,电) | 不写入 |
| 单元素抗性 | 按元素合计，**只保留数值唯一最高的一条**（并列最高全丢） | 不写入 |
| 总混沌抗性 | 混沌合计（单混沌、双元素混沌都计入） | 不写入 |
| 总力量/敏捷/智慧 | 各自合计（全属性/双属性按完整数值计入，不倍乘） | 写入 |
| 全属性合计 / 属性总和 | 全属性词缀合计 / 所有属性来源合计（需 ≥2 源） | 不写入 |
| 总生命 / 总魔力 | 直接生命(魔力) + 力量(智慧) × 2，**必须有直接词缀** | 生命写入，魔力不写入 |
| 移动速度合计 | 移速合计；唯一来源是 implicit 时默认禁用 | 写入 |
| 石板剩余次数 | implicit 里「剩余次数：#」合计 | 写入 |

三条硬性约定（与油猴版一致）：

1. **不删除**：被合并的原词缀留在查询里，只标 `"disabled": true`。
2. **不改数**：数值全取自装备自身 roll，不是上一轮搜索条件。
3. **不猜测**：启停由固定规则表决定。

合并结果写入**第二个 `and` 组**，不塞进第一组——第一组语义是「每条精确词缀都要满足」，
合并值是同族合计，混在一起会让条件失真。默认禁用的建议不写进 URL（桌面端没有勾选面板，
写进去只是不可见的死条），但会在托盘菜单里列出来，方便确认数值。

配置项：`pseudoEnabled`（总开关）、`pseudoRangePercent`（合并值搜索下限下调 0-2%）。

> 与油猴版的实现差异：判定主键用 **stat id** 而非文本正则——国服词典文本顺序不统一
> （单元素「火焰抗性 #%」数值在后，双元素「#% 火焰与闪电抗性」数值在前），
> 正则很容易漏；stat id 跨分组跨语言稳定。

## 常用命令

```bash
npm run prepare-data     # 拉最新国服词典 + 当前联赛 → data/
npm test                 # 107 项：纯业务逻辑 + 分层边界守卫（不启动 Electron）
npm run test:host        # 4 项：Electron 宿主层（热键旁听、gzip 编码）
npm run test:all         # 上面两套一起跑（111 项）
npm run check            # 全部模块语法校验
npm run build:quickjs    # 构建 macOS 原生壳

cd electron
npm run start            # 开发态启动托盘应用（用 start.sh 亦可）
npm run dist             # 打包 .app（check → 测试 → prepare-data → 编译 → 签名）
```

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

## 各端详细文档

- 物品类别测试覆盖与待办清单：`TESTING_TODO.md`（对照 poe2db 物品分类，标注已测/未测）

- Electron 壳的坑位、打包、签名、国服 API 差异：`electron/README.md`
- 原生壳的架构、体积/性能对比、QuickJS 限制：`macos-quickjs/README.md`
