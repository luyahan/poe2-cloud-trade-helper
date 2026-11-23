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
- **传奇名称分列**：传奇装备 `name` 写传奇名、`type` 写基底名；稀有装备只写基底名。
- **交易状态固定任意**：始终 `status:{option:"any"}`，不提供在线状态选项。
- **⚠️ 载荷必须是扁平结构**：国服 trade2 URL 解码后是 `{status, stats, filters}` 直接在
  顶层，**没有** `{query:{...}, sort:{...}}` 包裹（以真实国服 URL 解码为准）。包错结构
  市集会报「无法使用搜索」。
- **⚠️ 国服 filters 分组与国际服不同**：以 `/api/trade2/data/filters`（已存档
  `../cn-filters.json`）为权威——`ilvl`/`quality` 在 **type_filters**（EE2/国际服放
  misc_filters）；category 中文对照也不同（国服 warstaff=节杖、sceptre=短杖、flail=连枷）。
- **⚠️ 亵渎/打造/破裂词缀用 explicit id 查价**：市集在售装备按普通外延词缀索引，
  `desecrated.*`/`crafted.*` 分组只命中特殊状态挂单。匹配器对这三类优先取 explicit
  变体（EE2 `initUiModFilters` 同款策略，用户实测可用 URL 佐证）。
- **pseudo 合并不在这里做**：交给页面侧油猴脚本（`userscript/`），避免两端重复累加。

## 安装与运行（开发态）

```bash
cd /Users/luyahan/Documents/Work/poe/poe2-cloud-trade-helper/electron
npm install          # 安装 Electron + electron-builder
./start.sh           # 启动（已处理 ELECTRON_RUN_AS_NODE 坑）
```

## 编译打包（.app）

```bash
cd /Users/luyahan/Documents/Work/poe/poe2-cloud-trade-helper/electron
npm run dist         # 一键：语法检查 → 32 项测试 → 拉最新数据 → 编译 .app → 签名
```

`predist` 自动执行 `scripts/prepare-data.js`：
- 从 `https://poe.game.qq.com/api/trade2/data/stats` **重新拉取词缀词典**
- 从 `/api/trade2/data/leagues` **获取当前联赛**（第一个非专家 poe2 联赛）
- 写入 `build-data/`，随 app 打进 `Resources/build-data/`

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
npm test     # 32 项测试（解析/匹配/查询/编码/热键/真实 URL/q20 DPS/阈值分离）
npm run check # 语法校验所有模块
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
- **托盘图标是占位圆点**：正式应放 `assets/iconTemplate.png`（16×16 纯黑+alpha）+ `@2x`，
  macOS 才能正确适配明暗模式。
- **打包**：`npm run dist` 仅输出 arm64 `.app`，不生成 DMG。复制安装时保留符号链接；
  首次启动仍需在本机通过辅助功能授权与实际云游戏剪贴板同步验证。
- **云游戏剪贴板同步依赖平台**：网易云游戏/腾讯 START 等支持剪贴板同步才行；若平台不同步，
  需手动把文本粘贴到本地再「立即解析」。

## 工程结构

```
src/
  main.js          主进程：托盘、模式切换、词典加载、IPC、流水线
  hotkey.js        全局热键旁听（uiohook listen-only，Ctrl+Alt+C，需辅助功能权限）
  clipboard.js     装备文本识别（looksLikeItemText，供热键命中后与手动解析用）
  query.js         构造 trade2 查询 + gzip/base64url 编码
  settings.js      设置持久化（userData/settings.json）
  settings.html    设置窗口 UI
  preload.cjs      设置窗口 IPC 桥
  lib/
    parse-item.js  国服简中装备文本解析器
    weapon-dps.js  EE2 q20 武器面板 DPS 与独立搜索阈值
    match-stats.js 词缀模板 → 真实 trade id 匹配器
test/
  pipeline.test.js 端到端测试
  weapon-dps.test.js q20、元素分类、腐化与查询阈值回归
```
