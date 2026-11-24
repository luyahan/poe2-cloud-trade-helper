# PoE2 云游戏查价托盘助手

菜单栏常驻小工具：在云游戏里复制装备 → 自动解析 → 匹配国服词典 → 打开交易市集。

## 监听方式：仅热键旁听

云游戏的游戏进程跑在**远程服务器**，本地 Mac 只是视频流客户端。云游戏会把远端剪贴板同步
回本地——你在游戏里按 `Ctrl+Alt+C`（高级复制），装备文本就出现在本地剪贴板。

助手用 uiohook **旁听**全局 Ctrl+Alt+C（只监听不拦截），命中后延迟读剪贴板。
**没有轮询模式**：macOS 未授予辅助功能权限、或热键启动失败时，弹窗提醒原因后**直接退出**。

### ⚠️ 热键为什么必须「旁听」而不是「注册」

云游戏下 Ctrl+Alt+C **必须原样传到远端游戏**才会触发复制。若用 Electron
`globalShortcut.register('Ctrl+Alt+C')` 会**吞掉按键**，游戏收不到复制指令、剪贴板不更新，
功能失效。所以用 `uiohook-napi`（EE2 同款）的全局钩子 **listen-only**：监听到组合键后
**不消费按键**，让它继续传给云游戏→远端复制→剪贴板同步回本地，再延迟 `readDelayMs`
（默认 600ms）读剪贴板。

### 热键模式授权（macOS）

系统设置 → 隐私与安全性 → **辅助功能** → 勾选「PoE2查价助手」（开发态为 Electron 或启动它的终端）。
授权后**重启应用**。未授权时启动会弹系统授权提示 + 错误对话框说明原因，然后退出。
Windows 无此门槛。

## 流水线

```
云游戏 Ctrl+Alt+C → 热键旁听命中 → 延迟读本地剪贴板 → 解析(parse-item)
  → 匹配国服词典(match-stats) → 构造查询(query) → gzip+base64url → open 市集
```

- **解析**：国服简中高级复制文本。tier 标签是 `(等阶：N)`，前缀/后缀是 `前缀属性/后缀属性`，
  亵渎/打造是 `亵渎的/打造的`。处理重复粘贴去重、rune 词缀、数值区间 `90 (88-101)`。
- **匹配**：词典来自 `https://poe.game.qq.com/api/trade2/data/stats`（简中，无需登录，
  自动缓存 24h）。按词缀类型查对应分组（亵渎→desecrated、打造→crafted、rune→rune），
  文本归一化（数值→#、压空格、剥类型后缀）后精确匹配，避免「击中/击败」误配。亵渎、打造、
  破裂词缀查价优先映射为 explicit id，符合国服在售装备的实际索引方式。
- **查询策略**（对齐 EE2 exact 预设）：T1/T2 词缀默认启用，T3+ 默认禁用；rune/implicit
  默认禁用；roll 取 min 端做下限；按「物品类别」字段映射类别 + 稀有度 + ilvl 过滤。
- **武器面板 DPS**（EE2 口径）：可修改武器的物理伤害按 q20 反推基础值后计算，
  `B=P/((1+Q/100)(1+I/100))-F`，再以 `B+F` 施加物理提高与品质；腐化装备保留原品质。
  元素 DPS 只含火/冰/电，攻速取当前面板。不计算暴击、混沌、技能倍率、人物天赋、命中、
  抗性或战弩装填时间。物理、元素和总 DPS 会显示在托盘的最近解析结果中，可复制完整
  计算明细。纯物理武器写入 `equipment_filters.pdps`，有元素伤害时同时写入
  `dps`、`pdps`（有物理面板时）和 `edps`，并带 `equipment_filters.disabled:false`；
  用户实测国服 URL 确认三项可并存。每项默认下限是各自计算值下调 2% 后向下取整，
  并不低于理论最低 roll。计算值保留在 `weaponDps`，与 `dpsMin` 手动阈值相互独立；
  `pdpsMin`、`edpsMin` 可单独覆盖对应阈值。设置中可关闭 DPS 筛选（保留计算展示），
  并配置 0–2% 的搜索下调比例；攻速只按词缀范围反推，不按品质放大。
- **武器原始面板字段**（市集装备过滤器截图口径，2026-11-24 回归）：`damage`（伤害）=
  q20 物理均值 + 火/冰/电面板均值之和；`aps`（每秒攻击次数）、`crit`（暴击几率）直接取
  面板值。三者精确写入（两位小数截断，不做百分比下调），与截图基准一致
  （样本锤：伤害 331 / 攻速 1.91 / 暴击 5）。`damageMin`/`apsMin`/`critMin` 可覆盖，
  `panel:false` 可整体关闭（不影响 dps/pdps/edps 下限）。无暴击行不虚构 crit。
