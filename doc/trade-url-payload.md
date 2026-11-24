# POE2 交易搜索页 — URL 载荷字段映射

抓取对象：`https://poe.game.qq.com/trade2/search/poe2/`\
抓取方式：在真实 Chrome 中逐个操作 UI 控件 → 读取生成的 URL → 解码载荷 → 反推字段映射（每个输入框填入唯一数值以精确定位）。

---

## 一、URL 结构与编码

生成的搜索 URL 形式：

```
https://poe.game.qq.com/trade2/search/poe2/<联盟URL编码>/<载荷>
```

- 第 1 段路径：联盟名（如 `周年庆巅峰挑战`），URL 编码。

- 第 2 段路径：查询载荷 = **gzip 压缩 → Base64URL**（无 padding）。
  - 载荷以 `H4sIA` 开头即为 gzip 魔数。
  - 解码：`base64url_decode(s) → gzip.decompress() → JSON`。

解码脚本：

```python
import base64, gzip, json
def decode(s: str) -> dict:
    data = base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))
    return json.loads(gzip.decompress(data))

def encode(obj: dict) -> str:
    raw = gzip.compress(json.dumps(obj, separators=(",", ":")).encode())
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")
```

空查询基线载荷：

```json
{"status":{"option":"any"},"stats":[{"type":"and","filters":[]}]}
```

---

## 二、顶层结构

| 顶层键 | 类型 | 说明 | 来源 UI |
|---|---|---|---|
| `status` | object | 物品在线/交易状态，默认 `{"option":"any"}` | 页面状态开关 |
| `type` | string | 物品名称（精确名），如 `"赤红项链"` | 顶部「查找物品...」搜索框选中项 |
| `filters` | object | 所有过滤器分组，见下 | 左侧过滤器面板 |
| `stats` | array | 状态过滤器/状态组，见第五节 | 右侧「状态过滤」面板 |

> 注意：`type`（物品名）与 `filters.type_filters.filters.category`（物品类型类别）是两个不同的字段，可以同时存在。

---

## 三、filters 分组总览

```
filters
├── type_filters      # 类型过滤器（物品类型/稀有度/等级/品质）
├── equipment_filters # 装备过滤器（15 项数值）
└── req_filters       # 需求（等级/力量/敏捷/智慧）
```

每个分组都有 `disabled` 布尔字段控制该组是否生效：

- 该组**无任何输入**时 → `{"disabled": true, "filters": {...}}`（存档但不生效）。

- 该组**有输入**时 → `disabled` 省略（默认生效）或 `false`。

---

## 四、各过滤器字段映射

### 4.1 type\_filters（类型过滤器）

| UI 控件 | JSON 路径 | 值类型 | 示例 |
|---|---|---|---|
| 物品类型（下拉） | `filters.type_filters.filters.category.option` | 枚举 string | `"weapon.onemace"`、`"weapon.onemelee"` |
| 物品稀有度（下拉） | `filters.type_filters.filters.rarity.option` | 枚举 string | `"rare"` |
| 物品等级 最小/最大 | `filters.type_filters.filters.ilvl.min` / `.max` | number | `411` / `412` |
| 物品品质 最小/最大 | `filters.type_filters.filters.quality.min` / `.max` | number | `413` / `414` |

稀有度下拉实测选项（中文 → 推测值）：任何=any、一般=normal、魔法=magic、稀有=rare、传奇=unique、传奇（烫金）=unique...（复刻）、任何非传奇=nonunique。

物品类型下拉实测选项：任何、任何武器、任意单手近战武器、徒手、爪、匕首、单手剑、单手斧、单手锤、战矛等（值形如 `weapon.onemace`）。

完整示例：

```json
"type_filters": {
  "filters": {
    "category": {"option": "weapon.onemace"},
    "rarity": {"option": "rare"},
    "ilvl": {"min": 411, "max": 412},
    "quality": {"min": 413, "max": 414}
  }
}
```

### 4.2 equipment\_filters（装备过滤器，15 项）

全部为 `{min, max}` 数值结构，路径统一为 `filters.equipment_filters.filters.<字段>`。\
实测映射（唯一值 201→230 反推）：

| UI 标签（中文） | JSON 字段 | 实测 min/max |
|---|---|---|
| 伤害 | `damage` | 201/202 |
| 每秒攻击次数 | `aps` | 203/204 |
| 暴击几率 | `crit` | 205/206 |
| 每秒伤害 | `dps` | 207/208 |
| 每秒物理伤害 | `pdps` | 209/210 |
| 每秒元素伤害 | `edps` | 211/212 |
| 装填时间 | `reload_time` | 213/214 |
| 护甲 (r) | `ar` | 215/216 |
| 闪避 (r) | `ev` | 217/218 |
| 能量护盾 (r) | `es` | 219/220 |
| 符文结界 (r) | `ward` | 221/222 |
| 格挡 (r) | `block` | 223/224 |
| 精神 (r) | `spirit` | 225/226 |
| 增幅器插槽 | `rune_sockets` | 227/228 |
| 总增幅器插槽 (r) | `total_augment_sockets` | 229/230 |

示例：

