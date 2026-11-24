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

const { calcWeaponDps } = require('./weapon-dps.js');
const { calcDefences } = require('./defences.js');

// ---- 词缀元信息行正则（国服简中）----
// { [亵渎的|打造的|已破裂] 前缀属性|后缀属性|基底属性 ["名字"] (等阶：N) — tag1, tag2 }
// 名字与等阶均可选：基底属性行无名字无 tier，如 { 基底属性 — 攻击 }
const MOD_LINE =
  /^\{\s*(?<special>亵渎的|打造的|已破裂|已工艺)?\s*(?<gen>前缀属性|后缀属性|前缀词缀|后缀词缀|固定词缀|基底属性|传奇属性|瓦尔传奇词缀|腐化强化)\s*(?:"(?<name>[^"]*)"|“(?<nameCN>[^”]*)”)?\s*(?:\(等阶：(?<tier>\d+)\))?\s*(?:\(阶级：(?<rank>\d+)\))?\s*(?:—\s*(?<tags>[^}]*))?\}$/;

// 获得技能行（武器基底自带技能，如「获得技能: 战矛飞掷」）
const GRANT_SKILL_LINE = /^获得技能:\s*(.+)$/;

// 数值+区间：90 (88-101)、+9 (-10-+10)、23 (23-25) 或 5（无区间）。
// 区间分隔符与前导正负号分别匹配，避免把 (-10-+10) 拆成三个独立数字。
const NUM_RANGE = /(?<sign>[+-]?)(?<value>\d+(?:\.\d+)?)\s*(?:\((?<min>[+-]?\d+(?:\.\d+)?)\s*[-–—]\s*(?<max>[+-]?\d+(?:\.\d+)?)\))?/g;

const SECTION_SEP = /^-{4,}$/;
const TAGGED_PLAIN = /\((rune|implicit|enchant|crafted|fractured|desecrated)\)\s*$/;

// ---- 头部字段表：行首标签 → item 字段 ----
// 按声明顺序取第一个命中（与原 else-if 链一致）。
// target 是 item.properties 的键；field 直接写 item 顶层。
const HEADER_FIELDS = [
  { pattern: /^物品类别:\s*(.+)$/, field: 'category', text: true },
  { pattern: /^稀\s*有\s*度:\s*(.+)$/, field: 'rarity', text: true },
  { pattern: /^物品等级:\s*(\d+)/, field: 'itemLevel' },
  { pattern: /^品质:\s*\+?(\d+)%/, field: 'quality' },
  { pattern: /^护甲:\s*(\d+)/, target: 'armour' },
  { pattern: /^闪避(?:值)?:\s*(\d+)/, target: 'evasion' },
  { pattern: /^能量护盾(?:上限)?:\s*(\d+)/, target: 'energyShield' },
  { pattern: /^符文(?:结界|壁垒):\s*(\d+)/, target: 'ward' },
  { pattern: /^格挡(?:几率|率)?:\s*([\d.]+)%/, target: 'block' },
  { pattern: /^精魂:\s*(\d+)/, target: 'spirit' },
  { pattern: /^插槽:\s*(.+)$/, field: 'sockets', text: true },
  // 引路石面板字段（map_filters）。字段名以国服 filters 词典官方 text 为准：
  // map_magic_monsters=「怪物效能」、map_rare_monsters=「怪物稀有度」，
  // 旧文本变体（魔法怪物/稀有怪物数量）一并保留。
  { pattern: /^(?:引路石)?等阶:\s*(\d+)/, target: 'mapTier' },
  { pattern: /^怪物群(?:大小|规模):\s*\+?([\d.]+)%/, target: 'mapPackSize' },
  { pattern: /^(?:怪物效能|魔法怪物(?:数量)?):\s*\+?([\d.]+)%/, target: 'mapMagicMonsters' },
  { pattern: /^(?:怪物稀有度|稀有怪物(?:数量)?):\s*\+?([\d.]+)%/, target: 'mapRareMonsters' },
  { pattern: /^物品稀有度:\s*\+?([\d.]+)%/, target: 'mapIir' },
  { pattern: /^(?:可用)?(?:复活|挑战)次数:\s*(\d+)/, target: 'mapRevives' },
  { pattern: /^(?:引路石)?掉落几率:\s*\+?([\d.]+)%/, target: 'mapBonus' },
  { pattern: /^金币:\s*\+?([\d.]+)%/, target: 'mapGold' },
  { pattern: /^经验:\s*\+?([\d.]+)%/, target: 'mapExperience' },
  { pattern: /^暴击率:\s*([\d.]+)%/, target: 'critChance' },
  { pattern: /^每秒攻击次数:\s*([\d.]+)/, target: 'attackSpeed' },
  { pattern: /^元素伤害:\s*(.+)$/, target: 'elementalDamage', text: true },
];
const PHYSICAL_DAMAGE_LINE = /^物理伤害:\s*(\d+)-(\d+)/;

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

