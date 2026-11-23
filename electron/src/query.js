/**
 * 把「解析 + 词典匹配」后的装备转成 trade2 查询 JSON
 *
 * 策略对齐 EE2 exact 预设 + 本项目 auto-select：
 *   - 带 tier 的随机词缀：T1/T2 默认启用，T3+ 默认禁用（可配）
 *   - 无 tier 的 rune/implicit：默认禁用（避免噪声），可配
 *   - roll 取值：用 min 端做下限筛选（买家视角，找不低于此 roll 的）
 *   - 装备类别 → type_filters.category（基底名匹配）
 *
 * 注意：pseudo 合并放在油猴脚本侧做（页面已有 buildPseudoFilters），
 * 这里只生成精确词缀查询，避免两端重复累加。
 */

// 国服市集类别 option 映射
// 权威来源：国服 /api/trade2/data/filters 的 type_filters.category 枚举
// （已存档 trade-tray/cn-filters.json，中文 text 即游戏「物品类别」字段）。
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

// 取词缀的筛选下限：优先 min 端（买家找不低于此值的）
function rollMin(stat) {
  const r = stat.rolls?.[0];
  if (!r) return undefined;
  return r.min != null ? r.min : r.value;
}

/**
 * @param parsedItem  parseItemText 产物
 * @param matched     matchItem 产物 [{mod, match}]
 * @param opts        { tierMax, includeUntiered, league, host, status }
 */
const { addDpsFilters } = require('./lib/weapon-dps.js');

function buildQuery(parsedItem, matched, opts = {}) {
  const {
    tierMax = 2,
    includeUntiered = false,
    league = '联赛',
    status = 'online',
  } = opts;

  const filters = [];
  const seen = new Set();
  for (const { mod, stat, match } of matched) {
    if (!match || !stat) continue;
    // 混合词缀多行可能命中同一 id（少见），去重
    const min = rollMin(stat);
    const dedupKey = `${match.id}:${min ?? ''}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    let disabled;
    if (parsedItem.rarity === '传奇') {
      // 传奇词缀固定，买家关心 roll 高低 → 全部启用（按 roll 下限筛）
      disabled = false;
    } else if (mod.tier != null) {
      disabled = mod.tier > tierMax; // T1/T2 启用，T3+ 禁用
    } else {
      disabled = !includeUntiered; // rune/implicit/基底 默认禁用
    }

    const filter = { id: match.id };
    if (min != null) filter.value = { min };
    if (disabled) filter.disabled = true;
    filters.push(filter);
  }

  // 国服 trade2 URL 载荷是【扁平结构】：{status, stats, filters} 直接在顶层，
  // 没有 {query:{...}, sort:{...}} 包裹（实测真实国服 URL 确认）。
  // 包错结构会导致市集报「无法使用搜索」。
  const query = {
    status: { option: status },
    stats: [{ type: 'and', filters }],
    filters: {},
  };

  // 国服精确匹配统一使用顶层 type：
  // 传奇 → "传奇名 基底名"（如「仇恨熔炉 铸锻护手」）
  // 稀有 → 基底名（如「雕饰战弩」），不使用随机装备名。
  if (parsedItem.rarity === '传奇' && parsedItem.name) {
    query.type = [parsedItem.name, parsedItem.baseName].filter(Boolean).join(' ');
  } else if (parsedItem.baseName) {
    query.type = parsedItem.baseName;
  }

  // 类别过滤
  const category = guessCategory(parsedItem);
  if (category) {
    query.filters.type_filters = { filters: { category: { option: category } } };
  }

  // 稀有度过滤：稀有→rare（避免混入传奇/魔法），传奇→unique
  const RARITY_OPTION = { '稀有': 'rare', '传奇': 'unique', '魔法': 'magic', '普通': 'normal' };
  const rarityOpt = RARITY_OPTION[parsedItem.rarity];
  if (rarityOpt) {
    query.filters.type_filters ??= { filters: {} };
    query.filters.type_filters.filters.rarity = { option: rarityOpt };
  }

  // 物品等级下限（可选，找同等或更高 ilvl 的基底）
  // ⚠️ 国服 filters API 确认 ilvl 属于 type_filters（不是 misc_filters，
  // EE2/国际服才放 misc）。放错分组会导致市集报「无法使用搜索」。
  if (parsedItem.itemLevel != null) {
    query.filters.type_filters ??= { filters: {} };
    query.filters.type_filters.filters.ilvl = { min: parsedItem.itemLevel };
  }

  // 武器 DPS 默认开启；可修改武器按 q20 物理 + 火/冰/电，不含暴击/混沌/装填。
  // 计算值保留在返回值，写入市集的 min 由独立 threshold 逻辑计算。
  const weaponDps = addDpsFilters(query, parsedItem, opts);

  return { query, league, weaponDps };
}

/**
 * 编码成市集 URL：JSON → gzip → base64url
 * 用 Node zlib（主进程比 CompressionStream 更稳），算法与油猴 codec.js 同源
 */
const zlib = require('node:zlib');
function encodeTradeUrl(queryObj, league, host = 'poe.game.qq.com') {
  const json = JSON.stringify(queryObj);
  const gz = zlib.gzipSync(Buffer.from(json, 'utf8'));
  const b64 = gz.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return Promise.resolve(`https://${host}/trade2/search/poe2/${encodeURIComponent(league)}/${b64}`);
}

module.exports = { buildQuery, encodeTradeUrl };
