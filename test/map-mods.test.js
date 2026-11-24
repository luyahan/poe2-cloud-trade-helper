const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseItemText } = require('@poe2/core/parse-item');
const { calcMapMods } = require('@poe2/core/map-mods');
const { buildQuery } = require('@poe2/core/query');
const { compileDictionary, matchItem } = require('@poe2/core/match-stats');
const compiled = compileDictionary(JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, '../data/cn-stats.json'), 'utf8')));

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

// ---- 真实样本回归（2026-11-24 用户粘贴，等阶在基底名里）----
const readSample = (name) => require('node:fs').readFileSync(
  require('node:path').join(__dirname, '../data', name), 'utf8');

test('引路石真实样本：基底名「引路石（ 15 阶）」提取等阶，type 归一为「引路石」', () => {
  const item = parseItemText(readSample('sample-waystone-t15.txt'));
  assert.equal(item.baseName, '引路石');
  assert.equal(item.properties.mapTier, 15);
  const { query } = buildQuery(item, matchItem(item, compiled), {});
  assert.equal(query.type, '引路石');
  assert.equal(query.filters.map_filters.filters.map_tier.min, 15);
});

test('引路石真实样本：怪物稀有度/怪物效能面板字段（国服官方 text）', () => {
  const item = parseItemText(readSample('sample-waystone-t15.txt'));
  assert.equal(item.properties.mapRareMonsters, 43);
  assert.equal(item.properties.mapMagicMonsters, 13);
  const { query } = buildQuery(item, matchItem(item, compiled), {});
  const mf = query.filters.map_filters.filters;
  assert.equal(mf.map_rare_monsters.min, Math.floor(43 * 0.98)); // 42
  assert.equal(mf.map_magic_monsters.min, Math.floor(13 * 0.98)); // 12
});

test('引路石真实样本：未鉴定写 identified=false，查询非空（type+map_tier）', () => {
  const item = parseItemText(readSample('sample-waystone-unid.txt'));
  assert.equal(item.unidentified, true);
  assert.equal(item.properties.mapTier, 15);
  const { query } = buildQuery(item, matchItem(item, compiled), {});
  assert.deepEqual(query.filters.misc_filters.filters.identified, { option: 'false' });
  assert.deepEqual(query.filters.misc_filters.filters.corrupted, { option: null });
  assert.equal(query.type, '引路石');
  assert.equal(query.filters.map_filters.filters.map_tier.min, 15);
  // 未鉴定无面板词缀，但 type/map_tier/misc 构成有效查询
  const panelCount = Object.values(query.filters)
    .reduce((n, g) => n + Object.keys(g.filters || {}).length, 0);
  assert.ok(panelCount > 0, '未鉴定引路石不应是空查询');
});

test('引路石真实样本：腐化写 corrupted=true（15阶与16阶）', () => {
  for (const [file, tier] of [['sample-waystone-corrupted.txt', 15], ['sample-waystone-t16-corrupted.txt', 16]]) {
    const item = parseItemText(readSample(file));
    assert.equal(item.corrupted, true);
    assert.equal(item.properties.mapTier, tier);
    const { query } = buildQuery(item, matchItem(item, compiled), {});
    assert.deepEqual(query.filters.misc_filters.filters.corrupted, { option: 'true' });
    assert.deepEqual(query.filters.misc_filters.filters.identified, { option: 'true' });
    assert.equal(query.filters.map_filters.filters.map_tier.min, tier);
  }
});

test('引路石真实样本：16阶腐化词缀无等阶标签仍全部解析，负区间不拆分', () => {
  const item = parseItemText(readSample('sample-waystone-t16-corrupted.txt'));
  assert.equal(item.mods.length, 6);
  assert.ok(item.mods.every((m) => m.tier === undefined));
  const res = item.mods.find((m) => m.name === '曝露之');
  assert.deepEqual(res.stats[0].rolls, [{ value: -7, min: -8, max: -6 }]);
});

test('引路石：已鉴定未腐化写 corrupted=false + identified=true', () => {
  const item = parseItemText(readSample('sample-waystone-t15.txt'));
  const { query } = buildQuery(item, matchItem(item, compiled), {});
  assert.deepEqual(query.filters.misc_filters.filters.corrupted, { option: 'false' });
  assert.deepEqual(query.filters.misc_filters.filters.identified, { option: 'true' });
});

test('引路石：面板 augmented 已含词缀加成时不重复累加', () => {
  const text = `物品类别: 引路石
稀 有 度: 稀有
终焉深渊
引路石 (等阶 16)
--------
引路石等阶: 16
可用复活次数: 0
怪物群规模: +30% (augmented)
稀有怪物: +60% (augmented)
引路石掉落几率: +210% (augmented)
--------
物品等级: 80
--------
{ 前缀词缀“丰饶的” }
该区域内发现物品的稀有度提高 +38(30-40)%
{ 前缀词缀“密集的” }
怪物群规模提高 30(20-30)%
{ 前缀词缀“暴虐的” }
稀有怪物数量提高 60(50-70)%
{ 后缀词缀“之深渊” }
该区域含有深渊裂隙 (desecrated)
深渊怪物造成的伤害提高 25(20-30)% (desecrated)
--------
已腐化`;
  const item = parseItemText(text);
  // 面板字段全部解析
  assert.equal(item.properties.mapPackSize, 30);
  assert.equal(item.properties.mapRareMonsters, 60);
  assert.equal(item.properties.mapRevives, 0);
  const matched = matchItem(item, compiled);
  const { query, mapMods } = buildQuery(item, matched, {});
  // 面板已含词缀加成 → 只取面板值，不累加
  assert.equal(mapMods.mapPackSize.value, 30);
  assert.equal(mapMods.mapRareMonsters.value, 60);
  assert.deepEqual(mapMods.mapPackSize.sources, ['panel']);
  assert.deepEqual(mapMods.mapRareMonsters.sources, ['panel']);
  // 面板缺失的物品稀有度才用词缀累加
  assert.equal(mapMods.mapIir.value, 38);
  assert.deepEqual(mapMods.mapIir.sources, ['mod']);
  // 复活 0 次是合法值
  assert.equal(mapMods.mapRevives.value, 0);
  assert.equal(query.filters.map_filters.filters.map_revives.min, 0);
  assert.equal(query.filters.map_filters.filters.map_packsize.min, 29);
  assert.equal(query.filters.map_filters.filters.map_rare_monsters.min, 58);
});
