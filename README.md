# PoE2 云游戏查价工具

在云游戏里按 `Ctrl+Alt+C` 复制装备 → 自动解析 → 匹配国服词典 → 打开交易市集。

业务逻辑只有一份（`core/`），两个壳共用：Electron 托盘壳（macOS 菜单栏 / Windows 通知区）
与 macOS QuickJS 原生壳（约 2.5MB，适合云端 / 低配机器）。

## 目录概览

- `core/` —— 纯业务逻辑，零平台依赖（Node / QuickJS 均可跑）
- `electron/` —— Electron 托盘壳（主进程、热键旁听、设置界面）
- `macos-quickjs/` —— macOS 原生壳（AppKit + QuickJS）
- `data/` —— 词典、联赛元信息、真实样本与 filters 枚举
- `scripts/` —— 数据准备脚本
- `test/` —— 纯业务逻辑测试（不启动 Electron）
- `prototypes/` —— 早期原型，死代码，不参与运行

## 使用方法

### 准备数据

```bash
npm run prepare-data     # 拉最新国服词典 + 当前联赛 → data/
```

### 启动与打包托盘应用

```bash
cd electron
npm run start            # 开发态启动（用 start.sh 亦可）
npm run dist             # 打包 .app（check → 测试 → prepare-data → 编译 → 签名）
```

macOS 首次运行需要在「系统设置 → 隐私与安全性 → 辅助功能」中授权，详见
[electron/README.md](electron/README.md)。

### 构建 macOS 原生壳

```bash
npm run build:quickjs    # 仓库根目录执行
```

### 测试与校验

```bash
npm test                 # 纯业务逻辑 + 分层边界守卫（不启动 Electron）
npm run test:host        # Electron 宿主层（热键旁听、gzip 编码）
npm run test:all         # 上面两套一起跑
npm run check            # 全部模块语法校验
```

## 详细文档

- [doc/architecture.md](doc/architecture.md) —— 仓库结构、`data/` 文件清单、依赖方向、测试分层与设计原因
- [doc/pseudo-merge.md](doc/pseudo-merge.md) —— Pseudo 合并规则与配置项
- [doc/trade-url-payload.md](doc/trade-url-payload.md) —— 国服交易搜索 URL 载荷字段映射（含原始资料库链接）
- [TESTING_TODO.md](TESTING_TODO.md) —— 物品类别测试覆盖与待办清单
- [electron/README.md](electron/README.md) —— Electron 壳的坑位、打包、签名、国服 API 差异
- [macos-quickjs/README.md](macos-quickjs/README.md) —— 原生壳架构、体积 / 性能对比、QuickJS 限制
