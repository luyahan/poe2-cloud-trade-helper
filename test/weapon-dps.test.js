const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { parseItemText } = require('@poe2/core/parse-item');
const { calcWeaponDps, searchMin } = require('@poe2/core/weapon-dps');
const { buildQuery } = require('@poe2/core/query');

const SAMPLE = `物品类别: 单手锤
稀有度: 稀有
日象 巨锤
钉头锤
--------
品质: +10% (augmented)
物理伤害: 168-228 (augmented)
元素伤害: 20-40 (fire), 10-30 (cold), 20-20 (lightning)
每秒攻击次数: 1.50
--------
{ 前缀属性 "物理附加" (等阶：1) }
附加 10 (5-10) - 20 (15-25) 物理伤害
{ 前缀属性 "物理提高" (等阶：1) }
物理伤害提高 50 (40-60)%
{ 前缀属性 "火焰" (等阶：1) }
附加 30 (20-30) - 50 (40-60) 火焰伤害
{ 前缀属性 "冰霜" (等阶：1) }
附加 20 (10-20) - 40 (30-50) 冰霜伤害
{ 前缀属性 "闪电" (等阶：1) }
附加 20 (20-20) - 20 (20-20) 闪电伤害`;

test('EE2 算例：q20 pDPS=324，eDPS=105，totalDPS=429', () => {
  const item = parseItemText(SAMPLE);
  // B = 198 / (1.1 * 1.5) - 15 = 105；P(q20) = (105 + 15) * 1.5 * 1.2 = 216。
  assert.equal(item.derived.weaponDps.display.pDPS, 324);
  assert.equal(item.derived.weaponDps.display.eDPS, 105);
  assert.equal(item.derived.weaponDps.display.totalDPS, 429);
  assert.equal(item.derived.weaponDps.physicalAverage.quality, 20);
  const dps = calcWeaponDps(item);
  assert.equal(dps.display.pDPS, 324);
  assert.equal(dps.display.eDPS, 105);
  assert.equal(dps.display.totalDPS, 429);
  assert.equal(dps.display.fireDPS, 45);
  assert.equal(dps.display.coldDPS, 30);
  assert.equal(dps.display.lightningDPS, 30);
  assert.equal(searchMin(dps.totalDPS, item.rarity), 420);
});

test('腐化装备保留原品质，不自动补到 q20', () => {
  const corrupted = parseItemText(`${SAMPLE.replace('每秒攻击次数: 1.50', '每秒攻击次数: 1.50\n--------\n被腐化')}`);
  assert.equal(corrupted.corrupted, true);
  const dps = calcWeaponDps(corrupted);
  assert.equal(dps.physicalAverage.quality, 10);
  assert.equal(dps.display.pDPS, 297);
});

test('查询：传奇名与基底名分别写入 name 和 type', () => {
  const item = parseItemText(`物品类别: 手套
稀有度: 传奇
仇恨熔炉
铸锻护手
--------
{ 传奇属性 — 护甲 }
护甲提高 300%`);
  const { query } = buildQuery(item, [], {});
  assert.equal(query.name, '仇恨熔炉');
  assert.equal(query.type, '铸锻护手');
  assert.equal(query.filters.type_filters.filters.rarity.option, 'unique');
});

test('查询：混合武器生成总/物理/元素三种独立阈值，并启用装备过滤组', () => {
  const item = parseItemText(SAMPLE);
  const { query, weaponDps } = buildQuery(item, [], {});
  assert.deepEqual(query.filters.equipment_filters, {
    disabled: false,
    filters: {
      dps: { min: 420 }, pdps: { min: 317 }, edps: { min: 105 },
      damage: { min: 286 }, aps: { min: 1.5 },
    },
  });
  assert.equal(weaponDps.display.totalDPS, 429);
  assert.equal(weaponDps.display.eDPS, 105);
  assert.equal(weaponDps.display.pDPS, 324);
});

