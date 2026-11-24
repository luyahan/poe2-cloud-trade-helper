/**
 * 面板数值计算的共享小工具（weapon-dps / defences 共用）。
 * 纯函数、零平台依赖，可直接在 QuickJS 运行。
 */

/** 零初始化的 roll 累加器：value 当前值，min/max 理论 roll 边界 */
function emptyRoll() {
  return { value: 0, min: 0, max: 0 };
}

/**
 * 把正则捕获的数值三元组累加进 roll。
 * m[1]=当前值，m[2]/m[3]=区间上下限；无区间时回退到当前值。
 */
function addRollMatch(target, m) {
  const value = Number(m[1]);
  target.value += value;
  target.min += Number(m[2] ?? value);
  target.max += Number(m[3] ?? value);
}

/** 把一组 {value,min,max} 记录累加进 roll */
function addRolls(target, rolls) {
  for (const roll of rolls) {
    target.value += roll.value;
    target.min += roll.min;
    target.max += roll.max;
  }
}

/** 装备是否可修改：腐化/镜像/圣化装备不能上品质，保留原品质 */
function isModifiable(item) {
  return !item.corrupted && !item.isCorrupted && !item.mirrored && !item.isMirrored &&
    !item.sanctified && !item.isSanctified;
}

/** 反推用的目标品质：可修改装备按至少 20%，否则保留原品质 */
function effectiveQuality(item) {
  const quality = item.quality ?? 0;
  return isModifiable(item) ? Math.max(20, quality) : quality;
}

/** 装备全部词缀的文本行 */
function statTexts(item) {
  return (item.mods || []).flatMap((mod) => (mod.stats || []).map((stat) => stat.text || ''));
}

module.exports = { emptyRoll, addRollMatch, addRolls, isModifiable, effectiveQuality, statTexts };