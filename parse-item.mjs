/**
 * 国服简中 PoE2 高级复制文本解析器（原型）
 *
 * 输入：游戏内 Ctrl+Alt+C 复制的装备文本（经云游戏剪贴板同步到本地）
 * 输出：结构化 JSON（供后续匹配市集词典 → trade2 查询）
 *
 * 格式依据真实样本（2026-11-23）：
 *   { 前缀属性 "焦化的" (等阶：1) — 伤害, 元素, 火焰, 攻击 }
 *   附加 90 (88-101) - 141 (133-154) 火焰伤害
 *
 * 与 EE2 繁中(cmn-Hant)的差异：tier 标签是「等阶：」而非「階層：」，
 * 前缀/后缀是「前缀属性/后缀属性」，亵渎/打造是「亵渎的/打造的」。
 */

// ---- 词缀元信息行正则（国服简中）----
// { [亵渎的|打造的|已破裂] 前缀属性|后缀属性 "名字" (等阶：N) — tag1, tag2 }
const MOD_LINE =
  /^\{\s*(?<special>亵渎的|打造的|已破裂|已工艺)?\s*(?<gen>前缀属性|后缀属性|固定词缀)\s*"(?<name>[^"]*)"\s*(?:\(等阶：(?<tier>\d+)\))?\s*(?:\(阶级：(?<rank>\d+)\))?\s*(?:—\s*(?<tags>[^}]*))?\}$/;

// 数值+区间：90 (88-101) 或 23 (23-25) 或 5（无区间）
const NUM_RANGE = /(?<value>-?\d+(?:\.\d+)?)\s*(?:\((?<min>-?\d+(?:\.\d+)?)-(?<max>-?\d+(?:\.\d+)?)\))?/g;

const SECTION_SEP = /^-{4,}$/;

// 词缀类型后缀 → ModifierType
function detectModType(statLines) {
  const joined = statLines.join('\n');
  if (/\(rune\)\s*$/m.test(joined)) return 'Rune';
  if (/\(implicit\)\s*$/m.test(joined)) return 'Implicit';
  if (/\(enchant\)\s*$/m.test(joined)) return 'Enchant';
  if (/\(crafted\)\s*$/m.test(joined)) return 'Crafted';
  if (/\(fractured\)\s*$/m.test(joined)) return 'Fractured';
  if (/\(desecrated\)\s*$/m.test(joined)) return 'Desecrated';
  return 'Explicit';
}

// 从一条词缀文本里抽出所有 (value, min, max)
function extractRolls(text) {
  const rolls = [];
  for (const m of text.matchAll(NUM_RANGE)) {
    rolls.push({
      value: Number(m.groups.value),
      min: m.groups.min != null ? Number(m.groups.min) : undefined,
      max: m.groups.max != null ? Number(m.groups.max) : undefined,
    });
  }
  return rolls;
}

// 去掉数值区间，得到用于词典匹配的「模板」（把数字替换成 #）
function toTemplate(text) {
  return text
    .replace(NUM_RANGE, '#')
    .replace(/\s+/g, ' ')
    .trim();
}

// 计算 roll 分位 goodness（0~1，越高越好）
function goodness(roll, better = 'positive') {
  if (roll.min == null || roll.max == null || roll.max === roll.min) return undefined;
  let g = (roll.value - roll.min) / (roll.max - roll.min);
  if (better === 'negative') g = 1 - g;
  return Math.round(g * 1000) / 1000;
}

/**
 * 主解析函数
 */
