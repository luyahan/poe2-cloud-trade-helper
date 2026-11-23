const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseItemText } = require('../src/lib/parse-item.js');
const { calcWeaponDps, searchMin } = require('../src/lib/weapon-dps.js');
const { buildQuery } = require('../src/query.js');

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
  assert.ok(Math.abs(dps.pDPS.value - 324) < 1e-9);
  assert.equal(searchMin(dps.totalDPS, item.rarity), 420);
});

test('腐化装备保留原品质，不自动补到 q20', () => {
  const corrupted = parseItemText(`${SAMPLE.replace('每秒攻击次数: 1.50', '每秒攻击次数: 1.50\n--------\n被腐化')}`);
  assert.equal(corrupted.corrupted, true);
  const dps = calcWeaponDps(corrupted);
  assert.equal(dps.physicalAverage.quality, 10);
  assert.equal(dps.display.pDPS, 297);
});

test('查询：传奇 type 拼接传奇名与基底名，不生成 name', () => {
  const item = parseItemText(`物品类别: 手套
稀有度: 传奇
仇恨熔炉
铸锻护手
--------
{ 传奇属性 — 护甲 }
护甲提高 300%`);
  const { query } = buildQuery(item, [], {});
  assert.equal(query.type, '仇恨熔炉 铸锻护手');
  assert.equal('name' in query, false);
  assert.equal(query.filters.type_filters.filters.rarity.option, 'unique');
});

test('查询：混合武器生成总/物理/元素三种独立阈值，并启用装备过滤组', () => {
  const item = parseItemText(SAMPLE);
  const { query, weaponDps } = buildQuery(item, [], {});
  assert.deepEqual(query.filters.equipment_filters, {
    disabled: false,
    filters: { dps: { min: 420 }, pdps: { min: 317 }, edps: { min: 105 } },
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
  assert.deepEqual(query.filters.equipment_filters, { disabled: false, filters: { pdps: { min: 270 } } });
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
