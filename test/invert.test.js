/**
 * 越低越好词缀的反转与「非」组（2026-11-24 用户需求）
 * - 斯瓦林「击中被格挡时承受伤害 #%」：反转取 max（理论上限）
 * - 实际 roll = 0（完全免伤）→ not 组「没有这个词缀」，而非 max:0
 * not 组是国服市集合法分组（油猴版 groupType 枚举 and/count/not/weight 确认）。
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
const DAMAGE_TAKEN = 'explicit.stat_2905515354';

test('斯瓦林 16%：承受伤害反转取理论上限 max:20，留在 and 组', () => {
  const p = parseItemText(readSample('sample-svalinn.txt'));
  const { query } = buildQuery(p, matchItem(p, compiled), {});
  const and = query.stats.find((g) => g.type === 'and');
  const f = and.filters.find((x) => x.id === DAMAGE_TAKEN);
  assert.deepEqual(f.value, { max: 20 });
  assert.ok(!query.stats.some((g) => g.type === 'not'), '非满 roll 不应生成 not 组');
});

test('斯瓦林 0%（满 roll）：进 not 组「没有这个词缀」，and 组不再含它', () => {
  const p = parseItemText(readSample('sample-svalinn-2.txt'));
  const { query } = buildQuery(p, matchItem(p, compiled), {});
  const not = query.stats.find((g) => g.type === 'not');
  assert.ok(not, '满 roll 0% 应生成 not 组');
  assert.deepEqual(not.filters, [{ id: DAMAGE_TAKEN, value: {}, disabled: false }]);
  const and = query.stats.find((g) => g.type === 'and');
  assert.ok(!and.filters.some((x) => x.id === DAMAGE_TAKEN), 'and 组不应再含承受伤害');
  // 其余词缀不受影响
  assert.ok(and.filters.some((x) => x.id === 'explicit.stat_1062208444'), '护甲提高仍在');
});

test('斯瓦林 0%：not 组条目与用户标准国服 URL 逐键一致', () => {
  // 用户提供的标准 URL（2026-11-24）：name=斯瓦林 type=熔铸塔盾，
  // stats 仅一个 not 组，条目 {id, value:{}, disabled:false}。
  const zlib = require('node:zlib');
  const REF = 'H4sIAAAAAAAAE6tWKi5JLCktVrKqVsovKMnMz1OyUkrMq1Sq1VHKS8xNBfKeTVv_fPKyZ_OmK-kolVQWgISet015OXnH04VTns_eBxQFGQE0IboaJp-XXwIUTsvMKUktgkhkpgCFUysKcjKTM0v0QBrijSwNTE0NTY1NTYBqyxJzSoE6q4HWpmQWJyblpAI1pCXmFKfWxgIhAMBQc22nAAAA';
  const ref = JSON.parse(zlib.gunzipSync(
    Buffer.from(REF.replace(/-/g, '+').replace(/_/g, '/'), 'base64')).toString('utf8'));
  const p = parseItemText(readSample('sample-svalinn-2.txt'));
  const { query } = buildQuery(p, matchItem(p, compiled), {});
  assert.equal(query.name, ref.name);
  assert.equal(query.type, ref.type);
  const not = query.stats.find((g) => g.type === 'not');
  const refNot = ref.stats.find((g) => g.type === 'not');
  assert.deepEqual(not.filters, refNot.filters);
});

test('承受伤害反转按 stat id 数字段判定，rune 变体同样反转', () => {
  const { matchStatLine } = (() => {
    // 直接构造 stat 走 matchMod 的 rune 分组路径
    const mod = {
      type: 'Rune', tags: [],
      stats: [{ text: '击中被格挡时，你承受伤害的 5 (0-20)% (rune)', template: '击中被格挡时，你承受伤害的#%', rolls: [{ value: 5, min: 0, max: 20 }] }],
    };
    const { matchMod } = require('@poe2/core/match-stats');
    return { matchStatLine: matchMod(mod, compiled)[0] };
  })();
  // rune 分组若无此词条则回退 explicit；无论哪个分组都应反转
  if (matchStatLine.match) {
    assert.equal(matchStatLine.match.tradeInvert, true);
  }
});

test('冷却时间反转不受影响（既有行为回归）', () => {
  const p = parseItemText(readSample('sample-hateforge.txt'));
  const { query } = buildQuery(p, matchItem(p, compiled), {});
  const cooldown = query.stats[0].filters.find((f) => f.id === 'explicit.stat_2284588585');
  assert.deepEqual(cooldown.value, { max: 6 });
});

test('not 组不影响启用数跨组统计口径（not 组无 disabled 概念）', () => {
  const p = parseItemText(readSample('sample-svalinn-2.txt'));
  const { query } = buildQuery(p, matchItem(p, compiled), {});
  // not 组条目不带 disabled，跨组 flatMap 统计不会报错
  const enabled = query.stats.flatMap((g) => g.filters).filter((f) => !f.disabled).length;
  assert.ok(enabled > 0);
});