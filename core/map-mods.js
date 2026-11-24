/**
 * 引路石（Waystone）map_filters 构造。
 *
 * 国服 /api/trade2/data/filters 的 map_filters 字段全集：
 *   map_tier / map_packsize / map_magic_monsters / map_rare_monsters /
 *   map_iir / map_revives / map_bonus / map_gold / map_experience
 *
 * 买家策略：以物品面板当前值为下限，向下微调 rangePercent（与武器 DPS 一致）。
 * 百分比字段（packsize/magic/rare/iir/bonus/gold/experience）直接 floor；
 * 整数字段（tier/revives）保留整数下限。
 */

const MAP_FIELDS = [
  { property: 'mapTier', filter: 'map_tier', label: '引路石等阶', integer: true },
  { property: 'mapPackSize', filter: 'map_packsize', label: '怪物群规模', integer: false },
  { property: 'mapMagicMonsters', filter: 'map_magic_monsters', label: '魔法怪物', integer: false },
  { property: 'mapRareMonsters', filter: 'map_rare_monsters', label: '稀有怪物', integer: false },
  { property: 'mapIir', filter: 'map_iir', label: '物品稀有度', integer: false },
  { property: 'mapRevives', filter: 'map_revives', label: '可用复活次数', integer: true },
  { property: 'mapBonus', filter: 'map_bonus', label: '引路石掉落几率', integer: false },
  { property: 'mapGold', filter: 'map_gold', label: '金币', integer: false },
  { property: 'mapExperience', filter: 'map_experience', label: '经验', integer: false },
];

// 引路石词缀文本中出现、但国服 map_filters 视作面板属性的关键词。
// 真实文本示例：「该区域内发现物品的稀有度提高 +35(30-40)%」「怪物群规模提高 26(20-30)%」。
// 这些数值应累加到 map_filters，而不是作为词缀 id 筛选。
const MOD_TO_FIELD = [
  { property: 'mapIir', pattern: /(?:区域内发现物品的稀有度|物品稀有度)(?:提高|增加)\s*\+?([\d.]+)/ },
  { property: 'mapPackSize', pattern: /怪物群(?:规模|大小)(?:提高|增加)\s*\+?([\d.]+)/ },
  { property: 'mapMagicMonsters', pattern: /魔法怪物(?:数量)?(?:提高|增加)\s*\+?([\d.]+)/ },
  { property: 'mapRareMonsters', pattern: /稀有怪物(?:数量)?(?:提高|增加)\s*\+?([\d.]+)/ },
  { property: 'mapBonus', pattern: /引路石掉落几率(?:提高|增加)\s*\+?([\d.]+)/ },
  { property: 'mapGold', pattern: /金币(?:提高|增加)\s*\+?([\d.]+)/ },
  { property: 'mapExperience', pattern: /经验(?:提高|增加)\s*\+?([\d.]+)/ },
];

function calcMapMods(item) {
  const props = item.properties || {};
  const output = {};
  for (const def of MAP_FIELDS) {
    const value = props[def.property];
    // 0 对复活次数等是合法值；其他百分比字段 0 视为无意义。
    if (!Number.isFinite(value)) continue;
    if (value <= 0 && def.property !== 'mapRevives') continue;
    output[def.property] = {
      filter: def.filter,
      label: def.label,
      integer: def.integer,
      panel: value,
      value,
      sources: ['panel'],
    };
  }
  // 引路石词缀中的面板属性：
  //   - 面板已有该字段时，augmented 值已包含词缀加成，跳过不累加。
  //   - 面板缺失时，把词缀值作为该字段的下限估计。
  for (const mod of item.mods || []) {
    const lines = (mod.statLines || []).concat((mod.stats || []).map((s) => s.text || ''));
    for (const line of lines) {
      for (const rule of MOD_TO_FIELD) {
        const m = line.match(rule.pattern);
        if (!m) continue;
        const value = Number(m[1]);
        if (!Number.isFinite(value)) continue;
        const def = MAP_FIELDS.find((f) => f.property === rule.property);
        if (!def) continue;
        if (output[rule.property]?.sources.includes('panel')) continue; // 面板优先
        if (!output[rule.property]) {
          output[rule.property] = {
            filter: def.filter,
            label: def.label,
            integer: def.integer,
            panel: 0,
            value: 0,
            sources: [],
          };
        }
        output[rule.property].value += value;
        if (!output[rule.property].sources.includes('mod')) {
          output[rule.property].sources.push('mod');
        }
      }
    }
  }
  return Object.keys(output).length ? output : undefined;
}

function addMapFilters(query, item, opts = {}) {
  if (opts.mapFilters === false) return undefined;
  // 只对引路石生效
  if (item.category !== '引路石') return undefined;
  const mapMods = calcMapMods(item);
  if (!mapMods) return undefined;
  const rangePercent = opts.mapRangePercent ?? opts.dpsRangePercent ?? 2;
  const percent = Math.max(0, Math.min(100, rangePercent)) / 100;
  const mapFilters = query.filters.map_filters ??= { disabled: false, filters: {} };
  mapFilters.disabled = false;
  for (const def of MAP_FIELDS) {
    const entry = mapMods[def.property];
    if (!entry) continue;
    const override = opts[`${def.filter}Min`];
    const value = override != null ? override : entry.value;
    // 整数面板不下调（如阶级/挑战次数）；百分比字段按 rangePercent 放宽下限
    const min = (override != null || def.integer)
      ? Math.max(0, Math.floor(value))
      : Math.max(0, Math.floor(value * (1 - percent)));
    mapFilters.filters[def.filter] = { min };
  }
  return mapMods;
}

module.exports = { calcMapMods, addMapFilters, MAP_FIELDS };