```json
"equipment_filters": {
  "filters": {
    "damage": {"min": 201, "max": 202},
    "aps": {"min": 203, "max": 204},
    "crit": {"min": 205, "max": 206},
    "dps": {"min": 207, "max": 208},
    "pdps": {"min": 209, "max": 210},
    "edps": {"min": 211, "max": 212},
    "reload_time": {"min": 213, "max": 214},
    "ar": {"min": 215, "max": 216},
    "ev": {"min": 217, "max": 218},
    "es": {"min": 219, "max": 220},
    "ward": {"min": 221, "max": 222},
    "block": {"min": 223, "max": 224},
    "spirit": {"min": 225, "max": 226},
    "rune_sockets": {"min": 227, "max": 228},
    "total_augment_sockets": {"min": 229, "max": 230}
  }
}
```

### 4.3 req\_filters（需求，4 项）

路径统一为 `filters.req_filters.filters.<字段>`：

| UI 标签 | JSON 字段 | 实测 min/max |
|---|---|---|
| 等级 | `lvl` | 301/302 |
| 力量 | `str` | 303/304 |
| 敏捷 | `dex` | 305/306 |
| 智慧 | `int` | 307/308 |

---

## 五、stats（状态过滤器 / 状态组）

`stats` 是**分组数组**，每组结构：

```json
{"type": "<组类型>", "filters": [ <过滤器项> ]}
```

- 默认始终有一组：`{"type":"and","filters":[]}`。

- 「+ 增加状态过滤器」→ 在当前组 `filters` 里追加一项。

- 「+ 增加状态组」→ 在 `stats` 数组里追加一个新组。

### 5.1 过滤器项结构

```json
{
  "id": "pseudo.pseudo_total_fire_resistance",
  "value": {"min": 501, "max": 502},
  "disabled": false
}
```

| 键 | 说明 |
|---|---|
| `id` | 状态 ID，来自下拉选项。伪属性形如 `pseudo.pseudo_total_fire_resistance`。 |
| `value` | 可选，数值范围 `{min, max}`，仅填一个时只写对应键。 |
| `disabled` | 有值时为 `false`；仅选中未填值时可省略。 |

状态过滤下拉实测前几项：综合 +#% 总冰霜抗性、总火焰抗性、总闪电抗性、总元素抗性、总混沌抗性、总抗性、# 抗性个数、% 元素抗性、% 全元素抗性（对应 `pseudo.*` ID）。

### 5.2 状态组类型（type 枚举）

「+ 增加状态组」下拉实测选项：状态组、与、非、如果、数量、加权求和、加权求和 v2、熔炉天赋树路径、佣兵技能组。

对应 `type` 值：`and` / `not` / `if` / `count` / `weighted_sum` / `weighted_sum_v2` 等。

两组示例（实测）：

```json
"stats": [
  {
    "type": "and",
    "filters": [{
      "id": "pseudo.pseudo_total_fire_resistance",
      "value": {"min": 501, "max": 502},
      "disabled": false
    }]
  },
  {"filters": [], "type": "not"}
]
```

---

## 六、合并示例（多种选项共存）

同时设置物品名 + 类型 + 稀有度 + 等级 + 装备属性 + 状态过滤时，结构如下（各分组并存，互不覆盖）：

```json
{
  "status": {"option": "any"},
  "type": "赤红项链",
  "filters": {
    "type_filters": {
      "filters": {
        "category": {"option": "weapon.onemace"},
        "rarity": {"option": "rare"},
        "ilvl": {"min": 411, "max": 412},
        "quality": {"min": 413, "max": 414}
      }
    },
    "equipment_filters": {
      "filters": {
        "damage": {"min": 201, "max": 202},
        "es": {"min": 219, "max": 220}
      }
    },
    "req_filters": {
      "filters": {"lvl": {"min": 301, "max": 302}}
    }
  },
  "stats": [
    {
      "type": "and",
      "filters": [{
        "id": "pseudo.pseudo_total_fire_resistance",
        "value": {"min": 501, "max": 502},
        "disabled": false
      }]
    },
    {"filters": [], "type": "not"}
  ]
}
```

> 编码回 URL：`encode(obj)` 后拼成 `https://poe.game.qq.com/trade2/search/poe2/<联盟>/<encode结果>` 即可直接访问。

---

## 七、补充观察 / 注意点

1. `filters` 分组的 `disabled` 字段：当分组从未被填写时会出现 `disabled: true`（如早期基线 `type_filters` 空组）；一旦填入任意值即消失或变 `false`。

2. 数值框只填 min 时，JSON 只写 `{"min": x}`；只填 max 时只写 `{"max": y}`；两者都填才写全。

3. UI 每次修改都会即时重新编码 URL（无需点搜索按钮），且会重新渲染 DOM 导致节点标识失效——自动化时应在每次关键操作后重新读取页面状态。

4. 物品名称（`type`）通过联想下拉选中后即时写入顶层 `type`；直接输入文字不选中不会写入。

5. 顶部「立即购买」下拉实际是购买模式开关（仅「立即购买」一项），排序选项在搜索结果页，未在本次搜索页 URL 载荷中体现。

6. `status` 默认恒为 `{"option":"any"}`；其他可选值未在搜索页控件中直接暴露。

> 来源：[POE2交易搜索_URL载荷字段映射](https://www.workbuddy.cn/space/d/p1Pve5yMHwoDfUmxZXarLP)
