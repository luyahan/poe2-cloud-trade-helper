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
// ⚠️ 特殊词缀优先用 explicit 变体（EE2 initUiModFilters 同款策略）：
// 市集在售装备的词缀按普通外延词缀索引，desecrated/crafted/fractured 分组
// 只匹配「未揭露/工艺台」等特殊状态的挂单。买相似装备应搜 explicit id。
// 用户实测可用 URL（帝王的物理伤害提高）用的正是 explicit.stat_1509134228。
const TYPE_GROUP_PRIORITY = {
  Desecrated: ['explicit', 'desecrated'],
  Crafted: ['explicit', 'crafted'],
  Fractured: ['explicit', 'fractured'],
  Rune: ['rune', 'explicit'],
  Enchant: ['enchant', 'explicit'],
  Implicit: ['implicit', 'explicit'],
  Skill: ['skill', 'explicit'],
  Explicit: ['explicit'],
};

// 词缀类型后缀标记（词典文本不含这些，匹配前剥离）
const TYPE_SUFFIX = /\s*\((rune|implicit|enchant|crafted|fractured|desecrated|augmented)\)\s*$/i;

// 归一化：剥类型后缀 → 数值(含前导+号与区间)→# → 压缩所有空白 → 去首尾
// 关键：游戏文本带「+51 命中值」「暴击几率 +3.39%」，词典是「# 命中值」「暴击几率 #%」，
// 必须把数值前的 + 号一起吃掉，否则 +# ≠ # 导致漏配。
function normalizeTemplate(text) {
  return text
    .replace(TYPE_SUFFIX, '')
    .replace(/\+?-?\d+(?:\.\d+)?\s*(?:\(\+?-?\d+(?:\.\d+)?-\+?-?\d+(?:\.\d+)?\))?/g, '#')
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
function compileDictionary(dict) {
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
 * 给一条词缀的单行文本匹配 trade id
 * @returns { id, text, group, confidence, ambiguous } | null
 */
function matchStatLine(stat, groups, compiled) {
  const key = normalizeTemplate(stat.text);
  for (const gid of groups) {
    const map = compiled[gid];
    if (!map) continue;
    const hits = map.get(key);
    if (hits && hits.length) {
      const exact = hits.find((h) => normalizeDictText(h.text) === key && h.text === stat.template);
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
 * 给一条解析出的词缀匹配 trade id（支持多行混合词缀，每行各出一个 id）
 * @param mod  parseItemText 产出的 mod（含 type / stats[]）
 * @returns [{ stat, match }]  每行一个结果，match 可能为 null
 */
function matchMod(mod, compiled) {
  const groups = TYPE_GROUP_PRIORITY[mod.type] || ['explicit'];
  return (mod.stats || []).map((stat) => ({
    stat,
    match: matchStatLine(stat, groups, compiled),
  }));
}

/**
 * 批量匹配整件装备，展平成 [{ mod, stat, match }]
 * 混合词缀（如「帝王的」=物理伤害提高+命中值）会产出多条。
 */
function matchItem(parsedItem, compiled) {
  const out = [];
  for (const mod of parsedItem.mods) {
    for (const { stat, match } of matchMod(mod, compiled)) {
      out.push({ mod, stat, match });
    }
  }
  return out;
}

module.exports = { normalizeTemplate, compileDictionary, matchMod, matchItem };
