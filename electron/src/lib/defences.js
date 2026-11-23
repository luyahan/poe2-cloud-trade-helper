/**
 * EE2 风格的装备面板防御值与国服 equipment_filters。
 * 可修改装备按至少 20% 品质反推；腐化/镜像等保留原品质。
 * 只统计装备本地防御词缀，不计算全局防御或人物加成。
 */

const { searchMin } = require('./weapon-dps.js');

const DEFENCES = {
  armour: {
    property: 'armour', filter: 'ar', label: '护甲',
    flat: /^\+?(-?[\d.]+)(?:\s*\((-?[\d.]+)-(-?[\d.]+)\))?\s*护甲$/,
    increased: /^护甲提高\s*(-?[\d.]+)(?:\s*\((-?[\d.]+)-(-?[\d.]+)\))?\s*%/,
  },
  evasion: {
    property: 'evasion', filter: 'ev', label: '闪避',
    flat: /^\+?(-?[\d.]+)(?:\s*\((-?[\d.]+)-(-?[\d.]+)\))?\s*(?:点)?闪避值$/,
    increased: /^闪避值提高\s*(-?[\d.]+)(?:\s*\((-?[\d.]+)-(-?[\d.]+)\))?\s*%/,
  },
  energyShield: {
    property: 'energyShield', filter: 'es', label: '能量护盾',
    flat: /^\+?(-?[\d.]+)(?:\s*\((-?[\d.]+)-(-?[\d.]+)\))?\s*(?:点)?能量护盾(?:上限)?$/,
    increased: /^能量护盾(?:上限)?提高\s*(-?[\d.]+)(?:\s*\((-?[\d.]+)-(-?[\d.]+)\))?\s*%/,
  },
  ward: {
    property: 'ward', filter: 'ward', label: '符文结界',
    flat: /^\+?(-?[\d.]+)(?:\s*\((-?[\d.]+)-(-?[\d.]+)\))?\s*符文(?:结界|壁垒)(?:上限)?$/,
    increased: /^符文(?:结界|壁垒)(?:上限)?提高\s*(-?[\d.]+)(?:\s*\((-?[\d.]+)-(-?[\d.]+)\))?\s*%/,
  },
};

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

function emptyRoll() {
  return { value: 0, min: 0, max: 0 };
}

function addRoll(target, match) {
  const value = Number(match[1]);
  target.value += value;
  target.min += Number(match[2] ?? value);
  target.max += Number(match[3] ?? value);
}

function isModifiable(item) {
  return !item.corrupted && !item.isCorrupted && !item.mirrored && !item.isMirrored &&
    !item.sanctified && !item.isSanctified;
}

function statLines(item) {
  return (item.mods || []).flatMap((mod) => (mod.stats || []).map((stat) => stat.text || ''));
}

function calcDefences(item, matched = []) {
  const props = item.properties || {};
  const quality = item.quality ?? 0;
  const q20 = isModifiable(item) ? Math.max(20, quality) : quality;
  const output = {};
  const byId = new Map();
  for (const { stat, match } of matched) {
    if (!stat?.rolls?.length) continue;
    const id = match?.id || stat.tradeId;
    if (!id) continue;
    const roll = stat.rolls[match?.valueRollIndex ?? 0];
    if (!roll) continue;
    const entry = { value: roll.value, min: roll.min ?? roll.value, max: roll.max ?? roll.value };
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(entry);
  }
  // 直接调用 calcDefences(item) 时使用解析/匹配后保留在 stat 上的 ID。
  if (!matched.length) {
    for (const mod of item.mods || []) for (const stat of mod.stats || []) {
      if (!stat.tradeId || !stat.rolls?.length) continue;
      const roll = stat.rolls[0];
      const entry = { value: roll.value, min: roll.min ?? roll.value, max: roll.max ?? roll.value };
      if (!byId.has(stat.tradeId)) byId.set(stat.tradeId, []);
      byId.get(stat.tradeId).push(entry);
    }
  }

  for (const [key, definition] of Object.entries(DEFENCES)) {
    const panel = props[definition.property];
    if (!Number.isFinite(panel) || panel <= 0) continue;
    const flat = emptyRoll();
    const increased = emptyRoll();
    const localIds = LOCAL_INCREASED_IDS[key] || [];
    // 已匹配的区域 ID 优先于无区域后缀的同名全局词缀。
    const orderedIds = [...localIds].sort((a, b) => Number(byId.has(b)) - Number(byId.has(a)));
    for (const id of orderedIds) {
      for (const roll of byId.get(id) || []) {
        increased.value += roll.value;
        increased.min += roll.min;
        increased.max += roll.max;
      }
      if (byId.has(id)) break;
    }
    for (const hybrid of HYBRID_INCREASED) {
      if (!hybrid.targets.includes(key)) continue;
      for (const id of hybrid.ids) {
        for (const roll of byId.get(id) || []) {
          increased.value += roll.value;
          increased.min += roll.min;
          increased.max += roll.max;
        }
      }
    }
    for (const text of statLines(item)) {
      const singleFlat = text.match(definition.flat);
      if (singleFlat) addRoll(flat, singleFlat);
    }
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

  // 格挡、精魂不随品质增加，直接保留面板值。
  if (Number.isFinite(props.block) && props.block > 0) {
    output.block = { filter: 'block', label: '格挡', panel: props.block, value: props.block, min: props.block, max: props.block, display: props.block };
  }
  if (Number.isFinite(props.spirit) && props.spirit > 0) {
    output.spirit = { filter: 'spirit', label: '精魂', panel: props.spirit, value: props.spirit, min: props.spirit, max: props.spirit, display: props.spirit };
  }
  return Object.keys(output).length ? output : undefined;
}

function addDefenceFilters(query, item, opts = {}, matched = []) {
  if (opts.defences === false) return undefined;
  const defences = calcDefences(item, matched);
  if (!defences) return undefined;
  const rangePercent = opts.defenceRangePercent ?? opts.dpsRangePercent ?? 2;
  const equipment = query.filters.equipment_filters ??= { disabled: false, filters: {} };
  equipment.disabled = false;
  for (const [key, defence] of Object.entries(defences)) {
    const override = opts[`${defence.filter}Min`];
    equipment.filters[defence.filter] = {
      min: override != null ? Math.floor(override) : searchMin(defence, item.rarity, rangePercent),
    };
  }
  return defences;
}

module.exports = { calcDefences, addDefenceFilters };
