/**
 * 品质 >20% → type_filters.quality.min（国服「物品品质」）
 * 字段位置与写法经用户提供的真实国服 URL 确认（2026-11-24）：
 *   filters.type_filters.filters.quality = {min:21}（不是 equipment_filters）
 * ≤20% 可磨石达成，不写品质过滤；>20% 是稀缺卖点，按实际品质找不低于它的挂单。
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const zlib = require('node:zlib');

const { parseItemText } = require('@poe2/core/parse-item');
const { compileDictionary, matchItem } = require('@poe2/core/match-stats');
const { buildQuery } = require('@poe2/core/query');

const compiled = compileDictionary(JSON.parse(readFileSync(join(__dirname, '../data/cn-stats.json'), 'utf8')));
const sample = readFileSync(join(__dirname, '../data/sample-item.txt'), 'utf8'); // 稀有单手锤 q20

// 用户提供的真实国服参考 URL（rune_sockets.min=2 + quality.min=21）
const REF_B64 = 'H4sIAAAAAAAAE1WNsQ7DIBBD_8VzlnbkV6ooouUinUKAhGNAiH8vsJTeZPvJ54IoWlKEKvBB2DsoaJdRl0EaeBVIDjRygwU7W6G7g7Wuky2gK3E4yck2hYajflsyULu2kf4Kd3K0Rf85SIY_uc0_a23jfXJ-M8kracuSf4VH7fcFEnJ7m8sAAAA';
const refPayload = JSON.parse(zlib.gunzipSync(
  Buffer.from(REF_B64.replace(/-/g, '+').replace(/_/g, '/'), 'base64')).toString('utf8'));

test('品质：q21 写 type_filters.quality.min=21，与参考 URL 逐键一致', () => {
  const p = parseItemText(sample.replace('品质: +20%', '品质: +21%'));
  assert.equal(p.quality, 21);
  const { query } = buildQuery(p, matchItem(p, compiled), {});
  assert.deepEqual(query.filters.type_filters.filters.quality,
    refPayload.filters.type_filters.filters.quality);
  // 参考 URL 同时含插槽筛选，我们的查询两者共存
  assert.deepEqual(query.filters.equipment_filters.filters.rune_sockets,
    refPayload.filters.equipment_filters.filters.rune_sockets);
  // quality 不应误放 equipment_filters
  assert.equal(query.filters.equipment_filters.filters.quality, undefined);
});

test('品质：q26 双手锤按实际值写 min=26（真实样本）', () => {
  const text = readFileSync(join(__dirname, '../data/sample-ruin-maul.txt'), 'utf8');
  const p = parseItemText(text);
  assert.equal(p.quality, 26);
  const { query } = buildQuery(p, matchItem(p, compiled), {});
  assert.deepEqual(query.filters.type_filters.filters.quality, { min: 26 });
});

test('品质：q20/q19/q10 不写品质过滤（可磨石达成，无筛选意义）', () => {
  for (const q of [20, 19, 10]) {
    const p = parseItemText(sample.replace('品质: +20%', `品质: +${q}%`));
    const { query } = buildQuery(p, matchItem(p, compiled), {});
    assert.equal(query.filters.type_filters.filters.quality, undefined, `q${q} 不应写 quality`);
  }
});

test('品质：无品质行不写 quality，也不虚构 type_filters', () => {
  const p = parseItemText(sample.replace(/^品质:.*\n/m, ''));
  assert.equal(p.quality, undefined);
  const { query } = buildQuery(p, matchItem(p, compiled), {});
  assert.equal(query.filters.type_filters.filters.quality, undefined);
});

test('品质：腐化装备 q21 同样写实际品质（品质不可再改）', () => {
  const p = parseItemText(sample.replace('品质: +20%', '品质: +21%') + '\n--------\n被腐化');
  assert.equal(p.corrupted, true);
  const { query } = buildQuery(p, matchItem(p, compiled), {});
  assert.deepEqual(query.filters.type_filters.filters.quality, { min: 21 });
});

test('品质：传奇 q20 不写，q23 写 min=23（与腐化/鉴定筛选共存）', () => {
  const text = readFileSync(join(__dirname, '../data/sample-unique-armour-corrupted.txt'), 'utf8');
  const q20 = parseItemText(text);
  const r20 = buildQuery(q20, matchItem(q20, compiled), {});
  assert.equal(r20.query.filters.type_filters.filters.quality, undefined);
  const q23 = parseItemText(text.replace('品质: +20%', '品质: +23%'));
  const r23 = buildQuery(q23, matchItem(q23, compiled), {});
  assert.deepEqual(r23.query.filters.type_filters.filters.quality, { min: 23 });
  assert.deepEqual(r23.query.filters.misc_filters.filters.corrupted, { option: 'true' });
});

test('品质：opts.quality=false 关闭，qualityMin 覆盖下限', () => {
  const p = parseItemText(sample.replace('品质: +20%', '品质: +26%'));
  const off = buildQuery(p, matchItem(p, compiled), { quality: false });
  assert.equal(off.query.filters.type_filters.filters.quality, undefined);
  const overridden = buildQuery(p, matchItem(p, compiled), { qualityMin: 21 });
  assert.deepEqual(overridden.query.filters.type_filters.filters.quality, { min: 21 });
});

test('品质：与 ilvl/稀有度/类别同组共存，互不覆盖', () => {
  const p = parseItemText(sample.replace('品质: +20%', '品质: +21%'));
  const { query } = buildQuery(p, matchItem(p, compiled), {});
  const tf = query.filters.type_filters.filters;
  assert.deepEqual(tf.quality, { min: 21 });
  assert.equal(tf.ilvl.min, 82);
  assert.equal(tf.rarity.option, 'rare');
  assert.equal(tf.category.option, 'weapon.onemace');
});