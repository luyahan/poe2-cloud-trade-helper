/**
 * EE2 风格的装备面板防御值与国服 equipment_filters。
 * 可修改装备按至少 20% 品质反推；腐化/镜像等保留原品质。
 * 只统计装备本地防御词缀，不计算全局防御或人物加成。
 */

const { searchMin } = require('./weapon-dps.js');
const { emptyRoll, addRollMatch, addRolls, effectiveQuality, statTexts } = require('./roll-utils.js');

// 数值（可带 roll 区间）的公共正则片段，四种防御的 flat 正则共用
const NUM_WITH_RANGE = String.raw`(-?[\d.]+)(?:\s*\((-?[\d.]+)-(-?[\d.]+)\))?`;

// increased 不走文本正则：本地/全局「护甲提高」文本相同，须按已核实的
// trade id 区分（见 LOCAL_INCREASED_IDS / HYBRID_INCREASED）。
const DEFENCES = {
  armour: {
    property: 'armour', filter: 'ar', label: '护甲',
    flat: /^\+?NUM\s*护甲$/,
  },
  evasion: {
    property: 'evasion', filter: 'ev', label: '闪避',
    flat: /^\+?NUM\s*(?:点)?闪避值$/,
  },
  energyShield: {
    property: 'energyShield', filter: 'es', label: '能量护盾',
    flat: /^\+?NUM\s*(?:点)?能量护盾(?:上限)?$/,
  },
  ward: {
    property: 'ward', filter: 'ward', label: '符文结界',
    flat: /^\+?NUM\s*符文(?:结界|壁垒)(?:上限)?$/,
  },
};
// 把占位符展开成真实正则（source 里的 NUM 替换为数值片段）
for (const definition of Object.values(DEFENCES)) {
  definition.flat = new RegExp(definition.flat.source.replaceAll('NUM', NUM_WITH_RANGE));
}

const HYBRID_INCREASED = [
  { ids: ['explicit.stat_3523867985', 'rune.stat_3523867985'], targets: ['armour', 'evasion', 'energyShield'] },
  { ids: ['explicit.stat_2451402625', 'crafted.stat_2451402625'], targets: ['armour', 'evasion'] },
  { ids: ['explicit.stat_3321629045', 'rune.stat_3321629045'], targets: ['armour', 'energyShield'] },
  { ids: ['explicit.stat_1999113824', 'rune.stat_1999113824'], targets: ['evasion', 'energyShield'] },
];

const LOCAL_INCREASED_IDS = {
  armour: ['explicit.stat_1062208444', 'explicit.stat_2866361420'],
  evasion: ['explicit.stat_124859000', 'explicit.stat_2106365538'],
  energyShield: ['explicit.stat_4015621042', 'explicit.stat_2482852589'],
};

/**
 * 收集每条已核实 trade id 的 roll 记录（同 id 多条词缀都保留）。
 * 优先用词典匹配结果；直接调用 calcDefences(item) 时回退到 stat 上保留的 ID。
 */
function collectRollsById(item, matched) {
  const byId = new Map();
  const push = (id, roll) => {
    if (!id || !roll) return;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push({ value: roll.value, min: roll.min ?? roll.value, max: roll.max ?? roll.value });
  };
  if (matched.length) {
    for (const { stat, match } of matched) {
      push(match?.id || stat?.tradeId, stat?.rolls?.[match?.valueRollIndex ?? 0]);
    }
  } else {
    for (const mod of item.mods || []) {
      for (const stat of mod.stats || []) push(stat.tradeId, stat.rolls?.[0]);
    }
  }
  return byId;
}

/** 本地 increased：区域 ID 优先于无区域后缀的同名全局词缀，命中即停 */
function sumLocalIncreased(byId, ids) {
  const total = emptyRoll();
  const ordered = [...ids].sort((a, b) => Number(byId.has(b)) - Number(byId.has(a)));
  for (const id of ordered) {
    if (!byId.has(id)) continue;
    addRolls(total, byId.get(id));
    break;
  }
  return total;
}

/** 混合防御词缀（护甲+闪避等）对每个覆盖的防御都计完整数值 */
function sumHybridIncreased(byId, key) {
  const total = emptyRoll();
  for (const hybrid of HYBRID_INCREASED) {
    if (!hybrid.targets.includes(key)) continue;
    for (const id of hybrid.ids) addRolls(total, byId.get(id) || []);
  }
  return total;
}

/** 不随品质变化的面板字段（格挡/精魂），直接保留面板值 */
function constantEntry(filter, label, panel) {
  return { filter, label, panel, value: panel, min: panel, max: panel, display: panel };
}

function calcDefences(item, matched = []) {
  const props = item.properties || {};
  const quality = item.quality ?? 0;
  const q20 = effectiveQuality(item);
  const byId = collectRollsById(item, matched);
  const texts = statTexts(item);
  const output = {};

  for (const [key, definition] of Object.entries(DEFENCES)) {
    const panel = props[definition.property];
    if (!Number.isFinite(panel) || panel <= 0) continue;

    const flat = emptyRoll();
    for (const text of texts) {
      const match = text.match(definition.flat);
      if (match) addRollMatch(flat, match);
    }
    const local = sumLocalIncreased(byId, LOCAL_INCREASED_IDS[key] || []);
    const hybrid = sumHybridIncreased(byId, key);
    const increased = emptyRoll();
    addRolls(increased, [local, hybrid]);

    const base = panel / ((1 + quality / 100) * (1 + increased.value / 100)) - flat.value;
    const atQuality = (flatValue, increasedValue) =>
      (base + flatValue) * (1 + increasedValue / 100) * (1 + q20 / 100);
    const value = atQuality(flat.value, increased.value);
    const min = atQuality(flat.min, increased.min);
    const max = atQuality(flat.max, increased.max);
    output[key] = {
      filter: definition.filter,
      label: definition.label,
      panel,
      base,
      quality: q20,
      flat,
      increased,
      value,
      min: Math.min(min, max),
      max: Math.max(min, max),
      display: Math.round(value),
    };
  }

  if (Number.isFinite(props.block) && props.block > 0) output.block = constantEntry('block', '格挡', props.block);
  if (Number.isFinite(props.spirit) && props.spirit > 0) output.spirit = constantEntry('spirit', '精魂', props.spirit);
  return Object.keys(output).length ? output : undefined;
}

function addDefenceFilters(query, item, opts = {}, matched = []) {
  if (opts.defences === false) return undefined;
  const defences = calcDefences(item, matched);
  if (!defences) return undefined;
  const rangePercent = opts.defenceRangePercent ?? opts.dpsRangePercent ?? 2;
  const equipment = query.filters.equipment_filters ??= { disabled: false, filters: {} };
  equipment.disabled = false;
  for (const defence of Object.values(defences)) {
    const override = opts[`${defence.filter}Min`];
    equipment.filters[defence.filter] = {
      min: override != null ? Math.floor(override) : searchMin(defence, item.rarity, rangePercent),
    };
  }
  return defences;
}

module.exports = { calcDefences, addDefenceFilters };