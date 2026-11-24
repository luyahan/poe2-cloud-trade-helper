/**
 * 物品稀有度 → type_filters.rarity（国服官方 text「物品稀有度」）
 * 非传奇装备与武器查价同样写入：普通→normal、魔法→magic、稀有→rare、传奇→unique。
 * 写法经用户提供的 4 个真实国服 URL 确认（2026-11-24）：
 *   filters.type_filters = { disabled:false, filters:{ rarity:{option:'...'} } }
 * 附带回归：白装「卓越」品质前缀剥离（市集 type 认纯基底名）。
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
const read = (name) => readFileSync(join(__dirname, '../data', name), 'utf8');

// 用户提供的 4 个真实国服参考 URL（magic / normal / rare / unique 各一）
const REF_B64 = {
  magic: 'H4sIAAAAAAAAE1WNUQqAIBBE7zLfncCrRMSWGgtm4W4fIt49tJ-cvzdvYApESR-BKbhu5SvCgGJGnboRmLlA8-16bzHBc1CXmljq8sNvtv7YstAWnIXxFMQN20SJNQ-3Jx28o7a8EFh8lJcAAAA',
  normal: 'H4sIAAAAAAAAE1WNQQrAIBAD_5KzL_ArRcoWFQSr4m4PIv69aC82t8kE0sFC8jB0Ry4ScoIGpYahlmHoo0Nacau3UPAhiqtTmGE2_GbnxjYwXdFZaE-R3W9bqQZpv9uU600RY-YFHd_f85gAAAA',
  rare: 'H4sIAAAAAAAAE1WNQQrAIAwE_7JnX-BXipQUIwiikqQHEf9e2l7avc3Owk6okZ0KP9G65VbhQXVgucco_DZho_PTRzikXIzlFmGFD76z_cMxKx2FI3yiovzbCkm28bsVEsa6cwFf6hBMlgAAAA',
  unique: 'H4sIAAAAAAAAE1WNUQqAIBBE7zLfncCrhMSGGyyImbt-iHj3sH5q_t68gelQI6sK13FmkzPBgVLDWB6jcGuHtcxPH7DgkGhcpvDDf_CdbR8OorRHDnAHReXftlARa7_bmuSqjDFzA1f4CLeYAAAA',
};
const decodeRef = (option) => JSON.parse(zlib.gunzipSync(
  Buffer.from(REF_B64[option].replace(/-/g, '+').replace(/_/g, '/'), 'base64')).toString('utf8'));

function queryOf(text) {
  const p = parseItemText(text);
  return { p, ...buildQuery(p, matchItem(p, compiled), {}) };
}

// 与参考 URL 的 type_filters 逐键比对（rarity 字段 + 组级 disabled）
function assertRarityMatchesRef(query, option) {
  const ref = decodeRef(option).filters.type_filters;
  assert.deepEqual(query.filters.type_filters.filters.rarity, ref.filters.rarity);
  assert.equal(query.filters.type_filters.disabled, ref.disabled);
}

test('白装武器：普通→normal，与参考 URL 逐键一致（真实样本×4）', () => {
  for (const name of ['sample-withering-wand.txt', 'sample-molten-hammer.txt',
    'sample-moonlight-sceptre.txt', 'sample-ruin-maul.txt']) {
    const { p, query } = queryOf(read(name));
    assert.equal(p.rarity, '普通', name);
    assertRarityMatchesRef(query, 'normal');
  }
});

test('稀有装备：稀有→rare，与参考 URL 逐键一致（真实样本）', () => {
  const { query } = queryOf(read('sample-item.txt'));
  assertRarityMatchesRef(query, 'rare');
});

test('传奇：传奇→unique，与参考 URL 逐键一致（真实样本）', () => {
  const { query } = queryOf(read('sample-hateforge.txt'));
  assertRarityMatchesRef(query, 'unique');
});

test('魔法装备：魔法→magic，与参考 URL 逐键一致', () => {
  // 库里暂无蓝装样本，用稀有样本改稀有度行构造最小文本
  const text = read('sample-item.txt').replace('稀有度: 稀有', '稀有度: 魔法');
  const { p, query } = queryOf(text);
  assert.equal(p.rarity, '魔法');
  assertRarityMatchesRef(query, 'magic');
});

test('白装「卓越」品质前缀剥离：type 是纯基底名（4 件真实白装）', () => {
  const cases = {
    'sample-withering-wand.txt': '凋零法杖',
    'sample-molten-hammer.txt': '熔火之锤',
    'sample-moonlight-sceptre.txt': '月光节杖',
    'sample-ruin-maul.txt': '毁灭巨锤',
  };
  for (const [name, base] of Object.entries(cases)) {
    const { p, query } = queryOf(read(name));
    assert.equal(p.baseName, base, name);
    assert.equal(query.type, base, name);
  }
});

test('「卓越」剥离只作用于普通稀有度：稀有/传奇不受影响', () => {
  const rare = parseItemText(read('sample-item.txt').replace('钉头锤', '卓越 钉头锤'));
  assert.equal(rare.baseName, '卓越 钉头锤', '稀有装备不剥离（可能是随机名一部分）');
  const unique = parseItemText(read('sample-hateforge.txt'));
  assert.equal(unique.baseName, '铸锻护手');
});

test('稀有度与类别/ilvl/品质共存于 type_filters，互不覆盖', () => {
  const { query } = queryOf(read('sample-ruin-maul.txt')); // 品质 26% > 20
  const tf = query.filters.type_filters.filters;
  assert.equal(tf.rarity.option, 'normal');
  assert.equal(tf.category.option, 'weapon.twomace');
  assert.equal(tf.ilvl.min, 81);
  assert.equal(tf.quality.min, 26);
});