- **传奇名称分列**：传奇装备 `name` 写传奇名、`type` 写基底名；稀有装备只写基底名。
- **交易状态固定任意**：始终 `status:{option:"any"}`，不提供在线状态选项。
- **⚠️ 载荷必须是扁平结构**：国服 trade2 URL 解码后是 `{status, stats, filters}` 直接在
  顶层，**没有** `{query:{...}, sort:{...}}` 包裹（以真实国服 URL 解码为准）。包错结构
  市集会报「无法使用搜索」。
- **⚠️ 国服 filters 分组与国际服不同**：以 `/api/trade2/data/filters`（已存档
  `data/cn-filters.json`）为权威——`ilvl`/`quality` 在 **type_filters**（EE2/国际服放
  misc_filters）；category 中文对照也不同（国服 warstaff=节杖、sceptre=短杖、flail=连枷）。
- **⚠️ 亵渎/打造/破裂词缀用 explicit id 查价**：市集在售装备按普通外延词缀索引，
  `desecrated.*`/`crafted.*` 分组只命中特殊状态挂单。匹配器对这三类优先取 explicit
  变体（EE2 `initUiModFilters` 同款策略，用户实测可用 URL 佐证）。
- **pseudo 合并在 core 层做**（`core/pseudo.js`）：同族抗性/属性/生命词缀合成一条合计筛选，
  写入第二个 `and` 组，来源词缀保留但标 `disabled: true`。规则移植自同项目油猴脚本
  （`userscript/docs/QUERY_OPTIMIZATION.md`），但判定主键改用 stat id —— 国服词典文本顺序
  不统一（单元素「火焰抗性 #%」数值在后，双元素「#% 火焰与闪电抗性」数值在前），文本正则容易漏。
  开关见设置项 `pseudoEnabled` / `pseudoRangePercent`。

## 安装与运行（开发态）

```bash
cd /Users/luyahan/Documents/Work/poe/poe2-cloud-trade-helper/electron
npm install          # 安装 Electron + electron-builder
./start.sh           # 启动（已处理 ELECTRON_RUN_AS_NODE 坑）
```

## 编译打包（.app）

```bash
cd /Users/luyahan/Documents/Work/poe/poe2-cloud-trade-helper/electron
npm run dist         # 一键：语法检查 → 全部测试 → 拉最新数据 → 编译 .app → 签名
```

`predist` 自动执行仓库根的 `scripts/prepare-data.js`：
- 从 `https://poe.game.qq.com/api/trade2/data/stats` **重新拉取词缀词典**
- 从 `/api/trade2/data/leagues` **获取当前联赛**（第一个非专家 poe2 联赛）
- 写入仓库根 `data/`，随 app 打进 `Resources/build-data/`

`sign-app.js` 对产物做 ad-hoc 签名（含 entitlements），解决新 macOS 上
Electron V8 JIT 被拒导致的闪退。

产物：`dist/mac-arm64/PoE2查价助手.app`（已签名，可直接运行）。

**安装**（用 ditto 保留符号链接，不要用 Finder 拖拽）：
```bash
ditto "dist/mac-arm64/PoE2查价助手.app" "/Applications/PoE2查价助手.app"
open "/Applications/PoE2查价助手.app"
```

> ⚠️ 不要用 DMG 分发：hdiutil 会把 framework 里的相对符号链接改写成
> 绝对路径，导致安装后 `icudtl.dat not found`、GPU 进程崩溃、app 闪退。
> 要分发就用 zip（`ditto -c -k --keepParent`）或直接拷贝 .app。

运行时数据策略：
- **词典**：userData 缓存（24h）→ 在线拉取 → 打包内置词典兜底（首次离线可用）
- **联赛**：用户显式设置过则用用户的；否则用打包时 API 返回的当前联赛

首次启动需授予辅助功能权限（勾选「PoE2查价助手」），否则弹窗提醒后退出。

> ⚠️ 不要直接 `npm start` / `electron .`：若从 WorkBuddy 等 Electron 应用的终端启动，
> 环境里继承了 `ELECTRON_RUN_AS_NODE=1`，会让 Electron 退化成纯 Node 报 `app undefined`。
> `start.sh` 用 `env -u ELECTRON_RUN_AS_NODE` 清掉了它。

启动后菜单栏（macOS 右上角）/ 通知区（Windows）出现图标。macOS 隐藏 dock 图标，纯托盘运行。

## 使用

1. 云游戏里对着装备按 `Ctrl+Alt+C`（高级复制，带 tier）。
2. 助手自动识别 → 解析 → 打开市集（默认自动打开，可在设置关）。
3. 托盘菜单：暂停/启用监听、立即解析剪贴板（手动兜底）、
   重新打开最近市集、复制查询 JSON、查看/复制武器 DPS 明细、自动打开开关、联赛设置、刷新词典、退出。
4. 设置窗口可配：热键读取延迟、联赛名、市集主机（国服/国际服）、
   tier 阈值、无阶级词缀开关、武器 DPS 筛选开关及 0–2% 搜索下调比例。

## 测试

```bash
# 在本目录（electron/）—— 只测宿主层
npm test      # 4 项：热键旁听（mock uiohook）+ gzip 编码回环
npm run check # 语法校验所有模块（含 core/）

# 纯业务逻辑测试在仓库根 test/（55 项，不启动 Electron）
cd .. && npm test        # 或 npm run test:all 跑两边
```

