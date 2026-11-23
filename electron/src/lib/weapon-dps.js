/**
 * EE2 风格的交易筛选武器面板 DPS。
 *
 * 只计算武器本地面板：物理按可修改武器 q20，元素只含火/冰/电。
 * 不含暴击、混沌、技能倍率、人物天赋、命中、抗性或战弩装填时间。
 */

const ELEMENT_NAMES = {
  fire: '火焰',
  cold: '冰霜',
  lightning: '闪电',
};

function statTexts(item) {
  return (item.mods || []).flatMap((mod) => (mod.stats || []).map((stat) => stat.text || ''));
}

function emptyRoll() {
  return { value: 0, min: 0, max: 0 };
}

// 只统计武器本地的 flat 与 increased；全局物理/元素伤害提高不参与。
function sumDamageStats(item) {
  const totals = {
    physicalFlat: emptyRoll(),
    physicalIncreased: emptyRoll(),
    fire: emptyRoll(),
    cold: emptyRoll(),
    lightning: emptyRoll(),
  };

  for (const text of statTexts(item)) {
    const increased = text.match(/^物理伤害提高\s*(-?[\d.]+)(?:\s*\((-?[\d.]+)-(-?[\d.]+)\))?\s*%/);
    if (increased) {
      totals.physicalIncreased.value += Number(increased[1]);
      totals.physicalIncreased.min += Number(increased[2] ?? increased[1]);
      totals.physicalIncreased.max += Number(increased[3] ?? increased[1]);
      continue;
    }

    const flat = text.match(/^(?:攻击)?附加\s*(-?[\d.]+)(?:\s*\((-?[\d.]+)-(-?[\d.]+)\))?\s*-\s*(-?[\d.]+)(?:\s*\((-?[\d.]+)-(-?[\d.]+)\))?\s*(物理|火焰|冰霜|闪电)伤害/);
    if (!flat) continue;
    const roll = {
      min: (Number(flat[1]) + Number(flat[4])) / 2,
      max: (Number(flat[1]) + Number(flat[4])) / 2,
      value: (Number(flat[1]) + Number(flat[4])) / 2,
    };
    roll.min = (Number(flat[2] ?? flat[1]) + Number(flat[5] ?? flat[4])) / 2;
    roll.max = (Number(flat[3] ?? flat[1]) + Number(flat[6] ?? flat[4])) / 2;
    const target = flat[7] === '物理' ? totals.physicalFlat
      : flat[7] === '火焰' ? totals.fire
      : flat[7] === '冰霜' ? totals.cold : totals.lightning;
    target.value += roll.value;
    target.min += roll.min;
    target.max += roll.max;
  }
  return totals;
}

function parseElementalHeader(value, mods = []) {
  const totals = { fire: emptyRoll(), cold: emptyRoll(), lightning: emptyRoll() };
  if (typeof value !== 'string') return totals;
  const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
  for (const part of parts) {
    const match = part.match(/^([\d.]+)\s*-\s*([\d.]+)(?:\s*\((fire|cold|lightning)\))?/);
    if (!match) continue;
    let element = match[3];
    // 单元素高级复制文本可能省略 (fire/cold/lightning)，按本地附加词缀判定。
    if (!element && parts.length === 1) {
      const texts = statTexts({ mods });
      element = Object.entries(ELEMENT_NAMES).find(([, name]) =>
        texts.some((text) => text.includes(`附加`) && text.includes(`${name}伤害`)))?.[0];
    }
    if (!element || !totals[element]) continue;
    totals[element].value = (Number(match[1]) + Number(match[2])) / 2;
    totals[element].min = totals[element].value;
    totals[element].max = totals[element].value;
  }
  return totals;
}

function isModifiable(item) {
  return !item.corrupted && !item.isCorrupted && !item.mirrored && !item.isMirrored &&
    !item.sanctified && !item.isSanctified;
}

function increased(flat, increasedPct, qualityPct) {
  return flat * (1 + increasedPct / 100) * (1 + qualityPct / 100);
}

/**
 * 返回 value/min/max 三种 DPS。min/max 是词缀 roll 范围，不是搜索阈值。
 * 所有值保持计算精度；显示取整与市集 threshold 另行处理。
 */
