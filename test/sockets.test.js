/**
 * 插槽 → equipment_filters.rune_sockets（国服「增幅器插槽」）
 * 字段写法经用户提供的真实国服 URL 确认（2026-11-24）：
 *   filters.equipment_filters = { disabled:false, filters:{ rune_sockets:{min:2} } }
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
const sample = readFileSync(join(__dirname, '../data/sample-item.txt'), 'utf8'); // 稀有单手锤，S S

// 用户提供的真实国服参考 URL（只含插槽筛选的最小查询）
const REF_B64 = 'H4sIAAAAAAAAE1WNMQ6AIBAE_7K1lSVfMcagnMlFBPSOwhD-rlLpdrOTzRaIWs0CUxCTcgwwsOFC7Zp5xFCgV6LWO3RY2Sudrxjr-MECOjKnnYJOn9Kx2NmTg1mtF_oNzhxokrhspI13fu77-uYGb-FuM5kAAAA';
const refPayload = JSON.parse(zlib.gunzipSync(
  Buffer.from(REF_B64.replace(/-/g, '+').replace(/_/g, '/'), 'base64')).toString('utf8'));

test('插槽：稀有武器 S S → rune_sockets.min=2，与参考 URL 字段一致', () => {
  const p = parseItemText(sample);
  assert.equal(p.sockets, 'S S');
  const { query, socketCount } = buildQuery(p, matchItem(p, compiled), {});
  assert.equal(socketCount, 2);
  assert.deepEqual(query.filters.equipment_filters.filters.rune_sockets,
    refPayload.filters.equipment_filters.filters.rune_sockets);
  assert.equal(query.filters.equipment_filters.disabled, false);
  // 与 DPS 同组共存，互不覆盖
  assert.ok(query.filters.equipment_filters.filters.pdps, '插槽不应挤掉 DPS 字段');
});

test('插槽：与参考 URL 的 equipment_filters 结构逐键一致', () => {
  const p = parseItemText(sample);
  const { query } = buildQuery(p, matchItem(p, compiled), {});
  const ref = refPayload.filters.equipment_filters;
  assert.equal(query.filters.equipment_filters.disabled, ref.disabled);
  assert.deepEqual(query.filters.equipment_filters.filters.rune_sockets, ref.filters.rune_sockets);
});

test('插槽：三孔节杖 → min=3（真实样本）', () => {
  const text = readFileSync(join(__dirname, '../data/sample-moonlight-sceptre.txt'), 'utf8');
  const p = parseItemText(text);
  const { query, socketCount } = buildQuery(p, matchItem(p, compiled), {});
  assert.equal(socketCount, 3);
  assert.deepEqual(query.filters.equipment_filters.filters.rune_sockets, { min: 3 });
});

test('插槽：传奇 J J J J J J → min=6，且不影响腐化/鉴定筛选', () => {
  const text = readFileSync(join(__dirname, '../data/sample-unique-armour.txt'), 'utf8');
  const p = parseItemText(text);
  const { query, socketCount } = buildQuery(p, matchItem(p, compiled), {});
  assert.equal(socketCount, 6);
  assert.deepEqual(query.filters.equipment_filters.filters.rune_sockets, { min: 6 });
});

test('插槽：同名传奇腐化 5S vs 4S 各自计数（真实对照样本）', () => {
  const five = parseItemText(readFileSync(join(__dirname, '../data/sample-unique-armour-corrupted.txt'), 'utf8'));
  const four = parseItemText(readFileSync(join(__dirname, '../data/sample-unique-armour-corrupted-2.txt'), 'utf8'));
  const q5 = buildQuery(five, matchItem(five, compiled), {}).query;
  const q4 = buildQuery(four, matchItem(four, compiled), {}).query;
  assert.deepEqual(q5.filters.equipment_filters.filters.rune_sockets, { min: 5 });
  assert.deepEqual(q4.filters.equipment_filters.filters.rune_sockets, { min: 4 });
  // 腐化传奇的 misc_filters 不受插槽逻辑影响
  assert.deepEqual(q5.filters.misc_filters.filters.corrupted, { option: 'true' });
});

test('插槽：防具与防御值/DPS 共用 equipment_filters，不互相覆盖', () => {
  const text = readFileSync(join(__dirname, '../data/sample-unique-armour-corrupted.txt'), 'utf8');
  const p = parseItemText(text);
  const { query } = buildQuery(p, matchItem(p, compiled), {});
  const eq = query.filters.equipment_filters.filters;
  assert.ok(eq.rune_sockets, '应有插槽筛选');
  assert.ok(eq.ar && eq.ev && eq.es, '防御三围筛选不应被插槽覆盖');
});

test('插槽：无插槽行不生成 rune_sockets', () => {
  const text = sample.replace(/^插槽:.*\n/m, '');
  const p = parseItemText(text);
  assert.equal(p.sockets, undefined);
  const { query, socketCount } = buildQuery(p, matchItem(p, compiled), {});
  assert.equal(socketCount, undefined);
  assert.equal(query.filters.equipment_filters.filters.rune_sockets, undefined);
});

test('插槽：opts.sockets=false 可关闭，socketsMin 可覆盖下限', () => {
  const p = parseItemText(sample);
  const off = buildQuery(p, matchItem(p, compiled), { sockets: false });
  assert.equal(off.socketCount, undefined);
  assert.equal(off.query.filters.equipment_filters.filters.rune_sockets, undefined);
  const overridden = buildQuery(p, matchItem(p, compiled), { socketsMin: 1 });
  assert.deepEqual(overridden.query.filters.equipment_filters.filters.rune_sockets, { min: 1 });
});

test('插槽：引路石等无插槽类别不受影响（map_filters 路径回归）', () => {
  const p = parseItemText(`物品类别: 引路石
稀有度: 稀有
测试引路石
--------
等阶: 15
--------
怪物群大小: +30%`);
  const { query, socketCount } = buildQuery(p, matchItem(p, compiled), {});
  assert.equal(socketCount, undefined);
  assert.equal(query.filters.equipment_filters, undefined);
});