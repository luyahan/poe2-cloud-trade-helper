# 物品类别测试待办清单

数据来源：<https://poe2db.tw/cn/Items>（简体中文版，抓取于 2026-11-24）；
国服交易 option id 来源：`data/cn-filters.json` 的 `type_filters.category`（`npm run prepare-data` 存档）。

## 判定标准

- **已测（真实样本）**：`data/sample-*.txt` 中存在该「物品类别」的真实游戏复制文本，且被 `test/` 引用。
- **仅夹具**：只有 `test/` 里合成的测试文本（基底名可能是编造的），没有真实样本。仍算「待补真实样本」。
- **未测**：poe2db 有此类别，但真实样本和测试夹具都没有。

粒度为**物品类别**（poe2db Items 导航项），不是单个传奇物品。如需按 unique 逐件核对，可另起清单。

**范围**：通货 / 工艺材料（可堆叠通货、增幅器、预兆、孕育石、液化情感、精华、裂片、催化剂，
以及国服独有的符文、灵核、魔偶）按需求不纳入待办。

## 汇总

| 状态 | 数量 | 类别 |
|---|---|---|
| 已测（真实样本） | 10 | 单手锤、双手锤、战矛、法杖(Wands)、节杖(Quarterstaves)、手套、护甲(Body Armours)、盾牌、珠宝、引路石 |
| 仅夹具（缺真实样本） | 2 | 鞋子、戒指 |
| 未测 | 34 | 见下方待办（通货已剔除） |

下方待办共 36 项（34 未测 + 2 仅夹具，后者已加粗标出），另附录列 3 项国服交易独有类别。
poe2db Items 导航中纳入范围的类别共 46 项（54 项减去 8 项通货）。
注意 poe2db 与国服命名的对应：**权杖(Sceptres) = 国服「短杖」`weapon.sceptre`；节杖(Quarterstaves) = 国服「节杖」`weapon.warstaff`**，两者别搞反（`core/query.js` 已有注释）。

## 待办：装备类（优先补，直接影响 DPS/防御/插槽/品质链路）

- [ ] 爪类 Claws — `weapon.claw` — <https://poe2db.tw/cn/Claws>
- [ ] 匕首 Daggers — `weapon.dagger` — <https://poe2db.tw/cn/Daggers>
- [ ] 单手剑 One Hand Swords — `weapon.onesword` — <https://poe2db.tw/cn/One_Hand_Swords>
- [ ] 单手斧 One Hand Axes — `weapon.oneaxe` — <https://poe2db.tw/cn/One_Hand_Axes>
- [ ] 权杖 Sceptres（国服短杖） — `weapon.sceptre` — <https://poe2db.tw/cn/Sceptres>
- [ ] 连枷 Flails — `weapon.flail` — <https://poe2db.tw/cn/Flails>
- [ ] 弓类 Bows — `weapon.bow` — <https://poe2db.tw/cn/Bows>
- [ ] 长杖 Staves — `weapon.staff` — <https://poe2db.tw/cn/Staves>
- [ ] 双手剑 Two Hand Swords — `weapon.twosword` — <https://poe2db.tw/cn/Two_Hand_Swords>
- [ ] 双手斧 Two Hand Axes — `weapon.twoaxe` — <https://poe2db.tw/cn/Two_Hand_Axes>
- [ ] 战弩 Crossbows — `weapon.crossbow` — <https://poe2db.tw/cn/Crossbows>
- [ ] 陷阱 Traps — 交易枚举无对应 option（需确认是否走 `weapon` 通用） — <https://poe2db.tw/cn/Traps>
- [ ] 魔符 Talismans — `weapon.talisman` — <https://poe2db.tw/cn/Talismans>
- [ ] 箭袋 Quivers — `armour.quiver` — <https://poe2db.tw/cn/Quivers>
- [ ] 轻盾 Bucklers — `armour.buckler` — <https://poe2db.tw/cn/Bucklers>
- [ ] 法器 Foci — `armour.focus` — <https://poe2db.tw/cn/Foci>
- [ ] 头盔 Helmets — `armour.helmet` — <https://poe2db.tw/cn/Helmets>
- [ ] 项链 Amulets — `accessory.amulet` — <https://poe2db.tw/cn/Amulets>
- [ ] 腰带 Belts — `accessory.belt` — <https://poe2db.tw/cn/Belts>
- [ ] **鞋子 Boots — `armour.boots` — <https://poe2db.tw/cn/Boots>**（仅 `pseudo.test.js` 合成夹具「钢趾靴」，需真实样本）

