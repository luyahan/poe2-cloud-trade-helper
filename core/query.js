/**
 * 把「解析 + 词典匹配」后的装备转成 trade2 查询 JSON
 *
 * 策略对齐 EE2 exact 预设 + 本项目 auto-select：
 *   - 带 tier 的随机词缀：T1/T2 默认启用，T3+ 默认禁用（可配）
 *   - 无 tier 的 rune/implicit：默认禁用（避免噪声），可配
 *   - roll 取值：用 min 端做下限筛选（买家视角，找不低于此 roll 的）
 *   - 装备类别 → type_filters.category（基底名匹配）
 *   - pseudo 合并：把同族词缀合成一条「总数」筛选，写入第二个 and 组
 */

const { addDpsFilters } = require('./weapon-dps.js');
const { addDefenceFilters } = require('./defences.js');
const { addMapFilters } = require('./map-mods.js');
const { buildPseudoFilters } = require('./pseudo.js');

// 国服市集类别 option 映射
// 权威来源：国服 /api/trade2/data/filters 的 type_filters.category 枚举
// （已存档 data/cn-filters.json，中文 text 即游戏「物品类别」字段）。
// 注意国服命名与 EE2/国际服有差异：国服 warstaff=节杖、sceptre=短杖、flail=连枷。
// 优先用「物品类别」字段精确判定，基底名关键词兜底；认不出的不加过滤（宁缺勿错）。
const CATEGORY_BY_ITEM_CLASS = {
  '爪': 'weapon.claw', '匕首': 'weapon.dagger',
  '单手剑': 'weapon.onesword', '单手斧': 'weapon.oneaxe', '单手锤': 'weapon.onemace',
  '战矛': 'weapon.spear', '矛': 'weapon.spear', '连枷': 'weapon.flail', '链枷': 'weapon.flail',
  '双手剑': 'weapon.twosword', '双手斧': 'weapon.twoaxe', '双手锤': 'weapon.twomace',
  '节杖': 'weapon.warstaff', '战杖': 'weapon.warstaff', '魔符': 'weapon.talisman',
  '弓': 'weapon.bow', '战弩': 'weapon.crossbow', '弩': 'weapon.crossbow',
  '法杖': 'weapon.wand', '短杖': 'weapon.sceptre', '权杖': 'weapon.sceptre',
  '长杖': 'weapon.staff', '鱼竿': 'weapon.rod',
  '头盔': 'armour.helmet', '胸甲': 'armour.chest', '护甲': 'armour.chest',
  '手套': 'armour.gloves', '鞋子': 'armour.boots', '靴': 'armour.boots',
  '箭袋': 'armour.quiver', '盾': 'armour.shield', '盾牌': 'armour.shield',
  '法器': 'armour.focus', '轻盾': 'armour.buckler',
  '项链': 'accessory.amulet', '腰带': 'accessory.belt', '戒指': 'accessory.ring',
  '珠宝': 'jewel', // 国服顶层 option「任何珠宝」，无子类
  '生命药剂': 'flask.life', '魔力药剂': 'flask.mana', '咒符': 'flask.charm',
  '引路石': 'map.waystone', '日志': 'map.logbook', '石板': 'map.tablet',
  '预兆': 'currency.omen', '符文': 'currency.rune', '灵核': 'currency.soulcore',
};

// 基底名关键词兜底（物品类别字段缺失或不认识时）
const BASE_CATEGORY_HINTS = [
  { test: /战矛|矛/, option: 'weapon.spear' },
  { test: /钉头锤|巨锤|锤/, option: 'weapon.onemace' },
  { test: /战杖/, option: 'weapon.warstaff' },
  { test: /弩/, option: 'weapon.crossbow' },
  { test: /链枷/, option: 'weapon.flail' },
  { test: /弓/, option: 'weapon.bow' },
  { test: /法杖|短杖/, option: 'weapon.wand' },
  { test: /斧/, option: 'weapon.oneaxe' },
  { test: /剑/, option: 'weapon.onesword' },
];

function guessCategory(parsedItem) {
  const cat = (parsedItem.category || '').trim();
  if (CATEGORY_BY_ITEM_CLASS[cat]) return CATEGORY_BY_ITEM_CLASS[cat];
  const base = parsedItem.baseName || '';
  for (const hint of BASE_CATEGORY_HINTS) {
    if (hint.test.test(base) || hint.test.test(cat)) return hint.option;
  }
  return undefined; // 未确认的类别不加过滤，避免错 option 导致搜索失败
}

