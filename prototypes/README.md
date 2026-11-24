# prototypes/

早期原型的死代码，**不参与运行**，仅作格式调研记录保留。

- `parse-item.mjs` / `match-stats.mjs` — 最初的国服文本解析与词典匹配原型（ESM）。
  实现已迁到 `core/`，两者差异较大（tier/roll 解析、explicit 映射后续都改过），
  这些原型不再被任何代码引用。

⚠️ 注意：这两个脚本里的默认数据路径（`cn-stats.json` / `sample-item.txt`）已失效——
相关文件已统一收进仓库根 `data/`。若确实要跑原型，自行传入路径参数。

需要看当前实现，请去 `core/`。