export function parseItemText(raw) {
  // 1) 规整：统一换行、去首尾空白
  let text = raw.replace(/\r\n?/g, '\n').trim();

  // 2) 去重：样本里整段被粘贴了两遍。以「物品类别:」为锚点，只取第一段。
  const firstAnchor = text.indexOf('物品类别:');
  if (firstAnchor >= 0) {
    const secondAnchor = text.indexOf('物品类别:', firstAnchor + 1);
    if (secondAnchor >= 0) text = text.slice(0, secondAnchor).trim();
  }

  const lines = text.split('\n').map((l) => l.trimEnd());

  const item = {
    category: undefined,
    rarity: undefined,
    name: undefined,
    baseName: undefined,
    quality: undefined,
    itemLevel: undefined,
    properties: {},
    requirements: {},
    sockets: undefined,
    mods: [],
    unidentified: false,
  };

  // 3) 头部字段（第一个分隔线之前 + 散落的关键行）
  for (const line of lines) {
    let m;
    if ((m = line.match(/^物品类别:\s*(.+)$/))) item.category = m[1].trim();
    else if ((m = line.match(/^稀有度:\s*(.+)$/))) item.rarity = m[1].trim();
    else if ((m = line.match(/^物品等级:\s*(\d+)/))) item.itemLevel = Number(m[1]);
    else if ((m = line.match(/^品质:\s*\+?(\d+)%/))) item.quality = Number(m[1]);
    else if ((m = line.match(/^插槽:\s*(.+)$/))) item.sockets = m[1].trim();
    else if ((m = line.match(/^物理伤害:\s*(\d+)-(\d+)/)))
      item.properties.physicalDamage = { min: Number(m[1]), max: Number(m[2]) };
    else if ((m = line.match(/^暴击率:\s*([\d.]+)%/)))
      item.properties.critChance = Number(m[1]);
    else if ((m = line.match(/^每秒攻击次数:\s*([\d.]+)/)))
      item.properties.attackSpeed = Number(m[1]);
    else if ((m = line.match(/^元素伤害:\s*(.+)$/)))
      item.properties.elementalDamage = m[1].trim();
  }

  // 名称：稀有度行之后、第一条分隔线之前的非字段行
  const rarityIdx = lines.findIndex((l) => /^稀有度:/.test(l));
  if (rarityIdx >= 0) {
    const nameLines = [];
    for (let i = rarityIdx + 1; i < lines.length; i++) {
      if (SECTION_SEP.test(lines[i])) break;
      if (/^[^:：]+[:：]/.test(lines[i])) continue; // 跳过「品质:」这类字段行
      if (lines[i].trim()) nameLines.push(lines[i].trim());
    }
    if (nameLines.length >= 2) {
      item.name = nameLines[0];
      item.baseName = nameLines[nameLines.length - 1];
    } else if (nameLines.length === 1) {
      item.baseName = nameLines[0];
    }
  }

  // 4) 词缀：逐行扫描，遇到 { ... } 元信息行就开一条新词缀，后续非元信息行是它的数值文本
  //    头部（名称/属性/需求/插槽/ilvl）不含词缀，从第一个 {} 行或带 (rune/implicit) 标记的行起算。
  let modRegionStarted = false;
  let current = null;
  let pendingPlain = []; // 没有元信息行的裸词缀（如 rune 行在分隔区）
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (SECTION_SEP.test(trimmed)) {
      if (current) { item.mods.push(current); current = null; }
      continue;
    }
    const isModInfo = MOD_LINE.test(trimmed);
    const isTaggedPlain = /\((rune|implicit|enchant|crafted|fractured|desecrated)\)\s*$/.test(trimmed);
    if (!modRegionStarted) {
      if (isModInfo || isTaggedPlain) modRegionStarted = true;
      else continue; // 仍在头部，跳过名称/字段行
    }
    const mm = trimmed.match(MOD_LINE);
    if (mm) {
      if (current) item.mods.push(current);
      const g = mm.groups;
      current = {
        type: g.special === '亵渎的' ? 'Desecrated'
            : g.special === '打造的' ? 'Crafted'
            : g.special === '已破裂' ? 'Fractured'
            : 'Explicit',
        generation: g.gen === '前缀属性' ? 'prefix' : g.gen === '后缀属性' ? 'suffix' : 'implicit',
        name: g.name || undefined,
        tier: g.tier ? Number(g.tier) : undefined,
        rank: g.rank ? Number(g.rank) : undefined,
        tags: g.tags ? g.tags.split(',').map((s) => s.trim()).filter(Boolean) : [],
        statLines: [],
      };
      continue;
    }
    // 跳过无关尾行（「引路石掉落」等）。头部字段行已在 modRegionStarted 之前被跳过，
    // 这里不再按字段名过滤，否则会误杀「物理伤害提高 20% (rune)」这类词缀。
    if (/^引路石掉落/.test(trimmed)) continue;
    if (current) {
      current.statLines.push(trimmed);
    } else {
      pendingPlain.push(trimmed);
    }
  }
  if (current) item.mods.push(current);

  // 裸词缀（rune/implicit 等没有 {} 包裹的）单独成条
  for (const pl of pendingPlain) {
    item.mods.push({
      type: detectModType([pl]),
      generation: undefined,
      name: undefined,
      tier: undefined,
      tags: [],
      statLines: [pl],
    });
  }

  // 5) 给每条词缀补 rolls / template / goodness
  for (const mod of item.mods) {
    mod.stats = mod.statLines.map((sl) => {
      const rolls = extractRolls(sl);
      return {
        text: sl,
        template: toTemplate(sl),
        rolls,
        goodness: rolls.length ? goodness(rolls[0]) : undefined,
      };
    });
    delete mod.statLines;
  }

  // 6) 整体指标（武器 DPS 雏形，供后续 pseudo 用）
  const p = item.properties;
  if (p.physicalDamage && p.attackSpeed) {
    const avgPhys = (p.physicalDamage.min + p.physicalDamage.max) / 2;
    item.derived = { pdps: Math.round(avgPhys * p.attackSpeed * 10) / 10 };
  }

  return item;
}

// ---- CLI 自测 ----
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const here = dirname(fileURLToPath(import.meta.url));
  const file = process.argv[2] || join(here, 'sample-item.txt');
  const raw = readFileSync(file, 'utf8');
  const parsed = parseItemText(raw);
  console.log(JSON.stringify(parsed, null, 2));
  console.error('\n--- 摘要 ---');
  console.error(`名称: ${parsed.name} / 基底: ${parsed.baseName} / 类别: ${parsed.category}`);
  console.error(`稀有度: ${parsed.rarity} / ilvl: ${parsed.itemLevel} / 品质: ${parsed.quality}%`);
  console.error(`词缀数: ${parsed.mods.length}`);
  for (const m of parsed.mods) {
    const tier = m.tier != null ? `T${m.tier}` : '--';
    console.error(`  [${tier}] ${m.type}/${m.generation || '?'} "${m.name || ''}" → ${m.stats.map((s) => s.template).join(' | ')}`);
  }
}