## 待办：可交易消耗品 / 终局物品

- [ ] 生命药剂 Life Flasks — `flask.life` — <https://poe2db.tw/cn/Life_Flasks>
- [ ] 魔力药剂 Mana Flasks — `flask.mana` — <https://poe2db.tw/cn/Mana_Flasks>
- [ ] 咒符 Charms — `flask.charm` — <https://poe2db.tw/cn/Charms>
- [ ] **戒指 Rings — `accessory.ring` — <https://poe2db.tw/cn/Rings>**（仅 `pseudo.test.js` 合成夹具「金光戒指」，需真实样本）
- [ ] 地图碎片 Map Fragments — `map.fragment` — <https://poe2db.tw/cn/Map_Fragments>
- [ ] 裂隙之石 Misc Map Items — `map.breachstone`? — <https://poe2db.tw/cn/Misc_Map_Items>
- [ ] 贪婪战书 Inscribed Ultimatum — `map.ultimatum` — <https://poe2db.tw/cn/Inscribed_Ultimatum>
- [ ] 石板 Tablet — `map.tablet` — <https://poe2db.tw/cn/Tablet>
- [ ] 试炼硬币 Trial Coins — option 待确认 — <https://poe2db.tw/cn/Trial_Coins>
- [ ] 巅峰钥匙 Pinnacle Keys — `map.bosskey` — <https://poe2db.tw/cn/Pinnacle_Keys>
- [ ] 宝库钥匙 Vault Keys — 交易枚举无对应 option — <https://poe2db.tw/cn/Vault_Keys>
- [ ] 遗物 Relics — `sanctum.relic` — <https://poe2db.tw/cn/Relics>

## 低优先 / 可能不参与查价

- [ ] 药剂总页 Flasks（聚合入口，非具体类别） — <https://poe2db.tw/cn/Flasks>
- [ ] 藏身处 Hideout — <https://poe2db.tw/cn/Hideout>
- [ ] 藏身处装饰 Hideout Doodads — <https://poe2db.tw/cn/Hideout_Doodads>
- [ ] 保险箱 Strongbox — <https://poe2db.tw/cn/Strongbox>

## 附录：国服交易有、poe2db Items 导航未列的类别

来自 `data/cn-filters.json`，同样没有测试覆盖，若工具要支持需补样本：

- [ ] 日志 `map.logbook`
- [ ] 命运卡 `card`
- [ ] 技能宝石 `gem.activegem` / 辅助宝石 `gem.supportgem` / 非凡宝石 `gem.metagem`
  （poe2db 侧入口：<https://poe2db.tw/cn/Skill_Gems>、<https://poe2db.tw/cn/Support_Gems>、<https://poe2db.tw/cn/Spirit_Gems>、<https://poe2db.tw/cn/Lineage_Supports>）

## 已覆盖（不用再列待办）

| 类别 | poe2db 页 | 样本 | 覆盖测试 |
|---|---|---|---|
| 单手锤 | One_Hand_Maces | `sample-item.txt`、`sample-molten-hammer.txt` | pipeline / quality / sockets / weapon-dps / pseudo |
| 双手锤 | Two_Hand_Maces | `sample-ruin-maul.txt` | quality |
| 战矛 | Spears | `sample-spear.txt` | pipeline / weapon-dps / pseudo |
| 法杖(Wands) | Wands | `sample-withering-wand.txt` | sockets（解析路径） |
| 节杖(Quarterstaves) | Quarterstaves | `sample-moonlight-sceptre.txt` | sockets |
| 手套 | Gloves | `sample-hateforge.txt` | defences / invert / pipeline / pseudo |
| 护甲(Body Armours) | Body_Armours | `sample-unique-armour*.txt` ×3 | sockets / quality / defences |
| 盾牌 | Shields | `sample-svalinn.txt`、`sample-svalinn-2.txt` | invert |
| 珠宝 | Jewels | `sample-jewel-grand-spectrum.txt`、`sample-jewel-unid-corrupted.txt` | jewel / pipeline |
| 引路石 | Waystones | `sample-waystone*.txt` ×4 | map-mods / sockets / pseudo |

## 补样本约定

按项目既有约定：真实复制文本原样存为 `data/sample-<语义名>.txt`，再在 `test/` 加对应断言。
基底名必须是游戏里真实存在的名字——国服市集对未知基底名直接返回「搜索失败」（`test/pseudo.test.js` 已有注释记录此坑）。
