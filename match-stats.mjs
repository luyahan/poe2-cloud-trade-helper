/**
 * 词缀模板 → 国服 trade2 真实 id 匹配器
 *
 * 词典来源：https://poe.game.qq.com/api/trade2/data/stats（简中，无需登录）
 * 结构：{ result: [ { id:'explicit'|'desecrated'|'crafted'|'rune'|..., entries:[{id,text,type}] } ] }
 *
 * 核心策略（对齐 EE2 trade.ids 按词缀类型分命名空间）：
 *   - 词缀的 ModifierType 决定优先查哪个分组（亵渎→desecrated，打造→crafted，rune→rune…）
 *   - 文本归一化：把数值替换成 #、压缩空格，再精确匹配（避免「击中/击败」这类模糊误配）
 *   - 命中多个时按分组优先级 + 文本完全一致排序
 */

// 词缀类型 → 词典分组优先级（前面的优先）
const TYPE_GROUP_PRIORITY = {
  Desecrated: ['desecrated', 'explicit'],
  Crafted: ['crafted', 'explicit'],
  Fractured: ['fractured', 'explicit'],
  Rune: ['rune', 'explicit'],
  Enchant: ['enchant', 'explicit'],
  Implicit: ['implicit', 'explicit'],
  Explicit: ['explicit'],
};

// 词缀类型后缀标记（词典文本不含这些，匹配前剥离）
const TYPE_SUFFIX = /\s*\((rune|implicit|enchant|crafted|fractured|desecrated|augmented)\)\s*$/i;

// 归一化：剥类型后缀 → 数值(含区间)→# → 压缩所有空白 → 去首尾
export function normalizeTemplate(text) {
  return text
    .replace(TYPE_SUFFIX, '')
    .replace(/-?\d+(?:\.\d+)?\s*(?:\(-?\d+(?:\.\d+)?--?\d+(?:\.\d+)?\))?/g, '#')
    .replace(/\s+/g, '')
    .trim();
}

// 词典 entry.text 同样归一化（它本身用 # 占位，只需压空格）
function normalizeDictText(text) {
  return text.replace(/\s+/g, '').trim();
}

/**
 * 把词典编译成 { 分组 → Map<归一化文本, entry[]> }
 */
export function compileDictionary(dict) {
  const byGroup = {};
  for (const group of dict.result) {
    const map = new Map();
    for (const entry of group.entries) {
      const key = normalizeDictText(entry.text);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(entry);
    }
    byGroup[group.id] = map;
  }
  return byGroup;
}

/**
 * 给一条解析出的词缀匹配 trade id
 * @param mod  parseItemText 产出的 mod（含 type / stats[].template）
 * @param compiled  compileDictionary 产物
 * @returns { id, text, group, confidence } | null
 */
export function matchMod(mod, compiled) {
  const groups = TYPE_GROUP_PRIORITY[mod.type] || ['explicit'];
  // 一条词缀可能有多行文本，取第一行做主匹配（PoE2 绝大多数词缀单行）
  const stat = mod.stats?.[0];
  if (!stat) return null;
  const key = normalizeTemplate(stat.text);

  for (const gid of groups) {
    const map = compiled[gid];
    if (!map) continue;
    const hits = map.get(key);
    if (hits && hits.length) {
      // 同分组多命中：优先文本与原始模板完全一致（含空格）的
      const exact = hits.find((h) => h.text === stat.template);
      const chosen = exact || hits[0];
      return {
        id: chosen.id,
        text: chosen.text,
        group: gid,
        confidence: exact ? 'exact' : 'normalized',
        ambiguous: hits.length > 1,
      };
    }
  }
  return null;
}

/**
 * 批量匹配整件装备
 */
export function matchItem(parsedItem, compiled) {
  return parsedItem.mods.map((mod) => ({
    mod,
    match: matchMod(mod, compiled),
  }));
}

// ---- CLI 自测 ----
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseItemText } from './parse-item.mjs';

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const here = dirname(fileURLToPath(import.meta.url));
  const dict = JSON.parse(readFileSync(join(here, 'cn-stats.json'), 'utf8'));
  const compiled = compileDictionary(dict);
  const parsed = parseItemText(readFileSync(join(here, 'sample-item.txt'), 'utf8'));
  const results = matchItem(parsed, compiled);

  let hit = 0;
  console.log('--- 词缀匹配结果 ---');
  for (const { mod, match } of results) {
    const tier = mod.tier != null ? `T${mod.tier}` : '--';
    if (match) {
      hit++;
      console.log(`✓ [${tier}] ${mod.type} "${mod.name || '(rune)'}" → ${match.id}  (${match.confidence}${match.ambiguous ? ',多义' : ''})`);
    } else {
      console.log(`✗ [${tier}] ${mod.type} "${mod.name || '(rune)'}" → 未命中  模板=${mod.stats[0].template}`);
    }
  }
  console.log(`\n命中 ${hit}/${results.length}`);
}