test('查询：纯物理武器只生成 pdps，不生成 dps/edps', () => {
  const item = parseItemText(`物品类别: 单手锤
稀有度: 稀有
测试武器
钉头锤
--------
物理伤害: 150-150
每秒攻击次数: 1.50
--------
{ 前缀属性 "物理提高" (等阶：1) }
物理伤害提高 50 (50-50)%`);
  const { query, weaponDps } = buildQuery(item, [], {});
  assert.equal(weaponDps.display.pDPS, 270);
  assert.equal(weaponDps.totalDPS, undefined);
  // 固定 roll 的理论最低值也是 270，因此 2% 下限会被钳制为 270。
  assert.deepEqual(query.filters.equipment_filters, {
    disabled: false,
    filters: { pdps: { min: 270 }, damage: { min: 180 }, aps: { min: 1.5 } },
  });
});

test('查询：手动 dpsMin 只覆盖阈值，不覆盖计算值', () => {
  const item = parseItemText(SAMPLE);
  const { query, weaponDps } = buildQuery(item, [], { dpsMin: 400 });
  assert.equal(query.filters.equipment_filters.filters.dps.min, 400);
  assert.equal(query.filters.equipment_filters.filters.pdps.min, 400);
  assert.equal(query.filters.equipment_filters.filters.edps.min, 400);
  assert.equal(weaponDps.display.totalDPS, 429);
});

test('查询：pdpsMin/edpsMin 可分别覆盖对应阈值', () => {
  const item = parseItemText(SAMPLE);
  const { query } = buildQuery(item, [], { pdpsMin: 300, edpsMin: 90 });
  assert.deepEqual(query.filters.equipment_filters.filters, {
    dps: { min: 420 }, pdps: { min: 300 }, edps: { min: 90 },
    damage: { min: 286 }, aps: { min: 1.5 },
  });
});

test('查询：物理面板缺失时只用本地 flat 估计，不虚构负基础伤害', () => {
  const item = parseItemText(`物品类别: 单手锤
稀有度: 稀有
测试武器
钉头锤
--------
每秒攻击次数: 2.00
--------
{ 前缀属性 "物理附加" (等阶：1) }
附加 10 (5-10) - 20 (15-25) 物理伤害
{ 前缀属性 "物理提高" (等阶：1) }
物理伤害提高 50 (40-60)%`);
  const dps = calcWeaponDps(item);
  assert.equal(dps.display.pDPS, 30);
  assert.equal(dps.physicalAverage.estimatedFromFlatOnly, true);
});

test('计算：攻速按词缀范围反推，符文元素伤害参与汇总', () => {
  const item = parseItemText(`物品类别: 单手锤
稀有度: 稀有
测试武器
钉头锤
--------
物理伤害: 150-150
每秒攻击次数: 1.50
--------
{ 前缀属性 "物理提高" (等阶：1) }
物理伤害提高 50 (50-50)%
{ 后缀属性 "攻速" (等阶：1) }
攻击速度提高 20 (10-30)%
附加 30 (30-30) - 50 (50-50) 火焰伤害 (rune)`);
  const dps = calcWeaponDps(item);
  assert.equal(dps.attackSpeed.value, 1.5);
  assert.equal(dps.attackSpeed.base, 1.25);
  assert.equal(dps.attackSpeed.min, 1.375);
  assert.equal(dps.attackSpeed.max, 1.625);
  assert.equal(dps.display.fireDPS, 60);
  assert.equal(dps.display.eDPS, 60);
  assert.equal(dps.display.totalDPS, 330);
});

test('查询：关闭 DPS 筛选仍保留计算值供托盘显示', () => {
  const item = parseItemText(SAMPLE);
  const { query, weaponDps } = buildQuery(item, [], { dps: false });
  assert.equal(query.filters.equipment_filters, undefined);
  assert.equal(weaponDps, undefined);
  assert.equal(item.derived.weaponDps.display.totalDPS, 429);
});

// ---- 截图基准回归（2026-11-24 用户提供市集装备过滤器截图）----
// 伤害 331 / 攻速 1.91 / 暴击 5 / 总DPS 631.68 / 物理DPS 153.63 / 元素DPS 478.05。
// 截图 DPS 用面板显示攻速反推（1.91 实为 1.908 截断显示），故与全精度值差 ~0.1%；
// 我们的 dps/pdps/edps 下限（2% 下调）比截图更宽，不会排除截图能搜到的挂单。
const hammerSample = readFileSync(join(__dirname, '../data/sample-item.txt'), 'utf8');

