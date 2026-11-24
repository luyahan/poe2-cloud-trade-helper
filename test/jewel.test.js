/**
 * 珠宝真实样本回归（2026-11-24 用户粘贴）
 * 覆盖：珠宝类别 jewel、双重腐化、腐化强化词缀、多行词典条目整条匹配、
 * 未鉴定+腐化并存、flavour 省略号、使用说明行不入词缀。
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const { parseItemText } = require('@poe2/core/parse-item');
const { compileDictionary, matchItem } = require('@poe2/core/match-stats');
const { buildQuery } = require('@poe2/core/query');

const compiled = compileDictionary(JSON.parse(readFileSync(join(__dirname, '../data/cn-stats.json'), 'utf8')));
const readSample = (name) => readFileSync(join(__dirname, '../data', name), 'utf8');

test('珠宝：类别映射国服顶层 jewel option', () => {
  const p = parseItemText(readSample('sample-jewel-grand-spectrum.txt'));
  const { query } = buildQuery(p, matchItem(p, compiled), {});
  assert.equal(query.filters.type_filters.filters.category.option, 'jewel');
});

test('珠宝浮华：3/3 词缀命中（腐化强化 + 多行传奇词缀 + 瓦尔词缀）', () => {
  const p = parseItemText(readSample('sample-jewel-grand-spectrum.txt'));
  // 腐化强化行被识别为词缀（不再丢弃）；flavour 三行与使用说明不入词缀
  assert.equal(p.mods.length, 3);
  const matched = matchItem(p, compiled);
  assert.equal(matched.filter((m) => m.match).length, 3);
  const byId = Object.fromEntries(matched.filter((m) => m.match).map((m) => [m.match.id, m]));
  // 腐化强化 +6 智慧
  assert.ok(byId['explicit.stat_328541901'], '腐化强化智慧应命中');
  // 多行传奇词缀整条命中（词典跨行条目）
  assert.ok(byId['explicit.stat_461663422'], '珠宝插槽天赋多行词缀应整条命中');
  assert.equal(byId['explicit.stat_461663422'].match.text,
    '含有被腐化的魔法珠宝的\n珠宝插槽天赋效果提高 #%');
  // 瓦尔火焰伤害（负区间 roll）
  assert.ok(byId['explicit.stat_3962278098'], '瓦尔火焰伤害应命中');
});

test('珠宝浮华：双重腐化 → corrupted=true + identified=true', () => {
  const p = parseItemText(readSample('sample-jewel-grand-spectrum.txt'));
  assert.equal(p.corrupted, true);
  assert.equal(p.unidentified, false);
  const { query } = buildQuery(p, matchItem(p, compiled), {});
  assert.deepEqual(query.filters.misc_filters.filters.corrupted, { option: 'true' });
  assert.deepEqual(query.filters.misc_filters.filters.identified, { option: 'true' });
  assert.equal(query.name, '浮华');
  assert.equal(query.type, '宝钻');
});

test('珠宝浮华：flavour 省略号行与使用说明行不入词缀', () => {
  const p = parseItemText(readSample('sample-jewel-grand-spectrum.txt'));
  const allText = p.mods.flatMap((m) => m.stats.map((s) => s.text)).join('\n');
  assert.ok(!allText.includes('昌荣十年百年'), '省略号 flavour 不应入词缀');
  assert.ok(!allText.includes('放置到一个天赋树'), '使用说明不应入词缀');
  assert.ok(!allText.includes('瓦尔至盛年代'), '首行 flavour 不应入词缀');
});

test('珠宝未鉴定+被腐化：两标志各按关键词，查询非空', () => {
  const p = parseItemText(readSample('sample-jewel-unid-corrupted.txt'));
  assert.equal(p.unidentified, true);
  assert.equal(p.corrupted, true);
  const { query } = buildQuery(p, matchItem(p, compiled), {});
  // 纠正「腐化⇒已鉴定」错误：未鉴定照写 false，腐化关键词照写 true
  assert.deepEqual(query.filters.misc_filters.filters.identified, { option: 'false' });
  assert.deepEqual(query.filters.misc_filters.filters.corrupted, { option: 'true' });
  assert.equal(query.type, '宝钻');
  assert.equal(query.filters.type_filters.filters.category.option, 'jewel');
  const panelCount = Object.values(query.filters)
    .reduce((n, g) => n + Object.keys(g.filters || {}).length, 0);
  assert.ok(panelCount > 0, '未鉴定腐化珠宝不应是空查询');
});