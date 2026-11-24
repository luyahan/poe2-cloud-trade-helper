/**
 * EE2 风格的交易筛选武器面板 DPS。
 *
 * 只计算武器本地面板：物理按可修改武器 q20，元素只含火/冰/电。
 * 不含暴击、混沌、技能倍率、人物天赋、命中、抗性或战弩装填时间。
 */

const { emptyRoll, addRollMatch, effectiveQuality, statTexts } = require('./roll-utils.js');

const ELEMENTS = ['fire', 'cold', 'lightning'];
const ELEMENT_NAMES = { fire: '火焰', cold: '冰霜', lightning: '闪电' };
const FLAT_DAMAGE_TARGET = { 物理: 'physicalFlat', 火焰: 'fire', 冰霜: 'cold', 闪电: 'lightning' };

const PHYSICAL_INCREASED = /^物理伤害提高\s*(-?[\d.]+)(?:\s*\((-?[\d.]+)-(-?[\d.]+)\))?\s*%/;
const FLAT_DAMAGE = /^(?:攻击)?附加\s*(-?[\d.]+)(?:\s*\((-?[\d.]+)-(-?[\d.]+)\))?\s*-\s*(-?[\d.]+)(?:\s*\((-?[\d.]+)-(-?[\d.]+)\))?\s*(物理|火焰|冰霜|闪电)伤害/;
const ATTACK_SPEED_INCREASED = /^攻击速度提高\s*(-?[\d.]+)(?:\s*\((-?[\d.]+)-(-?[\d.]+)\))?\s*%/;

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
    const increased = text.match(PHYSICAL_INCREASED);
    if (increased) {
      addRollMatch(totals.physicalIncreased, increased);
      continue;
    }

    const flat = text.match(FLAT_DAMAGE);
    if (!flat) continue;
    // 附加 X-Y 伤害的面板均值取 (X+Y)/2；区间端点同口径。
    const low = Number(flat[1]);
    const high = Number(flat[4]);
    const target = totals[FLAT_DAMAGE_TARGET[flat[7]]];
    target.value += (low + high) / 2;
    target.min += (Number(flat[2] ?? flat[1]) + Number(flat[5] ?? flat[4])) / 2;
    target.max += (Number(flat[3] ?? flat[1]) + Number(flat[6] ?? flat[4])) / 2;
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
    const average = (Number(match[1]) + Number(match[2])) / 2;
    totals[element] = { value: average, min: average, max: average };
  }
  return totals;
}

/** 攻速 roll：面板 APS 是实际值（含品质），只按本地攻速词缀推导理论上下界 */
function sumAttackSpeed(item, aps) {
  const increased = emptyRoll();
  for (const text of statTexts(item)) {
    const match = text.match(ATTACK_SPEED_INCREASED);
    if (match) addRollMatch(increased, match);
  }
  const base = aps / (1 + increased.value / 100);
  return {
    value: aps,
    min: base * (1 + increased.min / 100),
    max: base * (1 + increased.max / 100),
    base,
    increased,
  };
}

/** 施加 increased% 与品质加成 */
function increased(flat, increasedPct, qualityPct) {
  return flat * (1 + increasedPct / 100) * (1 + qualityPct / 100);
}

/**
 * 物理均值反推：B = P / ((1+Q)(1+I)) - F，随后以 B+F 重新施加 I 与 q20。
 * 没有物理面板但存在本地附加物理伤害、且无任何元素伤害时，只做 q0 的
 * flat 下限估计，不用 (P-I-F) 把未知基础伤害误算成负值。
 */
function calcPhysicalAverage(props, stats, quality, q20, hasElemental) {
  const physical = props.physicalDamage;
  const hasPhysical = physical && Number.isFinite(physical.min) && Number.isFinite(physical.max) &&
    physical.min + physical.max > 0;
  if (!hasPhysical) {
    if (!hasElemental && stats.physicalFlat.value > 0) {
      return { ...stats.physicalFlat, base: 0, quality: 0, estimatedFromFlatOnly: true };
    }
    return undefined;
  }
  const currentAverage = (physical.min + physical.max) / 2;
  const increasedPct = stats.physicalIncreased.value;
  const base = currentAverage / ((1 + quality / 100) * (1 + increasedPct / 100)) -
    stats.physicalFlat.value;
  const min = increased(base + stats.physicalFlat.min, stats.physicalIncreased.min, q20);
  const max = increased(base + stats.physicalFlat.max, stats.physicalIncreased.max, q20);
  return {
    value: increased(base + stats.physicalFlat.value, increasedPct, q20),
    min: Math.min(min, max),
    max: Math.max(min, max),
    base,
    quality: q20,
  };
}

/** 各均值 × 对应攻速边界 → DPS roll */
function rollDps(entries, attackSpeed) {
  const sum = (key) => entries.reduce((total, entry) => total + entry[key], 0);
  return {
    value: sum('value') * attackSpeed.value,
    min: sum('min') * attackSpeed.min,
    max: sum('max') * attackSpeed.max,
  };
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
  const attackSpeed = sumAttackSpeed(item, aps);
  const quality = item.quality ?? 0;
  const q20 = effectiveQuality(item);

  const hasElemental = ELEMENTS.some((element) =>
    headerElements[element].value > 0 || stats[element].value > 0);
  const physicalAverage = calcPhysicalAverage(props, stats, quality, q20, hasElemental);

  const elements = {};
  let hasElementalDamage = false;
  for (const element of ELEMENTS) {
    const header = headerElements[element];
    const local = stats[element];
    if (header.value <= 0 && local.value <= 0) continue;
    hasElementalDamage = true;
    // EE2 以面板均值为当前值，词缀 roll 提供筛选上下界。
    const value = header.value > 0 ? header.value : local.value;
    elements[element] = local.value > 0
      ? { value, min: local.min, max: local.max }
      : { value, min: value, max: value };
  }

  if (!physicalAverage && !hasElementalDamage) return undefined;
  const pDPS = physicalAverage ? rollDps([physicalAverage], attackSpeed) : undefined;
  const elemental = Object.values(elements);
  const eDPS = hasElementalDamage ? rollDps(elemental, attackSpeed) : undefined;
  const totalDPS = hasElementalDamage
    ? rollDps([...(physicalAverage ? [physicalAverage] : []), ...elemental], attackSpeed)
    : undefined;

  const round = (dps) => (dps ? Math.round(dps.value) : undefined);
  return {
    attackSpeed,
    physicalAverage,
    elements,
    pDPS,
    eDPS,
    totalDPS,
    display: {
      pDPS: round(pDPS),
      eDPS: round(eDPS),
      totalDPS: round(totalDPS),
      fireDPS: elements.fire ? Math.round(elements.fire.value * attackSpeed.value) : undefined,
      coldDPS: elements.cold ? Math.round(elements.cold.value * attackSpeed.value) : undefined,
      lightningDPS: elements.lightning ? Math.round(elements.lightning.value * attackSpeed.value) : undefined,
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
  for (const key of ['dps', 'pdps', 'edps']) {
    const requested = opts[`${key}Min`] ?? opts.dpsMin;
    if (filters[key] && requested != null) filters[key].min = Math.floor(requested);
  }
  // ??= 合并而非整组覆盖：equipment_filters 还可能承载插槽/防御等字段，
  // 各 add*Filters 的调用顺序不应影响彼此结果。
  const equipment = query.filters.equipment_filters ??= { disabled: false, filters: {} };
  equipment.disabled = false;
  Object.assign(equipment.filters, filters);
  return dps;
}

module.exports = { calcWeaponDps, searchMin, addDpsFilters };