// flavour text 判定：传奇装备底部的背景描述文字。
// 特征：纯中文叙事句（含逗号/句号结尾）、不含数值、不含词缀类型标记、不以 { 开头。
function isFlavourText(text) {
  if (/^\{/.test(text)) return false;
  if (/\((rune|implicit|enchant|crafted|fractured|desecrated|augmented)\)/.test(text)) return false;
  if (/^获得技能:/.test(text)) return false;
  if (CORRUPTED_LINE.test(text)) return false;
  if (/^未鉴定/.test(text)) return false;
  // 使用说明行（珠宝/引路石等）不是 flavour text，也不属于词缀
  if (/^放置到一个天赋树/.test(text)) return false;
  if (/^可在地图装置中使用/.test(text)) return false;
  // 含数值（roll 区间）的一定不是 flavour text
  if (/\d/.test(text)) return false;
  // 中文叙事句：以中文逗号/句号/省略号结尾，或整行都是中文字符
  return /[，。]$/.test(text) || /…$/.test(text) ||
    /^[一-龥，。、；：""''（）…\s]+$/.test(text);
}

// 从一条词缀文本里抽出所有 (value, min, max)
function extractRolls(text) {
  const rolls = [];
  for (const m of text.matchAll(NUM_RANGE)) {
    rolls.push({
      value: Number(`${m.groups.sign || ''}${m.groups.value}`),
      min: m.groups.min != null ? Number(m.groups.min) : undefined,
      max: m.groups.max != null ? Number(m.groups.max) : undefined,
    });
  }
  return rolls;
}

// 模板沿用词典的 # 形式（数值前导 + 一并去除），避免 +# 与 # 的虚假差异。
function toTemplate(text) {
  return text
    .replace(/\+?\s*(?=\d)/g, '')
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

// 腐化标记关键词族：被腐化 / 双重腐化（瓦尔腐化两次）等。
// 「双重腐化」同样意味着已腐化，漏认会让腐化货被 corrupted=false 排除。
const CORRUPTED_LINE = /^(?:被腐化|双重腐化)/;

/** 头部字段：逐行按字段表取第一个命中 */
function parseHeader(lines, item) {
  for (const line of lines) {
    if (CORRUPTED_LINE.test(line)) { item.corrupted = true; continue; }
    if (/^未鉴定/.test(line)) { item.unidentified = true; continue; }
    const physical = line.match(PHYSICAL_DAMAGE_LINE);
    if (physical) {
      item.properties.physicalDamage = { min: Number(physical[1]), max: Number(physical[2]) };
      continue;
    }
    for (const { pattern, field, target, text } of HEADER_FIELDS) {
      const m = line.match(pattern);
      if (!m) continue;
      const value = text ? m[1].trim() : Number(m[1]);
      if (field) item[field] = value;
      else item.properties[target] = value;
      break;
    }
  }
}

/** 名称：稀有度行之后、第一条分隔线之前的非字段行 */
function parseNames(lines, item) {
  const rarityIdx = lines.findIndex((l) => /^稀\s*有\s*度:/.test(l));
  if (rarityIdx < 0) return;
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

// 引路石基底名携带等阶：真实文本是「引路石（ 15 阶）」，没有独立等阶行。
// 等阶提取进 properties.mapTier；baseName 归一为「引路石」——市集 type 匹配
// 认的是基底名，带等阶后缀的整串会匹配失败（同「黄金戒指」虚构名教训）。
const WAYSTONE_BASE = /^引路石\s*[（(]\s*(?:等阶\s*)?(\d+)\s*(?:阶)?\s*[)）]$/;
function normalizeWaystoneBase(item) {
  if (item.category !== '引路石' || !item.baseName) return;
  const m = item.baseName.match(WAYSTONE_BASE);
  if (!m) return;
  if (item.properties.mapTier == null) item.properties.mapTier = Number(m[1]);
  item.baseName = '引路石';
}

const SPECIAL_MOD_TYPE = { 亵渎的: 'Desecrated', 打造的: 'Crafted', 已破裂: 'Fractured' };
const GENERATION = {
  前缀属性: 'prefix', 前缀词缀: 'prefix',
  后缀属性: 'suffix', 后缀词缀: 'suffix',
};

/** { ... } 元信息行 → 新词缀骨架（数值行随后追加） */
function modFromInfoLine(groups) {
  return {
    // 腐化强化（双重腐化珠宝的附加属性）按 Explicit 处理：
    // 市集在售装备按外延词缀索引，与亵渎/打造同策略。
    type: SPECIAL_MOD_TYPE[groups.special] || (groups.gen === '基底属性' ? 'Implicit' : 'Explicit'),
    generation: GENERATION[groups.gen] || 'implicit',
    name: groups.name || groups.nameCN || undefined,
    tier: groups.tier ? Number(groups.tier) : undefined,
    rank: groups.rank ? Number(groups.rank) : undefined,
    tags: groups.tags ? groups.tags.split(',').map((s) => s.trim()).filter(Boolean) : [],
    statLines: [],
  };
}

/** 获得技能行：单独成条（Skill 类型），不并入当前词缀 */
function pushGrantedSkill(item, skillName, rawLine) {
  item.grantedSkills ??= [];
  item.grantedSkills.push(skillName);
  item.mods.push({
    type: 'Skill', generation: undefined, name: skillName,
    tier: undefined, tags: [], statLines: [rawLine],
  });
}

/**
 * 词缀区扫描：遇到 { ... } 元信息行就开一条新词缀，后续非元信息行是它的数值文本。
 * 头部（名称/属性/需求/插槽/ilvl）不含词缀，从第一个 {} 行或带类型标记的行起算。
 */
function parseMods(lines, item) {
  let modRegionStarted = false;
  let current = null;
  const pendingPlain = []; // 没有元信息行的裸词缀（如 rune 行在分隔区）
  const flush = () => { if (current) { item.mods.push(current); current = null; } };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (SECTION_SEP.test(trimmed)) { flush(); continue; }

    const info = trimmed.match(MOD_LINE);
    const isTaggedPlain = TAGGED_PLAIN.test(trimmed);
    const skill = trimmed.match(GRANT_SKILL_LINE);
    if (!modRegionStarted) {
      if (!info && !isTaggedPlain && !skill) continue; // 仍在头部，跳过名称/字段行
      modRegionStarted = true;
    }

    if (info) {
      flush();
      current = modFromInfoLine(info.groups);
      continue;
    }
    if (skill) {
      flush();
      pushGrantedSkill(item, skill[1].trim(), trimmed);
      continue;
    }
    // 跳过无关尾行（「引路石掉落」等）。头部字段行已在 modRegionStarted 之前被跳过，
    // 这里不再按字段名过滤，否则会误杀「物理伤害提高 20% (rune)」这类词缀。
    if (/^引路石掉落/.test(trimmed)) continue;
    // 使用说明行（引路石/珠宝底部固定文案）不是词缀
    if (/^可在地图装置中使用/.test(trimmed)) continue;
    if (/^放置到一个天赋树/.test(trimmed)) continue;
    // 腐化/鉴定标记：不是词缀，只设 item 标志
    if (CORRUPTED_LINE.test(trimmed)) { item.corrupted = true; continue; }
    if (/^未鉴定/.test(trimmed)) { item.unidentified = true; continue; }
    // flavour text（传奇装备底部的背景描述）不属于任何词缀：
    // 当前词缀已有数值行时先收尾，后续 flavour 行直接跳过。
    if (current && current.statLines.length > 0 && isFlavourText(trimmed)) { flush(); continue; }
    if (!current && item.mods.length > 0 && isFlavourText(trimmed)) continue;

    if (current) current.statLines.push(trimmed);
    else pendingPlain.push(trimmed);
  }
  flush();

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
}

/**
 * 主解析函数
 */
function parseItemText(raw) {
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

  // 3) 头部字段与名称
  parseHeader(lines, item);
  parseNames(lines, item);
  normalizeWaystoneBase(item);

  // 4) 词缀
  parseMods(lines, item);

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

  // 6) 整体指标：EE2 q20 物理 + 火/冰/电面板 DPS，不是角色实际输出。
  const weaponDps = calcWeaponDps(item);
  const defences = calcDefences(item);
  if (weaponDps || defences) item.derived = { weaponDps, defences };

  return item;
}

module.exports = { parseItemText };