function calcWeaponDps(item) {
  const props = item.properties || {};
  const aps = props.attackSpeed;
  if (!Number.isFinite(aps) || aps <= 0) return undefined;

  const stats = sumDamageStats(item);
  const headerElements = parseElementalHeader(props.elementalDamage, item.mods);
  const physical = props.physicalDamage;
  const hasPhysical = physical && Number.isFinite(physical.min) && Number.isFinite(physical.max) &&
    physical.min + physical.max > 0;
  const hasElemental = Object.values(headerElements).some((entry) => entry.value > 0) ||
    ['fire', 'cold', 'lightning'].some((element) => stats[element].value > 0);
  // 没有物理面板但存在本地附加物理伤害时，只做 q0 的 flat 下限估计，
  // 不用 (P-I-F) 把未知基础伤害误算成负值。
  const physicalOnlyFromFlat = !hasPhysical && !hasElemental && stats.physicalFlat.value > 0;
  const quality = item.quality ?? 0;
  const q20 = isModifiable(item) ? Math.max(20, quality) : quality;

  let physicalAverage;
  if (physicalOnlyFromFlat) {
    physicalAverage = {
      value: stats.physicalFlat.value,
      min: stats.physicalFlat.min,
      max: stats.physicalFlat.max,
      base: 0,
      quality: 0,
      estimatedFromFlatOnly: true,
    };
  } else if (hasPhysical) {
    const currentAverage = (physical.min + physical.max) / 2;
    const increasedPct = stats.physicalIncreased.value;
    // B = P / ((1+Q)(1+I)) - F；随后以 B+F 重新施加 I 与 q20。
    const base = currentAverage / ((1 + quality / 100) * (1 + increasedPct / 100)) -
      stats.physicalFlat.value;
    const value = increased(base + stats.physicalFlat.value, increasedPct, q20);
    const min = increased(base + stats.physicalFlat.min, stats.physicalIncreased.min, q20);
    const max = increased(base + stats.physicalFlat.max, stats.physicalIncreased.max, q20);
    physicalAverage = { value, min: Math.min(min, max), max: Math.max(min, max), base, quality: q20 };
  }

  const elements = {};
  let hasElementalDamage = false;
  for (const element of Object.keys(ELEMENT_NAMES)) {
    const header = headerElements[element];
    const local = stats[element];
    if (header.value <= 0 && local.value <= 0) continue;
    hasElementalDamage = true;
    // EE2 以面板均值为当前值，词缀 roll 提供筛选上下界。
    const value = header.value > 0 ? header.value : local.value;
    elements[element] = { value, min: local.min, max: local.max };
    if (local.value <= 0) {
      elements[element].min = value;
      elements[element].max = value;
    }
  }

  if (!hasPhysical && !hasElemental && !physicalOnlyFromFlat) return undefined;
  const roll = (averages) => ({
    value: averages.reduce((sum, entry) => sum + entry.value, 0) * aps,
    min: averages.reduce((sum, entry) => sum + entry.min, 0) * aps,
    max: averages.reduce((sum, entry) => sum + entry.max, 0) * aps,
  });
  const elemental = Object.values(elements);
  const pDPS = (hasPhysical || physicalOnlyFromFlat) ? roll([physicalAverage]) : undefined;
  const eDPS = hasElemental ? roll(elemental) : undefined;
  const totalDPS = hasElemental ? roll([...((hasPhysical || physicalOnlyFromFlat) ? [physicalAverage] : []), ...elemental]) : undefined;

  return {
    attackSpeed: aps,
    physicalAverage,
    elements,
    pDPS,
    eDPS,
    totalDPS,
    display: {
      pDPS: pDPS ? Math.round(pDPS.value) : undefined,
      eDPS: eDPS ? Math.round(eDPS.value) : undefined,
      totalDPS: totalDPS ? Math.round(totalDPS.value) : undefined,
    },
  };
}

// EE2 普通/魔法/稀有使用 value ±2%，传奇按 roll 全距取比例；最终下限不超过理论最低 roll。
function searchMin(dps, rarity, rangePercent = 2) {
  if (!dps || !Number.isFinite(dps.value)) return undefined;
  const percent = Math.max(0, Math.min(2, rangePercent)) / 100;
  const theoreticalMin = Math.floor(dps.min);
  const requested = rarity === '传奇'
    ? dps.value - (dps.max - dps.min) * percent
    : dps.value * (1 - percent);
  return Math.max(theoreticalMin, Math.floor(requested));
}

function addDpsFilters(query, item, opts = {}) {
  if (opts.dps === false) return undefined;
  const dps = calcWeaponDps(item);
  if (!dps) return undefined;
  const rangePercent = opts.dpsRangePercent ?? 2;
  const filters = {};
  // 国服真实 URL 确认：dps/pdps/edps 可并存，各自使用独立的计算阈值。
  // 有对应伤害类型才生成该字段，不给纯物理武器虚构 edps=0 的条件。
  if (dps.totalDPS) filters.dps = { min: searchMin(dps.totalDPS, item.rarity, rangePercent) };
  if (dps.pDPS) filters.pdps = { min: searchMin(dps.pDPS, item.rarity, rangePercent) };
  if (dps.eDPS) filters.edps = { min: searchMin(dps.eDPS, item.rarity, rangePercent) };
  if (opts.dpsMin != null || opts.pdpsMin != null || opts.edpsMin != null) {
    for (const key of ['dps', 'pdps', 'edps']) {
      const requested = opts[`${key}Min`] ?? opts.dpsMin;
      if (filters[key] && requested != null) filters[key].min = Math.floor(requested);
    }
  }
  query.filters.equipment_filters = { disabled: false, filters };
  return dps;
}

module.exports = { calcWeaponDps, searchMin, addDpsFilters };