## 已知限制 / 待办

- **类别映射**：`query.js` 优先用复制文本的「物品类别」字段（单手锤/战矛/双手斧…）映射
  EE2 真实 category option，基底名关键词（`BASE_CATEGORY_HINTS`）兜底；认不出的类别
  **不加过滤**（宁缺勿错）。个别类别的单双手判定仍待更多真实样本验证。
- **联赛名**：打包时会从 API 重新获取当前联赛并作为默认值；用户显式设置过联赛时尊重用户设置。
- **多行混合词缀已支持**：如「帝王的」=物理伤害提高+命中值，每行各匹配一个 id 产出多条过滤。
- **技能词缀可能匹配不上**：武器自带技能（如「战矛飞掷」）国服词典 skill 分组覆盖不全，
  且默认禁用，不影响主查询。
- **空查询防线**：一条词缀都没匹配上时不自动打开市集，改为通知提示检查复制文本。
- **托盘图标**：`assets/iconTemplate.png`（18×18 纯黑剪影+alpha）与 `@2x`（36×36）已按
  用户提供的头像生成，macOS 可自动适配明暗模式。
- **打包**：`npm run dist` 仅输出 arm64 `.app`，不生成 DMG。复制安装时保留符号链接；
  首次启动仍需在本机通过辅助功能授权与实际云游戏剪贴板同步验证。
- **云游戏剪贴板同步依赖平台**：网易云游戏/腾讯 START 等支持剪贴板同步才行；若平台不同步，
  需手动把文本粘贴到本地再「立即解析」。

## 工程结构

本仓库是三部分：`core/`（共享业务逻辑）+ `electron/`（托盘壳）+ `macos-quickjs/`（原生壳）。
electron 内部按「宿主能力 / 视图」两层分目录：

```
electron/
  src/
    host/                【宿主壳层】平台能力，Electron 专属
      main.js            主进程：托盘、窗口、词典加载、IPC、流水线编排
      hotkey.js          全局热键旁听（uiohook listen-only，需辅助功能权限）
      encode.js          查询对象 → gzip → base64url → 市集 URL（node:zlib）
      settings.js        设置持久化（userData/settings.json）

    ui/                  【视图层】只放界面与 IPC 桥
      settings.html      设置窗口（内联样式与脚本）
      preload.cjs        contextBridge 白名单 IPC

  test/
    host.test.js         仅宿主层：热键旁听（mock uiohook）、gzip 编码回环

  scripts/
    sign-app.js          ad-hoc 签名
    qjs-compile-dict.c   compiled.json → QuickJS bjson（可选工具）
```

业务逻辑不在 electron 里，而在**仓库根 `core/`**（独立包 `@poe2/core`，
`parse-item` / `match-stats` / `query` / `weapon-dps` / `defences` / `map-mods` / `item-text`）。
纯逻辑测试也在仓库根 `test/`（55 项，不启动 Electron）；数据统一在仓库根 `data/`。

### 分层的硬约束

- **core 是独立包，不在 electron 内部**。它在仓库根 `core/`，自带 `package.json`，
  electron 通过 `file:../core` 依赖它，引用方式是 `require('@poe2/core')`。
- **core 不许 require 平台模块**。只有 `query.js` 需要 gzip，但它只做 URL 字符串拼接
  （`buildTradeUrl`），压缩交给宿主。core 里出现 `node:*` 或 `electron` 即为违例。
- **core 不许反向依赖宿主**（`electron/`、`macos-quickjs/`），依赖方向单向。
- **core 不读数据文件**。词典由宿主读入后注入，core 只做纯函数变换。
- **UI 不承载业务规则**。设置页只做字段读写与展示，默认值、阈值逻辑都在 core/host。
- 这条边界不是洁癖：`macos-quickjs/` 把 `core/` 原样 esbuild 成 ESM 跑在 QuickJS 里，
  core 一旦混入 Node API，原生壳立刻编译不过。

以上约束由仓库根 `test/architecture.test.js`（15 项）自动守卫，在仓库根跑 `npm test`。

改动位置速查：

| 想改什么 | 改哪里 |
|---|---|
| 装备文本解析规则、词缀识别 | `core/parse-item.js`（仓库根） |
| 词缀匹配不上、id 映射错 | `core/match-stats.js` |
| 查询条件太松/太严、类别映射 | `core/query.js` |
| DPS / 防御 / 引路石算法 | `core/weapon-dps.js`、`defences.js`、`map-mods.js` |
| 词典/联赛数据拉取 | `scripts/prepare-data.js`（仓库根） |
| 托盘菜单、通知、启动流程 | `src/host/main.js` |
| 热键不触发、权限问题 | `src/host/hotkey.js` |
| 设置项增删 | `src/host/settings.js`（DEFAULTS）+ `src/ui/settings.html`（表单字段） |
| 编码/URL 打不开 | `src/host/encode.js` |

