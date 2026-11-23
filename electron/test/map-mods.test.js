const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseItemText } = require('../src/lib/parse-item.js');
const { calcMapMods } = require('../src/lib/map-mods.js');
const { buildQuery } = require('../src/query.js');
const { compileDictionary, matchItem } = require('../src/lib/match-stats.js');
const compiled = compileDictionary(JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, '../../cn-stats.json'), 'utf8')));

const WAYSTONE = `物品类别: 引路石
稀 有 度: 稀有
枯萎之径
引路石 (等阶 15)
--------
引路石等阶: 15
可用复活次数: 1
引路石掉落几率: +185% (augmented)
--------
物品等级: 79
--------
{ 前缀词缀“丰饶的” }
该区域内发现物品的稀有度提高 +35(30-40)%
{ 前缀词缀“密集的” }
怪物群规模提高 26(20-30)%
{ 前缀词缀“阴燃的” }
怪物造成相当于 28(25-30)% 伤害的额外火焰伤害
{ 后缀词缀“之暴露” }
玩家的所有最大抗性 -10(-12--8)%
{ 后缀词缀“之杀戮” }
怪物的暴击率提高 34(30-40)%
怪物的暴击伤害加成 +32(25-35)%
{ 后缀词缀“之时空锁链” }
玩家受到时空锁链诅咒`;

test('引路石：解析面板字段（真实文本变体）', () => {
  const item = parseItemText(WAYSTONE);
  assert.equal(item.category, '引路石');
  assert.equal(item.rarity, '稀有');
  assert.equal(item.properties.mapTier, 15);
  assert.equal(item.properties.mapRevives, 1);
  assert.equal(item.properties.mapBonus, 185);
  // 6 条词缀全部解析出来（含多行合并的"之杀戮"）
  assert.equal(item.mods.length, 6);
  const carnage = item.mods.find((m) => m.name === '之杀戮');
  assert.ok(carnage);
  assert.equal(carnage.stats.length, 2);
});

test('引路石：写入 map_filters 且词缀默认全部禁用', () => {
  const item = parseItemText(WAYSTONE);
  const matched = matchItem(item, compiled);
  const { query, mapMods } = buildQuery(item, matched, {});
  // 类别正确
  assert.equal(query.filters.type_filters.filters.category.option, 'map.waystone');
  assert.equal(query.filters.type_filters.filters.rarity.option, 'rare');
  // map_filters 包含面板字段 + 词缀归集字段
  const mf = query.filters.map_filters;
  assert.ok(mf);
  assert.equal(mf.disabled, false);
  assert.equal(mf.filters.map_tier.min, 15);
  assert.equal(mf.filters.map_revives.min, 1);
  assert.equal(mf.filters.map_bonus.min, Math.floor(185 * 0.98));   // 181
  // 词缀中的"物品稀有度提高 35%"归集到 map_iir
  assert.equal(mf.filters.map_iir.min, Math.floor(35 * 0.98));      // 34
  // 词缀中的"怪物群规模提高 26%"归集到 map_packsize
  assert.equal(mf.filters.map_packsize.min, Math.floor(26 * 0.98)); // 25
  // mapMods 记录来源
  assert.ok(mapMods.mapIir.sources.includes('mod'));
  assert.ok(mapMods.mapPackSize.sources.includes('mod'));
  assert.ok(mapMods.mapTier.sources.includes('panel'));
  // 词缀全部 disabled（引路石只按 map_filters 筛选）
  for (const filter of query.stats[0].filters) {
    assert.equal(filter.disabled, true, `filter ${filter.id} should be disabled`);
  }
});

test('引路石：关闭 mapFiltersEnabled 不写入 map_filters', () => {
  const item = parseItemText(WAYSTONE);
  const matched = matchItem(item, compiled);
  const { query } = buildQuery(item, matched, { mapFilters: false });
  assert.equal(query.filters.map_filters, undefined);
  // 词缀仍然禁用
  for (const filter of query.stats[0].filters) {
    assert.equal(filter.disabled, true);
  }
});

test('引路石：mapRangePercent 可调', () => {
  const item = parseItemText(WAYSTONE);
  const matched = matchItem(item, compiled);
  const { query } = buildQuery(item, matched, { mapRangePercent: 10 });
  assert.equal(query.filters.map_filters.filters.map_bonus.min, Math.floor(185 * 0.9));   // 166
  assert.equal(query.filters.map_filters.filters.map_iir.min, Math.floor(35 * 0.9));        // 31
});

test('引路石：非引路石类别不写 map_filters', () => {
  const item = parseItemText(WAYSTONE.replace('物品类别: 引路石', '物品类别: 胸甲'));
  const { query } = buildQuery(item, [], {});
  assert.equal(query.filters.map_filters, undefined);
});

test('引路石：calcMapMods 只返回有面板/词缀的字段', () => {
  const partial = `物品类别: 引路石
稀有度: 稀有
引路石
引路石
--------
引路石等阶: 10
可用复活次数: 4
--------
物品等级: 70`;
  const item = parseItemText(partial);
  const mods = calcMapMods(item);
  assert.deepEqual(Object.keys(mods).sort(), ['mapRevives', 'mapTier']);
});