test('截图基准：样本锤面板字段 damage=331 / aps=1.91 / crit=5 精确写入', () => {
  const item = parseItemText(hammerSample);
  const { query, weaponDps } = buildQuery(item, [], {});
  const eq = query.filters.equipment_filters.filters;
  // 伤害 = q20 物理均值 80.5 + 火 115.5 + 冰 35 + 电 100
  assert.equal(eq.damage.min, 331);
  assert.equal(eq.aps.min, 1.91);
  assert.equal(eq.crit.min, 5);
  assert.equal(weaponDps.display.damage, 331);
  assert.equal(weaponDps.damageAverage, 331);
});

test('截图基准：DPS 全精度值与截图两位小数口径一致（±0.2%）', () => {
  const dps = calcWeaponDps(parseItemText(hammerSample));
  // 截图：631.68 / 153.63 / 478.05（面板显示攻速口径）
  assert.ok(Math.abs(dps.totalDPS.value - 631.68) / 631.68 < 0.002);
  assert.ok(Math.abs(dps.pDPS.value - 153.63) / 153.63 < 0.002);
  assert.ok(Math.abs(dps.eDPS.value - 478.05) / 478.05 < 0.002);
  // 2% 下调后的搜索下限必须不高于截图精确值（买家视角只宽不严）
  const { query } = buildQuery(parseItemText(hammerSample), [], {});
  const eq = query.filters.equipment_filters.filters;
  assert.ok(eq.dps.min <= 631.68);
  assert.ok(eq.pdps.min <= 153.63);
  assert.ok(eq.edps.min <= 478.05);
});

test('面板字段：damageMin/apsMin/critMin 覆盖，panel=false 整体关闭', () => {
  const item = parseItemText(hammerSample);
  const overridden = buildQuery(item, [], { damageMin: 300, apsMin: 1.8, critMin: 4 });
  const eq = overridden.query.filters.equipment_filters.filters;
  assert.deepEqual([eq.damage, eq.aps, eq.crit], [{ min: 300 }, { min: 1.8 }, { min: 4 }]);
  const off = buildQuery(item, [], { panel: false });
  const offEq = off.query.filters.equipment_filters.filters;
  assert.equal(offEq.damage, undefined);
  assert.equal(offEq.aps, undefined);
  assert.equal(offEq.crit, undefined);
  assert.ok(offEq.dps, 'panel=false 只关面板字段，DPS 下限保留');
});

test('面板字段：无暴击行不虚构 crit；纯物理武器不虚构 aps 以外的元素条件', () => {
  const item = parseItemText(`物品类别: 单手锤
稀有度: 稀有
测试武器
钉头锤
--------
物理伤害: 150-150
每秒攻击次数: 1.50`);
  const { query } = buildQuery(item, [], {});
  const eq = query.filters.equipment_filters.filters;
  assert.equal(eq.crit, undefined);
  assert.deepEqual(eq.damage, { min: 180 });
  assert.deepEqual(eq.aps, { min: 1.5 });
  assert.equal(eq.edps, undefined);
});

test('解析：元素分类只含火/冰/电，混沌不参与总 DPS', () => {
  const item = parseItemText(`物品类别: 战矛
稀有度: 稀有
测试武器
宏伟战矛
--------
元素伤害: 30-50 (fire), 10-20 (chaos)
每秒攻击次数: 2.00
--------
{ 前缀属性 "火焰" (等阶：1) }
附加 30 - 50 火焰伤害
{ 前缀属性 "混沌" (等阶：1) }
附加 10 - 20 混沌伤害`);
  const dps = calcWeaponDps(item);
  assert.deepEqual(Object.keys(dps.elements), ['fire']);
  assert.equal(dps.display.eDPS, 80);
  assert.equal(dps.display.totalDPS, 80);
});
