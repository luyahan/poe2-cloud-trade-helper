/**
 * 端到端流水线测试（不启动 Electron GUI，只测纯逻辑模块）
 * 运行：node --test test/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const { join } = require('node:path');
const zlib = require('node:zlib');

const { parseItemText } = require('../src/lib/parse-item.js');
const { compileDictionary, matchItem, normalizeTemplate } = require('../src/lib/match-stats.js');
const { buildQuery, encodeTradeUrl } = require('../src/query.js');
const { looksLikeItemText } = require('../src/clipboard.js');

const here = __dirname;
const sample = readFileSync(join(here, '../../sample-item.txt'), 'utf8');
const dict = JSON.parse(readFileSync(join(here, '../../cn-stats.json'), 'utf8'));
const compiled = compileDictionary(dict);

test('解析：头部字段正确', () => {
  const p = parseItemText(sample);
  assert.equal(p.category, '单手锤');
  assert.equal(p.rarity, '稀有');
  assert.equal(p.name, '日象 巨锤');
  assert.equal(p.baseName, '钉头锤');
  assert.equal(p.itemLevel, 82);
  assert.equal(p.quality, 20);
});

test('解析：去重（样本粘贴两遍只取一段）', () => {
  const p = parseItemText(sample);
  assert.equal(p.mods.length, 8);
});

test('解析：词缀 tier 与类型', () => {
  const p = parseItemText(sample);
  const byName = Object.fromEntries(p.mods.filter(m=>m.name).map(m=>[m.name,m]));
  assert.equal(byName['焦化的'].tier, 1);
  assert.equal(byName['冻结的'].tier, 5);
  assert.equal(byName['电殛的'].tier, 2);
  assert.equal(byName['阿曼娜姆之'].type, 'Desecrated');
  assert.equal(byName['恶名之'].type, 'Crafted');
});

test('解析：roll 区间提取', () => {
  const p = parseItemText(sample);
  const fire = p.mods.find(m=>m.name==='焦化的');
  const rolls = fire.stats[0].rolls;
  assert.equal(rolls[0].value, 90);
  assert.equal(rolls[0].min, 88);
  assert.equal(rolls[0].max, 101);
  assert.equal(rolls[1].value, 141);
});

test('匹配：8/8 命中真实 trade id', () => {
  const p = parseItemText(sample);
  const matched = matchItem(p, compiled);
  const hit = matched.filter(m=>m.match).length;
  assert.equal(hit, 8);
  const fire = matched.find(m=>m.mod.name==='焦化的');
  assert.equal(fire.match.id, 'explicit.stat_709508406');
  // 亵渎词缀优先用 explicit 变体（EE2 同款：市集在售装备按外延词缀索引）
  const desecrated = matched.find(m=>m.mod.name==='阿曼娜姆之');
  assert.equal(desecrated.match.group, 'explicit');
});

test('匹配：归一化剥离 rune 后缀与空格', () => {
  assert.equal(normalizeTemplate('物理伤害提高 20% (rune)'), '物理伤害提高#%');
  assert.equal(normalizeTemplate('每击中一名敌人获得 5 点生命'), '每击中一名敌人获得#点生命');
});

test('查询：T1/T2 启用，T3+ 与 rune 禁用', () => {
  const p = parseItemText(sample);
  const matched = matchItem(p, compiled);
  const { query } = buildQuery(p, matched, { tierMax: 2 });
  const filters = query.stats[0].filters;
  const enabled = filters.filter(f=>!f.disabled);
  assert.equal(enabled.length, 5);
  // T5 冰霜应禁用
  const cold = filters.find(f=>f.id==='explicit.stat_1037193709');
  assert.equal(cold.disabled, true);
});

test('查询：类别/稀有度/ilvl 过滤', () => {
  const p = parseItemText(sample);
  const matched = matchItem(p, compiled);
  const { query } = buildQuery(p, matched, {});
  assert.equal(query.filters.type_filters.filters.category.option, 'weapon.onemace');
  assert.equal(query.filters.type_filters.filters.rarity.option, 'rare');
  // 国服 ilvl 在 type_filters（filters API 权威确认），不是 misc_filters
  assert.equal(query.filters.type_filters.filters.ilvl.min, 82);
  assert.ok(!query.filters.misc_filters, 'ilvl 不应放 misc_filters');
});

test('编码：URL 回环一致', async () => {
  const p = parseItemText(sample);
  const matched = matchItem(p, compiled);
  const { query, league } = buildQuery(p, matched, {});
  const url = await encodeTradeUrl(query, league);
  assert.match(url, /^https:\/\/poe\.game\.qq\.com\/trade2\/search\/poe2\//);
  const b64 = url.split('/').pop();
  const gz = Buffer.from(b64.replace(/-/g,'+').replace(/_/g,'/'), 'base64');
  const back = JSON.parse(zlib.gunzipSync(gz).toString('utf8'));
  assert.deepEqual(back, query);
});

test('查询结构：扁平载荷（防「无法使用搜索」回归）', () => {
  // 真实国服 URL 解码后是 {status, stats, filters} 顶层扁平结构，
  // 不能包 {query:{...}, sort:{...}}，否则市集报「无法使用搜索」。
  const p = parseItemText(sample);
  const matched = matchItem(p, compiled);
  const { query } = buildQuery(p, matched, {});
  assert.deepEqual(Object.keys(query).sort(), ['filters', 'stats', 'status', 'type']);
  assert.equal(query.status.option, 'any');
  assert.equal(buildQuery(p, matched, { status: 'online' }).query.status.option, 'any');
  assert.equal(query.stats[0].type, 'and');
  assert.equal(query.type, p.baseName); // 基底名精确匹配
  assert.ok(!('query' in query), '不应有 query 包裹层');
  assert.ok(!('sort' in query), '不应有 sort 包裹层');
});

test('剪贴板识别：装备文本 vs 噪声', () => {
  assert.equal(looksLikeItemText(sample), true);
  assert.equal(looksLikeItemText('https://poe.game.qq.com/trade2/search/x'), false);
  assert.equal(looksLikeItemText('hello world'), false);
  assert.equal(looksLikeItemText('物品类别: 单手锤\n稀有度: 稀有\n--------'), true);
});

// ---- 战矛样本回归（+号归一化 / 多行混合词缀 / 基底属性 / 技能行）----
const spear = readFileSync(join(here, '../../sample-spear.txt'), 'utf8');

test('归一化：剥数值前导+号', () => {
  assert.equal(normalizeTemplate('+51 (41-60) 命中值'), '#命中值');
  assert.equal(normalizeTemplate('暴击几率 +3.39 (3.11-3.8)%'), '暴击几率#%');
  assert.equal(normalizeTemplate('附加 61 (55-69) - 102 (83-106) 冰霜伤害'), '附加#-#冰霜伤害');
});

test('战矛解析：基底属性/技能/混合词缀', () => {
  const p = parseItemText(spear);
  assert.equal(p.baseName, '宏伟战矛');
  assert.equal(p.category, '战矛');
  assert.deepEqual(p.grantedSkills, ['战矛飞掷']);
  // 基底属性 → Implicit
  const base = p.mods.find(m => m.type === 'Implicit');
  assert.ok(base, '应有基底属性词缀');
  assert.equal(base.stats[0].text, '此武器的近战打击范围提高 25%');
  // 帝王的 = 物理伤害提高 + 命中值 两行
  const emperor = p.mods.find(m => m.name === '帝王的');
  assert.equal(emperor.type, 'Desecrated');
  assert.equal(emperor.stats.length, 2);
});

test('战矛匹配：命中值/暴击/混合词缀全命中', () => {
  const p = parseItemText(spear);
  const matched = matchItem(p, compiled);
  const byText = {};
  for (const { stat, match } of matched) if (match) byText[stat.template] = match.id;
  assert.equal(byText['# 命中值'], 'explicit.stat_803737631');
  assert.equal(byText['暴击几率 #%'], 'explicit.stat_518292764');
  assert.equal(byText['照亮范围提高#%'], 'explicit.stat_1263695895');
  assert.equal(byText['此武器的近战打击范围提高#%'], 'implicit.stat_548198834');
  // 帝王的混合词缀产出两条（物理伤害提高 + 命中值）
  const emperorMatches = matched.filter(m => m.mod.name === '帝王的' && m.match);
  assert.equal(emperorMatches.length, 2);
});

test('战矛：用户实测可用 URL 回归（explicit id + 扁平结构）', async () => {
  // 用户提供的真实可用 URL（2026-11-23），解码后含两条 explicit 过滤 + weapon.spear。
  // 我们生成的查询必须包含同样的 id（帝王的物理伤害提高 / 感电的附加闪电伤害）。
  const workingB64 = 'H4sIAAAAAAAAE21OywqDMBD8lzmLqLFF8ytFJOi2BCQJyRYbQv69qJcUOqedx85uQmDF7wCZYB1rayChTESuTidAPhI4Ojr1FRWeemPyl6FXSNDHbXrRXB8Lc3trxlb0XTcgV38TQoj7MDZC9MhTnorG69Jc8GJcFNPL-vjz6k7KWVMHR8ojH_gCAc-PnNIAAAA';
  const working = JSON.parse(zlib.gunzipSync(Buffer.from(workingB64.replace(/-/g,'+').replace(/_/g,'/'), 'base64')).toString('utf8'));
  const p = parseItemText(spear);
  const matched = matchItem(p, compiled);
  const { query } = buildQuery(p, matched, { tierMax: 2 });
  const ourIds = new Set(query.stats[0].filters.map(f => f.id));
  for (const f of working.stats[0].filters) {
    assert.ok(ourIds.has(f.id), `应包含可用 URL 中的 ${f.id}`);
  }
  assert.equal(query.filters.type_filters.filters.category.option,
    working.filters.type_filters.filters.category.option);
  // 顶层键是可用 URL 的超集（我们额外有 type 基底名精确匹配）
  for (const k of Object.keys(working)) {
    assert.ok(k in query, `应包含可用 URL 的顶层键 ${k}`);
  }
  assert.equal(query.type, '宏伟战矛'); // 基底名精确匹配
});

test('战矛查询：类别正确且非空', () => {
  const p = parseItemText(spear);
  const matched = matchItem(p, compiled);
  const { query } = buildQuery(p, matched, { tierMax: 2 });
  assert.ok(query.stats[0].filters.length > 0, '查询不能为空');
  assert.equal(query.filters.type_filters.filters.category.option, 'weapon.spear');
  // T1/T2 启用：埋葬的T2/帝王的T2/光辉之T1 = 至少3条（帝王的两行都T2）
  const enabled = query.stats[0].filters.filter(f => !f.disabled);
  assert.ok(enabled.length >= 3);
});

const hateforge = `物品类别: 手套
稀有度: 传奇
仇恨熔炉
铸锻护手
--------
护甲: 394 (augmented)
--------
需求： 等级 60, 39 (augmented) 力量
--------
插槽: S
--------
物品等级: 82
--------
攻击每击中一名敌人获得3点生命 (rune)
攻击每击中一名敌人获得1点魔力 (rune)
--------
{ 传奇属性 — 护甲 }
护甲提高 343 (300-400)%
{ 传奇属性 }
击中时获得 6 (3-6) 点怒火
{ 传奇属性 }
处于怒火上限状态时，获得一个随机能量球，每 5.92 (3-6) 秒只能获得一次
{ 瓦尔传奇词缀 }
过去 20 秒内每使用一次需要荣耀的技能时，怒火上限 +8 (8-10)
{ 传奇属性 }
+9 (-10-+10) 怒火上限
--------
首个卡鲁人诞生于瓦尔帝国边陲，
来自一场从腐化中开发血瘟的实验。
--------
被腐化`;

test('仇恨熔炉：腐化传奇完整解析，正负区间不拆分', () => {
  const p = parseItemText(hateforge);
  assert.equal(p.name, '仇恨熔炉');
  assert.equal(p.baseName, '铸锻护手');
  assert.equal(p.corrupted, true);
  assert.equal(p.mods.length, 7);
  const vaal = p.mods.find(m => m.stats[0].text.startsWith('过去 20 秒'));
  assert.deepEqual(vaal.stats[0].rolls.map(r => r.value), [20, 8]);
  const rage = p.mods.find(m => m.stats[0].text.startsWith('+9'));
  assert.deepEqual(rage.stats[0].rolls, [{ value: 9, min: -10, max: 10 }]);
});

test('仇恨熔炉：7/7 词缀命中，瓦尔固定 20 秒不误作 roll', () => {
  const p = parseItemText(hateforge);
  const matched = matchItem(p, compiled);
  assert.equal(matched.filter(m => m.match).length, 7);
  const armour = matched.find(m => m.stat.text.startsWith('护甲提高'));
  assert.equal(armour.match.id, 'explicit.stat_1062208444');
  assert.equal(armour.match.text, '护甲提高 #% (区域)');
  const vaal = matched.find(m => m.stat.text.startsWith('过去 20 秒'));
  assert.equal(vaal.match.id, 'explicit.stat_3302775221');
  assert.equal(vaal.match.valueRollIndex, 1);
  const rage = matched.find(m => m.stat.text.startsWith('+9'));
  assert.equal(rage.match.id, 'explicit.stat_1181501418');
});

test('仇恨熔炉：传奇名与基底分列，符文和 ilvl 默认不限制', () => {
  const p = parseItemText(hateforge);
  const { query } = buildQuery(p, matchItem(p, compiled), {});
  assert.equal(query.name, '仇恨熔炉');
  assert.equal(query.type, '铸锻护手');
  assert.equal(query.filters.type_filters.filters.ilvl, undefined);
  const filters = query.stats[0].filters;
  assert.deepEqual(filters.find(f => f.id === 'explicit.stat_1062208444').value, { min: 300 });
  assert.equal(filters.some(f => f.id === 'explicit.stat_2866361420'), false);
  assert.deepEqual(filters.find(f => f.id === 'explicit.stat_2258007247').value, { min: 3 });
  assert.deepEqual(filters.find(f => f.id === 'explicit.stat_3302775221').value, { min: 8 });
  const cooldown = filters.find(f => f.id === 'explicit.stat_2284588585');
  assert.deepEqual(cooldown.value, { max: 6 });
  assert.equal(filters.find(f => f.id === 'explicit.stat_1181501418').value.min, -10);
  assert.equal(filters.filter(f => f.id.startsWith('rune.')).every(f => f.disabled), true);
});

// ---- 热键组合键判定逻辑（mock uiohook，不依赖真实权限）----
test('热键：Ctrl+Alt+C 命中判定与防抖', () => {
  const { HotkeyWatcher } = require('../src/hotkey.js');
  let captured = null;
  const fakeClipboard = { readText: () => '物品类别: 战矛\n稀有度: 稀有\n--------' };
  const w = new HotkeyWatcher(fakeClipboard, (t) => { captured = t; }, {
    readDelayMs: 10, looksLikeItemText: (t) => /^物品类别:/m.test(t),
  });
  // 直接驱动内部 handlers，模拟 uiohook 事件键码（C=46 Ctrl=29 Alt=56）
  const UiohookKey = { C:46, Ctrl:29, CtrlRight:3629, Alt:56, AltRight:3640, Shift:42, ShiftRight:3654 };
  // 注入模块缓存的 UiohookKey：通过 mock require 缓存
  const Module = require('node:module');
  const origLoad = Module._load;
  Module._load = function(req, ...rest) {
    if (req === 'uiohook-napi') return { uIOhook: { on(){}, removeListener(){}, start(){}, stop(){} }, UiohookKey };
    return origLoad.call(this, req, ...rest);
  };
  try {
    w.start();
    w._onKeyDown({ keycode: 29 }); // Ctrl down
    w._onKeyDown({ keycode: 56 }); // Alt down
    w._onKeyDown({ keycode: 46 }); // C down → 命中
    assert.equal(w.mods.ctrl, true);
    assert.equal(w.mods.alt, true);
    // 防抖：立即再按 C 不应重复调度
    const t0 = w.lastTrigger;
    w._onKeyDown({ keycode: 46 });
    assert.equal(w.lastTrigger, t0, '500ms 内重复触发应被防抖忽略');
    w._onKeyUp({ keycode: 29 });
    assert.equal(w.mods.ctrl, false);
    // 等延迟读剪贴板
    return new Promise((resolve) => setTimeout(() => {
      assert.ok(captured && captured.includes('物品类别'), '应读到装备文本并回调');
      w.stop();
      resolve();
    }, 40));
  } finally {
    Module._load = origLoad;
  }
});

test('热键：缺修饰键不触发', () => {
  const { HotkeyWatcher } = require('../src/hotkey.js');
  let captured = null;
  const w = new HotkeyWatcher({ readText: () => '物品类别: x' }, (t) => { captured = t; }, { readDelayMs: 10 });
  const UiohookKey = { C:46, Ctrl:29, CtrlRight:3629, Alt:56, AltRight:3640, Shift:42, ShiftRight:3654 };
  const Module = require('node:module');
  const origLoad = Module._load;
  Module._load = function(req, ...rest) {
    if (req === 'uiohook-napi') return { uIOhook: { on(){}, removeListener(){}, start(){}, stop(){} }, UiohookKey };
    return origLoad.call(this, req, ...rest);
  };
  try {
    w.start();
    w._onKeyDown({ keycode: 29 }); // 只按 Ctrl
    w._onKeyDown({ keycode: 46 }); // C，缺 Alt
    assert.equal(w.lastTrigger, 0, '缺 Alt 不应触发');
    w.stop();
  } finally {
    Module._load = origLoad;
  }
});
