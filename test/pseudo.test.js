/**
 * pseudo 合并测试
 *
 * 规则语义移植自同项目油猴脚本（EE2 filterPseudo 等价实现），
 * 断言沿用 EE2 `pseudo/index.test.ts` 的用例口径，并补充国服适配相关的用例。
 *
 * 与油猴版的两处差异是刻意断言的（见 core/pseudo.js 文件头）：
 *   · 判定主键用 stat id，因此国服「火焰抗性 #%」这种数值在后的文本也能识别
 *   · 数值取装备实际 roll，而不是上一轮查询的 value.min
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const { parseItemText } = require('@poe2/core/parse-item');
const { compileDictionary, matchItem } = require('@poe2/core/match-stats');
const { buildQuery } = require('@poe2/core/query');
const { buildPseudoFilters, ruleKey, resolveValue } = require('@poe2/core/pseudo');

const here = __dirname;
const dict = JSON.parse(readFileSync(join(here, '../data/cn-stats.json'), 'utf8'));
const compiled = compileDictionary(dict);

// ---- 构造装备文本的工具 ----
// 国服词典文本是「数值在后」的顺序（火焰抗性 #%），因此这里按词典顺序写词缀，
// 与游戏内 Ctrl+Alt+C 复制出来的文本一致。
//
// 基底名必须用游戏里真实存在的名字：国服市集对未知基底名直接报「搜索失败」，
// 而不是返回空结果。这里曾用「黄金戒指」（PoE1 的 Gold Ring，PoE2 无此基底），
// 测出来的查询在浏览器里直接打不开。PoE2 对应的是「金光戒指」。
function makeItem(mods, header = {}) {
  const { category = '戒指', rarity = '稀有', name = '测试 之环', base = '金光戒指' } = header;
  const lines = [`物品类别: ${category}`, `稀有度: ${rarity}`, name, base, '--------'];
  lines.push(...mods, '--------', '物品等级: 80');
  return lines.join('\n');
}

// 每条词缀自动包一层 { ... } 元信息行，并带 T1 阶层（T1/T2 默认启用）
let counter = 0;
function affix(statLine, { tier = 1, generation = '前缀属性', tags = '' } = {}) {
  counter += 1;
  const tagPart = tags ? ` — ${tags}` : '';
  return `{ ${generation} "测试词缀${counter}" (等阶：${tier})${tagPart} }\n${statLine}`;
}

function query(mods, opts = {}) {
  const item = parseItemText(makeItem(mods));
  const matched = matchItem(item, compiled);
  return buildQuery(item, matched, { tierMax: 2, ...opts });
}

function findPseudo(result, id) {
  return result.pseudo.suggestions.find((suggestion) => suggestion.id === id);
}

// ---- 基础工具 ----

test('pseudo：ruleKey 剥离分组前缀，跨分组同一规则', () => {
  assert.equal(ruleKey('explicit.stat_3372524247'), 'stat_3372524247');
  assert.equal(ruleKey('implicit.stat_3372524247'), 'stat_3372524247');
  assert.equal(ruleKey('desecrated.stat_3372524247'), 'stat_3372524247');
  assert.equal(ruleKey(''), '');
  assert.equal(ruleKey(undefined), '');
});

test('pseudo：resolveValue 支持裸数字与 min/max', () => {
  assert.equal(resolveValue(50), 50);
  assert.equal(resolveValue({ min: 30 }), 30);
  // 冷却时间这类「越低越好」的词缀写成 max
  assert.equal(resolveValue({ max: 6 }), 6);
  assert.equal(resolveValue({}), null);
  assert.equal(resolveValue(null), null);
  assert.equal(resolveValue(undefined), null);
});

test('pseudo：无候选时不生成任何建议', () => {
  assert.deepEqual(buildPseudoFilters([]), []);
  assert.deepEqual(buildPseudoFilters(null), []);
});

// ---- 抗性 ----

test('pseudo：单条元素抗性 → 总元素抗性(启用) + 单抗(收敛后保留)', () => {
  const result = query([affix('火焰抗性 +25%')]);
  const total = findPseudo(result, 'pseudo.pseudo_total_elemental_resistance');
  assert.ok(total, '应生成总元素抗性');
  assert.equal(total.enabled, true);
  assert.equal(total.value.min, 25);
  assert.equal(total.sources.length, 1);
  // 只有一条单抗时它就是唯一最高，会被保留但默认禁用
  const fire = findPseudo(result, 'pseudo.pseudo_total_fire_resistance');
  assert.ok(fire);
  assert.equal(fire.enabled, false);
  assert.equal(fire.value.min, 25);
});

test('pseudo：三条同值单抗 → 总元素抗性加权求和，单抗因并列最高全部移除', () => {
  const result = query([
    affix('火焰抗性 +25%'),
    affix('冰霜抗性 +25%'),
    affix('闪电抗性 +25%'),
  ]);
  const total = findPseudo(result, 'pseudo.pseudo_total_elemental_resistance');
  assert.equal(total.value.min, 75);
  assert.equal(total.sources.length, 3);
  // 三条并列最高 → 单抗建议全部丢弃（EE2 收敛规则）
  assert.equal(findPseudo(result, 'pseudo.pseudo_total_fire_resistance'), undefined);
  assert.equal(findPseudo(result, 'pseudo.pseudo_total_cold_resistance'), undefined);
  assert.equal(findPseudo(result, 'pseudo.pseudo_total_lightning_resistance'), undefined);
});

test('pseudo：单抗收敛独立于总元素抗性，只留唯一最高（EE2 用例）', () => {
  // EE2 原用例：火 25 + 冰 50 → 总元素抗性 75 且保留冰霜单抗 50
  const result = query([affix('火焰抗性 +25%'), affix('冰霜抗性 +50%')]);
  const total = findPseudo(result, 'pseudo.pseudo_total_elemental_resistance');
  assert.equal(total.value.min, 75);
  assert.equal(total.enabled, true);
  const cold = findPseudo(result, 'pseudo.pseudo_total_cold_resistance');
  assert.ok(cold, '应保留数值最高的冰霜单抗');
  assert.equal(cold.value.min, 50);
  assert.equal(cold.enabled, false);
  // 数值较低的火抗被收敛掉
  assert.equal(findPseudo(result, 'pseudo.pseudo_total_fire_resistance'), undefined);
});

test('pseudo：所有元素抗性按元素个数加权（10 × 3 = 30）', () => {
  const result = query([affix('所有元素抗性 +10%')]);
  const total = findPseudo(result, 'pseudo.pseudo_total_elemental_resistance');
  assert.equal(total.value.min, 30);
});

test('pseudo：双元素抗性按覆盖的 2 个元素加权', () => {
  // 注意国服文本顺序不统一：单元素「火焰抗性 #%」数值在后，
  // 双元素「#% 火焰与闪电抗性」数值在前，必须按词典原文写。
  const result = query([affix('+15% 火焰与闪电抗性'), affix('冰霜抗性 +10%')]);
  const total = findPseudo(result, 'pseudo.pseudo_total_elemental_resistance');
  assert.equal(total.value.min, 40); // 15×2 + 10×1
});

test('pseudo：混沌抗性单独成条，不计入总元素抗性', () => {
  const result = query([affix('火焰抗性 +20%'), affix('混沌抗性 +15%')]);
  const elemental = findPseudo(result, 'pseudo.pseudo_total_elemental_resistance');
  // 只有火抗计入元素抗性，混沌不算元素
  assert.equal(elemental.value.min, 20);
  const chaos = findPseudo(result, 'pseudo.pseudo_total_chaos_resistance');
  assert.ok(chaos);
  assert.equal(chaos.value.min, 15);
  assert.equal(chaos.enabled, false);
});

// ---- 属性 ----

test('pseudo：单一属性 → 对应总属性，默认启用', () => {
  const result = query([affix('+25 力量', { generation: '后缀属性' })]);
  const strength = findPseudo(result, 'pseudo.pseudo_total_strength');
  assert.ok(strength);
  assert.equal(strength.value.min, 25);
  assert.equal(strength.enabled, true);
});

test('pseudo：全属性词缀计入每一项，不按属性个数倍乘', () => {
  const result = query([affix('+20 全属性', { generation: '后缀属性' })]);
  for (const id of ['pseudo.pseudo_total_strength', 'pseudo.pseudo_total_dexterity', 'pseudo.pseudo_total_intelligence']) {
    const suggestion = findPseudo(result, id);
    assert.ok(suggestion, `${id} 应存在`);
    assert.equal(suggestion.value.min, 20, `${id} 不应倍乘`);
  }
  // 全属性合计默认禁用
  const all = findPseudo(result, 'pseudo.pseudo_total_all_attributes');
  assert.equal(all.value.min, 20);
  assert.equal(all.enabled, false);
});

test('pseudo：双属性词缀分别计入两项', () => {
  const result = query([affix('+15 力量和敏捷', { generation: '后缀属性' })]);
  assert.equal(findPseudo(result, 'pseudo.pseudo_total_strength').value.min, 15);
  assert.equal(findPseudo(result, 'pseudo.pseudo_total_dexterity').value.min, 15);
  assert.equal(findPseudo(result, 'pseudo.pseudo_total_intelligence'), undefined);
});

test('pseudo：属性总和需至少两条来源', () => {
  const single = query([affix('+25 力量', { generation: '后缀属性' })]);
  assert.equal(findPseudo(single, 'pseudo.pseudo_total_attributes'), undefined);

  const double = query([
    affix('+25 力量', { generation: '后缀属性' }),
    affix('+30 敏捷', { generation: '后缀属性' }),
  ]);
  const sum = findPseudo(double, 'pseudo.pseudo_total_attributes');
  assert.ok(sum);
  assert.equal(sum.value.min, 55);
  assert.equal(sum.enabled, false);
});

// ---- 生命 / 魔力 ----

test('pseudo：总生命 = 直接生命 + 力量 × 2（EE2 用例：50 + 25×2 = 100）', () => {
  const result = query([
    affix('+50 生命上限', { generation: '后缀属性' }),
    affix('+25 力量', { generation: '后缀属性' }),
  ]);
  const life = findPseudo(result, 'pseudo.pseudo_total_life');
  assert.ok(life);
  assert.equal(life.value.min, 100);
  assert.equal(life.enabled, true);
  assert.equal(life.sources.length, 2);
});

test('pseudo：无直接生命词缀时不凭空生成总生命（EE2 required 语义）', () => {
  const result = query([affix('+25 力量', { generation: '后缀属性' })]);
  assert.equal(findPseudo(result, 'pseudo.pseudo_total_life'), undefined);
});

test('pseudo：总魔力默认禁用，且同样需要直接魔力词缀', () => {
  const result = query([
    affix('+40 魔力上限', { generation: '后缀属性' }),
    affix('+25 智慧', { generation: '后缀属性' }),
  ]);
  const mana = findPseudo(result, 'pseudo.pseudo_total_mana');
  assert.ok(mana);
  assert.equal(mana.value.min, 90); // 40 + 25×2
  assert.equal(mana.enabled, false);
});

// ---- 移动速度 ----

test('pseudo：移速合计默认启用', () => {
  const result = query([affix('移动速度提高 30%', { generation: '后缀属性' })]);
  const movement = findPseudo(result, 'pseudo.pseudo_increased_movement_speed');
  assert.ok(movement);
  assert.equal(movement.value.min, 30);
  assert.equal(movement.enabled, true);
});

test('pseudo：唯一来源是 implicit 时移速默认禁用（EE2 行为）', () => {
  const text = [
    '物品类别: 鞋子', '稀有度: 稀有', '测试 之靴', '钢趾靴', '--------',
    '移动速度提高 25% (implicit)', '--------', '物品等级: 80',
  ].join('\n');
  const item = parseItemText(text);
  const result = buildQuery(item, matchItem(item, compiled), { tierMax: 2 });
  const movement = findPseudo(result, 'pseudo.pseudo_increased_movement_speed');
  assert.ok(movement);
  assert.equal(movement.enabled, false, 'implicit 单来源应默认禁用');
});

// ---- 落库行为 ----

test('pseudo：启用的建议写入第二个 and 组，来源词缀保留但被禁用', () => {
  const result = query([affix('火焰抗性 +45%'), affix('冰霜抗性 +45%')]);
  // 组 0 是精确词缀，组 1 是合并值
  assert.equal(result.query.stats.length, 2);
  assert.equal(result.query.stats[1].type, 'and');
  const merged = result.query.stats[1].filters;
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'pseudo.pseudo_total_elemental_resistance');
  assert.equal(merged[0].value.min > 0, true);

  // 来源词缀仍在组 0，未删除，只标记 disabled
  const group0 = result.query.stats[0].filters;
  assert.equal(group0.length, 2);
  for (const filter of group0) assert.equal(filter.disabled, true, `${filter.id} 应被禁用`);
});

test('pseudo：禁用的建议不写入查询（桌面端无勾选面板）', () => {
  const result = query([affix('混沌抗性 +15%')]);
  const chaos = findPseudo(result, 'pseudo.pseudo_total_chaos_resistance');
  assert.ok(chaos);
  assert.equal(chaos.enabled, false);
  // 混沌抗性没有启用建议 → 不应追加第二个组
  assert.equal(result.query.stats.length, 1);
  assert.equal(result.query.stats[0].filters.some((f) => /^pseudo\./.test(f.id)), false);
});

test('pseudo：原本就禁用的词缀不被合并改写状态', () => {
  // T5 火焰抗性：本来因阶级就禁用，不应被 pseudo 二次改写
  const result = query([affix('火焰抗性 +45%', { tier: 5 }), affix('冰霜抗性 +45%', { tier: 1 })]);
  const t5 = result.query.stats[0].filters.find((f) => f.id === 'explicit.stat_3372524247');
  assert.equal(t5.disabled, true, 'T5 本应禁用');
  // 关键是：合并没有把它当成「参与搜索」的来源——它本来就没参与
  const total = findPseudo(result, 'pseudo.pseudo_total_elemental_resistance');
  assert.ok(total, '合计算值仍包含该词缀的数值');
});

test('pseudo：pseudoEnabled=false 完全不介入查询', () => {
  const result = query([affix('火焰抗性 +45%'), affix('冰霜抗性 +45%')], { pseudoEnabled: false });
  assert.equal(result.query.stats.length, 1);
  assert.deepEqual(result.pseudo.suggestions, []);
  // 原词缀保持原有启用状态，不被禁用
  const group0 = result.query.stats[0].filters;
  assert.equal(group0.every((f) => !f.disabled), true);
});

test('pseudo：pseudoRangePercent 只下调搜索下限，不改计算值', () => {
  const mods = [affix('火焰抗性 +100%'), affix('冰霜抗性 +100%')];
  const plain = query(mods);
  const adjusted = query(mods, { pseudoRangePercent: 2 });
  const a = findPseudo(plain, 'pseudo.pseudo_total_elemental_resistance');
  const b = findPseudo(adjusted, 'pseudo.pseudo_total_elemental_resistance');
  // 计算值不变
  assert.equal(a.value.min, 200);
  assert.equal(b.value.min, 200);
  // 写入查询的下限被下调 2%
  const written = adjusted.query.stats[1].filters[0].value.min;
  assert.equal(written, 196);
});

test('pseudo：引路石不做合并（其语义是只按 map_filters 搜）', () => {
  const waystone = readFileSync(join(here, '../data/sample-hateforge.txt'), 'utf8');
  const item = parseItemText(waystone.replace('物品类别: 手套', '物品类别: 引路石'));
  const result = buildQuery(item, matchItem(item, compiled), { tierMax: 2 });
  assert.equal(result.query.stats.length, 1, '引路石不应追加合并组');
});

test('pseudo：已有同 id 的 pseudo 不重复生成', () => {
  const candidates = [
    { id: 'pseudo.pseudo_total_elemental_resistance', value: { min: 100 } },
    { id: 'explicit.stat_3372524247', value: { min: 45 }, template: '火焰抗性 #%' },
    { id: 'explicit.stat_4220027924', value: { min: 45 }, template: '冰霜抗性 #%' },
  ];
  const suggestions = buildPseudoFilters(candidates);
  assert.equal(suggestions.some((s) => s.id === 'pseudo.pseudo_total_elemental_resistance'), false,
    '已存在的 pseudo 不应重复生成，避免数值翻倍');
});

test('pseudo：同一 pseudo 只算一次，重复调用结果稳定（幂等）', () => {
  const candidates = [
    { id: 'explicit.stat_3372524247', value: { min: 25 }, template: '火焰抗性 #%' },
    { id: 'explicit.stat_3299347043', value: { min: 50 }, template: '# 生命上限' },
  ];
  const first = buildPseudoFilters(candidates);
  const second = buildPseudoFilters(candidates);
  assert.deepEqual(
    first.map((s) => [s.id, s.value.min]),
    second.map((s) => [s.id, s.value.min]),
  );
});

test('pseudo：真实样本不误产生建议（无抗性/属性/生命词缀）', () => {
  for (const file of ['sample-item.txt', 'sample-spear.txt', 'sample-hateforge.txt']) {
    const item = parseItemText(readFileSync(join(here, '../data', file), 'utf8'));
    const result = buildQuery(item, matchItem(item, compiled), { tierMax: 2 });
    assert.deepEqual(result.pseudo.suggestions, [], `${file} 不应产生 pseudo 建议`);
    assert.equal(result.query.stats.length, 1, `${file} 查询应只有一组`);
  }
});
