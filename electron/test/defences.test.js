const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseItemText } = require('../src/lib/parse-item.js');
const { calcDefences } = require('../src/lib/defences.js');
const { buildQuery } = require('../src/query.js');
const { compileDictionary, matchItem } = require('../src/lib/match-stats.js');
const compiled = compileDictionary(JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, '../../cn-stats.json'), 'utf8')));

const SAMPLE = `物品类别: 胸甲
稀有度: 稀有
测试护甲
专家胸甲
--------
品质: +10% (augmented)
护甲: 330 (augmented)
闪避值: 220 (augmented)
能量护盾: 110 (augmented)
格挡率: 25%
精魂: 100
--------
物品等级: 82
--------
{ 前缀属性 "护甲" (等阶：1) }
+50 (40-60) 护甲
{ 前缀属性 "防御" (等阶：1) }
护甲与闪避提高 50 (40-60)%
{ 前缀属性 "护盾" (等阶：1) }
能量护盾提高 50 (50-50)%`;

test('防御：面板按本地固定/百分比词缀反推并补足 q20', () => {
  const item = parseItemText(SAMPLE);
  matchItem(item, compiled);
  const defences = calcDefences(item);
  assert.equal(item.properties.armour, 330);
  assert.equal(item.properties.evasion, 220);
  assert.equal(item.properties.energyShield, 110);
  // 护甲 B = 330 / (1.1 * 1.5) - 50 = 150；q20 = (150 + 50) * 1.5 * 1.2 = 360。
  assert.ok(Math.abs(defences.armour.base - 150) < 1e-9);
  assert.ok(Math.abs(defences.armour.value - 360) < 1e-9);
  // 闪避 B = 220 / (1.1 * 1.5) = 133.33；q20 = 240。
  assert.ok(Math.abs(defences.evasion.value - 240) < 1e-9);
  // 护盾 B = 110 / (1.1 * 1.5) = 66.67；q20 = 120。
  assert.ok(Math.abs(defences.energyShield.value - 120) < 1e-9);
  assert.equal(defences.block.value, 25);
  assert.equal(defences.spirit.value, 100);
});

test('防御：国服 ar/ev/es/ward/block/spirit 与 DPS 共用装备筛选组', () => {
  const item = parseItemText(SAMPLE);
  const { query, defences } = buildQuery(item, matchItem(item, compiled), {});
  assert.deepEqual(Object.keys(query.filters.equipment_filters.filters).sort(), ['ar', 'block', 'es', 'ev', 'spirit']);
  assert.equal(query.filters.equipment_filters.disabled, false);
  // 固定护甲与混合提高的理论最低 roll 为 352.8，限制 2% 下调。
  assert.equal(query.filters.equipment_filters.filters.ar.min, 352);
  assert.equal(query.filters.equipment_filters.filters.ev.min, 235);
  assert.equal(query.filters.equipment_filters.filters.es.min, 119);
  assert.equal(query.filters.equipment_filters.filters.block.min, 25);
  assert.equal(query.filters.equipment_filters.filters.spirit.min, 100);
  assert.equal(defences.armour.display, 360);
});

test('防御：仇恨熔炉区域护甲匹配与腐化品质保留', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, 'pipeline.test.js'), 'utf8');
  const text = source.match(/const hateforge = `([\s\S]*?)`;/)?.[1];
  const item = parseItemText(text);
  const { query, defences } = buildQuery(item, matchItem(item, compiled), {});
  // 腐化装备不补足 q20，保留原品质 0：B = 394 / 4.43；value = B * 4.43 * 1 = 394。
  assert.ok(Math.abs(defences.armour.base - 394 / 4.43) < 1e-9);
  assert.ok(Math.abs(defences.armour.value - 394) < 1e-9);
  assert.equal(defences.armour.display, 394);
  // 传奇按 roll 全距 2%：max(floor(355.76), floor(394 - (444.70-355.76)*0.02)) = 392。
  assert.equal(query.filters.equipment_filters.filters.ar.min, 392);
});

test('防御：腐化保留原品质，关闭筛选仍保留计算值', () => {
  const item = parseItemText(`${SAMPLE}\n--------\n被腐化`);
  assert.ok(Math.abs(calcDefences(item).armour.value - 330) < 1e-9);
  const { query } = buildQuery(item, [], { defences: false });
  assert.equal(query.filters.equipment_filters, undefined);
  assert.ok(Math.abs(item.derived.defences.armour.value - 330) < 1e-9);
});
