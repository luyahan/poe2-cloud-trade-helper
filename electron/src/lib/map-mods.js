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
  { property: 'mapTier', filter: 'map_tier', label: '引路石阶级', integer: true },
  { property: 'mapPackSize', filter: 'map_packsize', label: '怪物群大小', integer: false },
  { property: 'mapMagicMonsters', filter: 'map_magic_monsters', label: '魔法怪物', integer: false },
  { property: 'mapRareMonsters', filter: 'map_rare_monsters', label: '稀有怪物', integer: false },
  { property: 'mapIir', filter: 'map_iir', label: '物品稀有度', integer: false },
  { property: 'mapRevives', filter: 'map_revives', label: '挑战次数', integer: true },
  { property: 'mapBonus', filter: 'map_bonus', label: '掉落几率', integer: false },
  { property: 'mapGold', filter: 'map_gold', label: '金币', integer: false },
  { property: 'mapExperience', filter: 'map_experience', label: '经验', integer: false },
];

function calcMapMods(item) {
  const props = item.properties || {};
  const output = {};
  for (const def of MAP_FIELDS) {
    const value = props[def.property];
    if (!Number.isFinite(value) || value <= 0) continue;
    output[def.property] = {
      filter: def.filter,
      label: def.label,
      integer: def.integer,
      panel: value,
      value,
    };
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
    if (override != null) {
      mapFilters.filters[def.filter] = { min: def.integer ? Math.floor(override) : Math.floor(override) };
      continue;
    }
    const value = entry.value;
    const min = def.integer
      ? Math.max(0, Math.floor(value)) // 整数面板不下调（如阶级/挑战次数）
      : Math.max(0, Math.floor(value * (1 - percent)));
    mapFilters.filters[def.filter] = { min };
  }
  return mapMods;
}

module.exports = { calcMapMods, addMapFilters, MAP_FIELDS };
