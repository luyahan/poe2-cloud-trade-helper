const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseItemText } = require('../src/lib/parse-item.js');
const { calcMapMods } = require('../src/lib/map-mods.js');
const { buildQuery } = require('../src/query.js');
const { compileDictionary, matchItem } = require('../src/lib/match-stats.js');
const compiled = compileDictionary(JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, '../../cn-stats.json'), 'utf8')));

const WAYSTONE = `物品类别: 引路石
稀有度: 稀有
腐化的引路石
引路石
--------
引路石阶级: 15
--------
怪物群大小: +25%
魔法怪物: +30%
稀有怪物: +20%
物品稀有度: +40%
挑战次数: 6
掉落几率: +15%
金币: +50%
经验: +30%
--------
物品等级: 82
--------
{ 前缀属性 "地图" (等阶：1) }
怪物群大小提高 25 (20-30)%
{ 后缀属性 "地图" (等阶：2) }
物品稀有度提高 40 (30-50)%`;

test('引路石：解析面板字段', () => {
  const item = parseItemText(WAYSTONE);
  assert.equal(item.category, '引路石');
  assert.equal(item.properties.mapTier, 15);
  assert.equal(item.properties.mapPackSize, 25);
  assert.equal(item.properties.mapMagicMonsters, 30);
  assert.equal(item.properties.mapRareMonsters, 20);
  assert.equal(item.properties.mapIir, 40);
  assert.equal(item.properties.mapRevives, 6);
  assert.equal(item.properties.mapBonus, 15);
  assert.equal(item.properties.mapGold, 50);
  assert.equal(item.properties.mapExperience, 30);
});

test('引路石：写入 map_filters 且词缀默认全部禁用', () => {
  const item = parseItemText(WAYSTONE);
  const matched = matchItem(item, compiled);
  const { query } = buildQuery(item, matched, {});
  // 类别正确
  assert.equal(query.filters.type_filters.filters.category.option, 'map.waystone');
  assert.equal(query.filters.type_filters.filters.rarity.option, 'rare');
  // map_filters 写入全部 9 个字段
  const mf = query.filters.map_filters;
  assert.ok(mf);
  assert.equal(mf.disabled, false);
  assert.equal(mf.filters.map_tier.min, 15);
  assert.equal(mf.filters.map_revives.min, 6);
  // 百分比字段按 value × (1-2%) floor
  assert.equal(mf.filters.map_packsize.min, Math.floor(25 * 0.98));      // 24
  assert.equal(mf.filters.map_magic_monsters.min, Math.floor(30 * 0.98)); // 29
  assert.equal(mf.filters.map_rare_monsters.min, Math.floor(20 * 0.98));  // 19
  assert.equal(mf.filters.map_iir.min, Math.floor(40 * 0.98));            // 39
  assert.equal(mf.filters.map_bonus.min, Math.floor(15 * 0.98));          // 14
  assert.equal(mf.filters.map_gold.min, Math.floor(50 * 0.98));           // 49
  assert.equal(mf.filters.map_experience.min, Math.floor(30 * 0.98));     // 29
  // 词缀全部 disabled（即使用户文本包含 T1/T2 词缀）
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
  assert.equal(query.filters.map_filters.filters.map_packsize.min, Math.floor(25 * 0.9));   // 22
  assert.equal(query.filters.map_filters.filters.map_gold.min, Math.floor(50 * 0.9));         // 45
});

test('引路石：非引路石类别不写 map_filters', () => {
  const item = parseItemText(WAYSTONE.replace('物品类别: 引路石', '物品类别: 胸甲'));
  const { query } = buildQuery(item, [], {});
  assert.equal(query.filters.map_filters, undefined);
});

test('引路石：calcMapMods 只返回有面板的字段', () => {
  const partial = `物品类别: 引路石
稀有度: 稀有
引路石
引路石
--------
引路石阶级: 10
挑战次数: 4
--------
物品等级: 70`;
  const item = parseItemText(partial);
  const mods = calcMapMods(item);
  assert.deepEqual(Object.keys(mods).sort(), ['mapRevives', 'mapTier']);
});