// 词典 # 对应的是实际可变 roll，而非文本里的固定秒数/次数。
// 保留括号内理论 roll 下限作为搜索下限；冷却时间等更低更好的词缀改为上限。
function rollValue(stat, match) {
  const r = stat.rolls?.[match.valueRollIndex ?? 0];
  if (!r) return undefined;
  if (match.tradeInvert) return r.max != null ? { max: r.max } : { max: r.value };
  return { min: r.min != null ? r.min : r.value };
}

// 稀有度 → 国服市集 rarity option
const RARITY_OPTION = { '稀有': 'rare', '传奇': 'unique', '魔法': 'magic', '普通': 'normal' };

/**
 * 插槽数 → equipment_filters.rune_sockets（国服词典「增幅器插槽」）。
 * 字段与写法经用户提供的真实国服 URL 确认：{min: N}，组级 disabled:false。
 * 插槽行是空格分隔的字母（如 "S S"、"J J J J J J"），按空白切分计数。
 * 买家视角取 min：找插槽数不低于此装备的挂单。无插槽行/解析不出时不加过滤。
 * 注意与 total_augment_sockets（含插槽绑定增幅器）区分：这里只数文本可见插槽，
 * 与参考 URL 一致用 rune_sockets。
 */
function addSocketFilters(query, item, opts = {}) {
  if (opts.sockets === false) return undefined;
  const raw = item.sockets;
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  const count = raw.trim().split(/\s+/).filter(Boolean).length;
  if (!count) return undefined;
  const equipment = query.filters.equipment_filters ??= { disabled: false, filters: {} };
  equipment.disabled = false;
  const override = opts.socketsMin;
  equipment.filters.rune_sockets = { min: override != null ? Math.floor(override) : count };
  return count;
}

/**
 * @param parsedItem  parseItemText 产物
 * @param matched     matchItem 产物 [{mod, stat, match}]
 * @param opts        { tierMax, includeUntiered, league, pseudoEnabled, pseudoRangePercent, ... }
 */
function buildQuery(parsedItem, matched, opts = {}) {
  const {
    tierMax = 2,
    includeUntiered = false,
    league = '联赛',
    pseudoEnabled = true,
    pseudoRangePercent = 0,
  } = opts;

  const filters = [];
  // 「非」组：越低越好词缀 roll 到 0 时，语义是「没有这个词缀」——
  // 如斯瓦林承受伤害 0% = 格挡完全免伤，必须排除带该词缀的挂单，
  // 而不是 max:0（那只会命中同样 0% 的，漏掉根本没有此词缀的更好挂单）。
  // not 组是国服市集合法分组（油猴版 groupType 枚举 and/count/not/weight 确认）。
  const notFilters = [];
  // pseudo 合并的候选：与 filters 一一对应（同一对象引用），
  // 这样建议命中来源后可以直接回贴 disabled，不必二次查表。
  const candidates = [];
  const seen = new Set();
  for (const { mod, stat, match } of matched) {
    if (!match || !stat) continue;
    // 混合词缀多行可能命中同一 id（少见），去重
    const value = rollValue(stat, match);
    const dedupKey = `${match.id}:${JSON.stringify(value) || ''}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    // 反转词缀实际 roll 为 0 → 进 not 组（无此词缀），不进 and 组、不参与 pseudo。
    // 条目结构经用户提供的标准国服 URL 确认：{id, value:{}, disabled:false}——
    // not 组条目显式带空 value 与 disabled:false（与 and 组省略写法不同）。
    if (match.tradeInvert) {
      const r = stat.rolls?.[match.valueRollIndex ?? 0];
      if (r && r.value === 0) {
        notFilters.push({ id: match.id, value: {}, disabled: false });
        continue;
      }
    }

    let disabled;
    // 引路石：买家只关心 map_filters 面板字段，词缀默认全部禁用，避免 AND 过严搜不到。
    if (parsedItem.category === '引路石') {
      disabled = true;
    } else if (parsedItem.rarity === '传奇') {
      // 传奇的符文是可替换的附加属性，不属于固有传奇词缀；默认不缩小同款结果。
      disabled = mod.type === 'Rune' || (mod.tier == null && mod.type !== 'Explicit' && !includeUntiered);
    } else if (mod.tier != null) {
      disabled = mod.tier > tierMax; // T1/T2 启用，T3+ 禁用
    } else {
      disabled = !includeUntiered; // rune/implicit/基底 默认禁用
    }

    const filter = { id: match.id };
    if (value) filter.value = value;
    if (disabled) filter.disabled = true;
    filters.push(filter);
    candidates.push({
      id: match.id,
      filter,
      value,
      template: match.text,
      type: (match.group || mod.type || '').toLowerCase(),
    });
  }

  // 国服 trade2 URL 载荷是【扁平结构】：{status, stats, filters} 直接在顶层，
  // 没有 {query:{...}, sort:{...}} 包裹（实测真实国服 URL 确认）。
  // 包错结构会导致市集报「无法使用搜索」。
  const query = {
    status: { option: 'any' },
    stats: [{ type: 'and', filters }],
    filters: {},
  };
  if (notFilters.length) query.stats.push({ type: 'not', filters: notFilters });

  // ---- pseudo 合并：写入第二个 and 组 ----
  // 单独成组而非塞进第一组：第一组是「每条精确词缀都要满足」，
  // 合并值是同族词缀合计，语义不同，混在一起会让条件失真。
  // 引路石跳过（其语义是只按 map_filters 搜，词缀组本已全禁用）。
  const pseudoResult = (pseudoEnabled && parsedItem.category !== '引路石')
    ? applyPseudoMerge(query, candidates, { pseudoRangePercent })
    : { suggestions: [], applied: [] };

  // 传奇：name 只放传奇名，type 只放基底名；不要把两个名称拼成一个不存在的基底。
  // 稀有：type 放基底名，不使用随机装备名。
  if (parsedItem.rarity === '传奇' && parsedItem.name) {
    query.name = parsedItem.name;
    if (parsedItem.baseName) query.type = parsedItem.baseName;
  } else if (parsedItem.baseName) {
    query.type = parsedItem.baseName;
  }

  // 类别过滤
  const category = guessCategory(parsedItem);
  if (category) {
    query.filters.type_filters = { filters: { category: { option: category } } };
  }

  // 稀有度过滤：稀有→rare（避免混入传奇/魔法），传奇→unique
  const rarityOpt = RARITY_OPTION[parsedItem.rarity];
  if (rarityOpt) {
    query.filters.type_filters ??= { filters: {} };
    query.filters.type_filters.filters.rarity = { option: rarityOpt };
  }

  // 物品等级下限（可选，找同等或更高 ilvl 的基底）
  // ⚠️ 国服 filters API 确认 ilvl 属于 type_filters（不是 misc_filters，
  // EE2/国际服才放 misc）。放错分组会导致市集报「无法使用搜索」。
  // 传奇的物品等级不影响固有词缀，强制 ilvl 下限会无谓排除同款挂单。
  if (parsedItem.itemLevel != null && parsedItem.rarity !== '传奇') {
    query.filters.type_filters ??= { filters: {} };
    query.filters.type_filters.filters.ilvl = { min: parsedItem.itemLevel };
  }

  // 品质筛选：超过常规 20% 上限（>20%，即 ≥21%）才写入 type_filters.quality.min。
  // 可修改装备都能磨到 20%，≤20 的品质过滤无意义；>20 是稀缺卖点，
  // 按实际品质找不低于它的挂单（买家视角，与插槽/DPS 同口径）。
  // 字段位置经用户提供的真实国服 URL 确认：type_filters（不是 equipment_filters），
  // 写法 {min: N}。腐化装备品质不可再改，>20 同样按实际值过滤。
  if (parsedItem.quality != null && parsedItem.quality > 20 && opts.quality !== false) {
    query.filters.type_filters ??= { filters: {} };
    const override = opts.qualityMin;
    query.filters.type_filters.filters.quality = {
      min: override != null ? Math.floor(override) : parsedItem.quality,
    };
  }

  // 腐化 + 鉴定状态筛选（misc_filters）。传奇与引路石都写（腐化与否对两者
  // 价格影响都大；珠宝等其余类别暂不写，避免无谓缩小结果）。
  //
  // 两个标志相互独立，各按文本关键词判定：
  //   corrupted：有腐化关键词（被腐化/双重腐化）→true；无→false；
  //     仅当「未鉴定且无腐化关键词」时才 any（null，看不出腐化状态）。
  //   identified：有「未鉴定」→false；否则 true。
  // ⚠️ 旧版曾假设「腐化⇒已鉴定」，把未鉴定+腐化的物品 identified 强写 true、
  //   corrupted 丢弃为 null——真实文本里未鉴定与双重腐化可以并存（如未鉴定
  //   腐化珠宝），该假设错误。现在关键词说什么就是什么，不做推断。
  // 字段写法与位置经真实国服 URL 确认：misc_filters.filters.{corrupted,identified}
  // 各为 { option: 'true'|'false'|null }，组级 disabled: false。
  if (parsedItem.rarity === '传奇' || parsedItem.category === '引路石') {
    const unidentified = !!parsedItem.unidentified;
    const corrupted = !!parsedItem.corrupted;
    query.filters.misc_filters = {
      disabled: false,
      filters: {
        corrupted: { option: corrupted ? 'true' : (unidentified ? null : 'false') },
        identified: { option: unidentified ? 'false' : 'true' },
      },
    };
  }

  // 武器 DPS 默认开启；可修改武器按 q20 物理 + 火/冰/电，不含暴击/混沌/装填。
  // 计算值保留在返回值，写入市集的 min 由独立 threshold 逻辑计算。
  const weaponDps = addDpsFilters(query, parsedItem, opts);
  const defences = addDefenceFilters(query, parsedItem, opts, matched);
  const mapMods = addMapFilters(query, parsedItem, opts);
  // 插槽数：有插槽行就写 rune_sockets.min（与 DPS/防御同组 equipment_filters，
  // 用 ??= 合并，不会覆盖 addDpsFilters 已写入的字段）
  const socketCount = addSocketFilters(query, parsedItem, opts);

  return { query, league, weaponDps, defences, mapMods, socketCount, pseudo: pseudoResult };
}

/**
 * 搜索阈值下调，与 DPS / 引路石共用同一套口径：
 * 计算值不变，只把市集搜索下限按 rangePercent 向下微调（买家策略）。
 */
function adjustThreshold(value, rangePercent = 0) {
  const percent = Math.max(0, Math.min(100, rangePercent)) / 100;
  return Math.max(0, Math.floor(value * (1 - percent)));
}

/**
 * 把 pseudo 建议落到查询上。
 *
 * 只写「已启用」的建议：桌面端没有勾选面板，禁用建议若也写进 URL，
 * 市集里就是一组看不见也用不上的 disabled 条，纯属增加载荷。
 * 但被禁用的建议仍随 pseudoResult 返回，托盘菜单里会展示，用户可据此改配置。
 *
 * 来源词缀只在「原本启用」时才被禁用：如果某条词缀本来就因为 T3+/rune 被禁用，
 * 它并没有参与第一组的搜索，不需要、也不应该被 pseudo 改写状态。
 */
function applyPseudoMerge(query, candidates, opts = {}) {
  const { pseudoRangePercent = 0 } = opts;
  const suggestions = buildPseudoFilters(candidates);
  const applied = suggestions.filter((suggestion) => suggestion.enabled);

  if (applied.length > 0) {
    const filters = applied.map((suggestion) => {
      // 搜索下限按 pseudoRangePercent 下调，与 DPS/引路石阈值同一套口径
      const threshold = adjustThreshold(suggestion.value.min, pseudoRangePercent);
      return { id: suggestion.id, value: { min: threshold } };
    });
    query.stats.push({ type: 'and', filters });

    // 来源词缀：保留不删除，只标 disabled（项目硬性约定）
    for (const suggestion of applied) {
      for (const source of suggestion.sources) {
        if (!source.filter.disabled) {
          source.filter.disabled = true;
          source.pseudoConsumed = suggestion.id;
        }
      }
    }
  }

  return { suggestions, applied };
}

/**
 * 由「已压缩编码的载荷」拼出市集 URL。
 *
 * 编码（JSON → gzip → base64url）是平台相关能力：Electron 用 node:zlib，
 * PoeQuick 由 Swift 层调 /usr/bin/gzip。所以这里只做纯字符串拼接，
 * 让 core 保持零 Node 依赖（同一份代码可在 QuickJS 里跑）。
 * 对应实现见 host/encode.js。
 */
function buildTradeUrl(payload, league, host = 'poe.game.qq.com') {
  return `https://${host}/trade2/search/poe2/${encodeURIComponent(league)}/${payload}`;
}

module.exports = { buildQuery, buildTradeUrl };
