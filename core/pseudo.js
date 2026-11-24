/**
 * pseudo 合并：把多条同族词缀合成一条「总数」筛选
 *
 * 移植自同项目油猴脚本 `userscript/src/features/pseudo.js`
 * （即 EE2 `filterPseudo` 的等价实现），规则语义保持一致。
 *
 * ---- 与油猴版的三个关键差异 ----
 *
 * 1) 判定主键：文本正则 → trade stat id 的数字段
 *    国服词典的文本顺序与国际服相反（国服「火焰抗性 #%」，国际服「+#% to Fire Resistance」），
 *    油猴版那套 /to Fire Resistance|火焰抗性/ 正则在国服只能碰巧命中一部分；
 *    而 stat id 跨语言、跨分组稳定（explicit / implicit / fractured / rune / desecrated
 *    共用同一个 stat_xxx），所以这里一律按 id 判定。
 *
 * 2) 数值来源：装备实际 roll，而不是查询里的 value.min
 *    桌面端拿到的是完整装备文本，parse-item 已算出每条词缀的 roll 区间，
 *    因此「总元素抗性」是这件装备真实的合计值，不是上一次搜索条件的合计。
 *
 * 3) 只输出「已启用」的建议
 *    油猴版有勾选面板，禁用建议也要写进 JSON 供用户回头勾选；
 *    桌面端没有面板，禁用建议只用于托盘菜单展示，不写入 URL（避免无意义载荷）。
 *
 * ---- 不变量（与油猴版一致）----
 *   · 不删除：被合并的原词缀保留在查询里，只标 disabled: true
 *   · 不改数：数值全部来自装备自身
 *   · 不猜测：启停由固定规则表决定，不做估价
 */

// ---- 抗性规则：一条词缀覆盖哪些元素 / 是否含混沌 ----
// 加权语义对齐 EE2：总元素抗性 = Σ(数值 × 该词缀覆盖的元素个数)，
// 因此「所有元素抗性 10」算 30，「火焰与闪电抗性 10」算 20。
const RESISTANCE_STATS = {
  stat_3372524247: { elements: ['fire'] },                      // 火焰抗性 #%
  stat_4220027924: { elements: ['cold'] },                      // 冰霜抗性 #%
  stat_1671376347: { elements: ['lightning'] },                 // 闪电抗性 #%
  stat_2923486259: { elements: [], chaos: true },               // 混沌抗性 #%
  stat_2901986750: { elements: ['fire', 'cold', 'lightning'] }, // 所有元素抗性 #%
  stat_3441501978: { elements: ['fire', 'lightning'] },         // #% 火焰与闪电抗性
  stat_2915988346: { elements: ['fire', 'cold'] },              // #% 火焰与冰霜抗性
  stat_4277795662: { elements: ['cold', 'lightning'] },         // #% 冰霜与闪电抗性
  stat_378817135: { elements: ['fire'], chaos: true },          // #% 火焰与混沌抗性
  stat_3393628375: { elements: ['cold'], chaos: true },         // #% 冰霜与混沌抗性
  stat_3465022881: { elements: ['lightning'], chaos: true },    // #% 闪电与混沌抗性
};

// ---- 属性规则：一条词缀贡献给哪几项属性 ----
// 全属性/双属性词缀对每一项都按其完整数值计入，不按属性个数均摊或倍乘。
const ATTRIBUTE_STATS = {
  stat_4080418644: ['strength'],                              // # 力量
  stat_3261801346: ['dexterity'],                             // # 敏捷
  stat_328541901: ['intelligence'],                           // # 智慧
  stat_1379411836: ['strength', 'dexterity', 'intelligence'], // # 全属性
  stat_1535626285: ['strength', 'intelligence'],              // # 力量和智慧
  stat_538848803: ['strength', 'dexterity'],                  // # 力量和敏捷
  stat_2300185227: ['dexterity', 'intelligence'],             // # 敏捷和智慧
};

const LIFE_STAT = 'stat_3299347043';      // # 生命上限（直接生命）
const MANA_STAT = 'stat_1050105434';      // # 魔力上限（直接魔力）
const MOVEMENT_STAT = 'stat_2250533757';  // 移动速度提高 #%

// 石板（Tablet）剩余使用次数：国服是 8 个不同的 implicit 词缀，文本形如
// 「为一张地图增加深渊\n剩余次数：#」，公共尾巴用模板判定即可，不必枚举 id。
const TABLET_USES_TEMPLATE = /剩余次数：#/;

// 每点力量 = 2 点生命，每点智慧 = 2 点魔力（EE2 口径）
const ATTRIBUTE_TO_LIFE = 2;
const ATTRIBUTE_TO_MANA = 2;

const PSEUDO_TEXT = {
  'pseudo.pseudo_total_elemental_resistance': '总元素抗性',
  'pseudo.pseudo_total_resistance': '总抗性（全抗+最低单抗）',
  'pseudo.pseudo_total_fire_resistance': '总火焰抗性',
  'pseudo.pseudo_total_cold_resistance': '总冰霜抗性',
  'pseudo.pseudo_total_lightning_resistance': '总闪电抗性',
  'pseudo.pseudo_total_chaos_resistance': '总混沌抗性',
  'pseudo.pseudo_total_strength': '总力量',
  'pseudo.pseudo_total_dexterity': '总敏捷',
  'pseudo.pseudo_total_intelligence': '总智慧',
  'pseudo.pseudo_total_all_attributes': '全属性合计',
  'pseudo.pseudo_total_attributes': '属性总和',
  'pseudo.pseudo_total_life': '总生命值',
  'pseudo.pseudo_total_mana': '总魔力值',
  'pseudo.pseudo_increased_movement_speed': '移动速度合计',
  'pseudo.pseudo_number_of_uses_remaining': '石板剩余使用次数',
};

/**
 * 取 stat id 的数字段作为规则键。
 * `explicit.stat_3299347043` / `implicit.stat_3299347043` → `stat_3299347043`
 * 这样同一条词缀出现在任意分组下都能被同一条规则识别。
 */
function ruleKey(id) {
  if (typeof id !== 'string') return '';
  const dot = id.indexOf('.');
  return dot >= 0 ? id.slice(dot + 1) : id;
}

/** 从筛选值（{min}/{max} 或裸数字）取出用于合计的数值 */
function resolveValue(value) {
  if (typeof value === 'number') return value;
  if (!value || typeof value !== 'object') return null;
  if (typeof value.min === 'number') return value.min;
  if (typeof value.max === 'number') return value.max;
  return null;
}

function makeSuggestion(id, sources, enabled, value) {
  return {
    id,
    text: PSEUDO_TEXT[id] || id,
    value: { min: value },
    enabled,
    sources,
  };
}

/** 抗性合计：总元素抗性 / 总抗性 / 单元素合计 / 总混沌抗性 */
function buildResistanceSuggestions(candidates) {
  const rows = [];
  for (const candidate of candidates) {
    const rule = RESISTANCE_STATS[ruleKey(candidate.id)];
    if (!rule) continue;
    const value = resolveValue(candidate.value);
    if (value === null) continue;
    rows.push({ candidate, rule, value });
  }
  if (rows.length === 0) return [];

  const elements = { fire: 0, cold: 0, lightning: 0 };
  for (const row of rows) {
    for (const element of row.rule.elements) elements[element] += row.value;
  }

  // 只有真正贡献元素抗性的词缀才算进总元素抗性；
  // 纯混沌词缀单独成条（油猴版把它也算作来源，会平白丢掉混沌约束）。
  const elementalRows = rows.filter((row) => row.rule.elements.length > 0);
  const suggestions = [];

  const elemental = elementalRows.reduce((sum, row) => sum + row.value * row.rule.elements.length, 0);
  if (elemental > 0) {
    suggestions.push(makeSuggestion(
      'pseudo.pseudo_total_elemental_resistance',
      elementalRows.map((row) => row.candidate),
      true,
      elemental,
    ));
  }

  // 总抗性：需要「覆盖三元素且含混沌」的全抗词缀（EE2 语义）。
  // 国服词典目前没有这条词缀，因此本建议实际不会产出，代码保留以对齐 EE2。
  const universal = rows.filter((row) => row.rule.elements.length === 3 && row.rule.chaos === true);
  if (universal.length > 0) {
    const universalTotal = universal.reduce((sum, row) => sum + row.value, 0);
    suggestions.push(makeSuggestion(
      'pseudo.pseudo_total_resistance',
      rows.map((row) => row.candidate),
      false,
      universalTotal + Math.min(elements.fire, elements.cold, elements.lightning),
    ));
  }

  // 单元素合计：先按元素聚合，再由下面的收敛逻辑只留最高的一条。
  const singles = [];
  for (const [element, id] of [
    ['fire', 'pseudo.pseudo_total_fire_resistance'],
    ['cold', 'pseudo.pseudo_total_cold_resistance'],
    ['lightning', 'pseudo.pseudo_total_lightning_resistance'],
  ]) {
    if (elements[element] <= 0) continue;
    const elementRows = rows.filter((row) => row.rule.elements.includes(element));
    singles.push(makeSuggestion(id, elementRows.map((row) => row.candidate), false, elements[element]));
  }

  const chaosRows = rows.filter((row) => row.rule.chaos === true);
  const chaos = chaosRows.reduce((sum, row) => sum + row.value, 0);
  if (chaos > 0) {
    suggestions.push(makeSuggestion(
      'pseudo.pseudo_total_chaos_resistance',
      chaosRows.map((row) => row.candidate),
      false,
      chaos,
    ));
  }

  // EE2：单抗收敛独立于总元素抗性 —— 始终只保留数值唯一最高的单抗，
  // 并列最高或只有一条以外的冲突情况全部丢弃（总元素抗性已覆盖各元素信息）。
  if (singles.length > 0) {
    const ordered = [...singles].sort((a, b) => b.value.min - a.value.min);
    const keep = ordered.length === 1
      ? ordered[0]
      : ordered[0].value.min !== ordered[1].value.min ? ordered[0] : null;
    if (keep) suggestions.push(keep);
  }

  return suggestions;
}

/** 属性合计：总力量/敏捷/智慧、全属性合计、属性总和 */
function buildAttributeSuggestions(candidates) {
  const rows = [];
  for (const candidate of candidates) {
    const attributes = ATTRIBUTE_STATS[ruleKey(candidate.id)];
    if (!attributes) continue;
    const value = resolveValue(candidate.value);
    if (value === null) continue;
    rows.push({ candidate, attributes, value });
  }
  if (rows.length === 0) return [];

  const totals = { strength: 0, dexterity: 0, intelligence: 0 };
  for (const row of rows) {
    for (const attribute of row.attributes) totals[attribute] += row.value;
  }

  const suggestions = [];
  for (const [attribute, id] of [
    ['strength', 'pseudo.pseudo_total_strength'],
    ['dexterity', 'pseudo.pseudo_total_dexterity'],
    ['intelligence', 'pseudo.pseudo_total_intelligence'],
  ]) {
    if (totals[attribute] <= 0) continue;
    const attributeRows = rows.filter((row) => row.attributes.includes(attribute));
    suggestions.push(makeSuggestion(
      id,
      attributeRows.map((row) => row.candidate),
      true,
      totals[attribute],
    ));
  }

  const universalRows = rows.filter((row) => row.attributes.length === 3);
  const universal = universalRows.reduce((sum, row) => sum + row.value, 0);
  if (universal > 0) {
    suggestions.push(makeSuggestion(
      'pseudo.pseudo_total_all_attributes',
      universalRows.map((row) => row.candidate),
      false,
      universal,
    ));
  }

  // 属性总和需要至少两条来源才有意义（一条时与它自身重复）
  if (rows.length >= 2) {
    suggestions.push(makeSuggestion(
      'pseudo.pseudo_total_attributes',
      rows.map((row) => row.candidate),
      false,
      rows.reduce((sum, row) => sum + row.value, 0),
    ));
  }

  return suggestions;
}

/**
 * 生命 / 魔力合计：直接生命 + 力量 × 2
 *
 * EE2 `required` 语义：必须存在「直接」最大生命/最大魔力词缀才生成建议，
 * 只有力量词缀不会凭空造出一条总生命。
 */
function buildLifeManaSuggestions(candidates) {
  const rows = [];
  for (const candidate of candidates) {
    const key = ruleKey(candidate.id);
    if (key !== LIFE_STAT && key !== MANA_STAT) continue;
    const value = resolveValue(candidate.value);
    if (value === null) continue;
    rows.push({ candidate, key, value });
  }
  if (rows.length === 0) return [];

  const suggestions = [];
  for (const [directKey, attribute, id, rate, enabled] of [
    [LIFE_STAT, 'strength', 'pseudo.pseudo_total_life', ATTRIBUTE_TO_LIFE, true],
    [MANA_STAT, 'intelligence', 'pseudo.pseudo_total_mana', ATTRIBUTE_TO_MANA, false],
  ]) {
    const direct = rows.filter((row) => row.key === directKey);
    if (direct.length === 0) continue;
    const directTotal = direct.reduce((sum, row) => sum + row.value, 0);

    // 力量/智慧来源（含双属性、全属性），按覆盖到该属性计其完整数值。
    const attributeRows = [];
    let attributeTotal = 0;
    for (const candidate of candidates) {
      const attributes = ATTRIBUTE_STATS[ruleKey(candidate.id)];
      if (!attributes || !attributes.includes(attribute)) continue;
      const value = resolveValue(candidate.value);
      if (value === null) continue;
      attributeRows.push(candidate);
      attributeTotal += value;
    }

    suggestions.push(makeSuggestion(
      id,
      [...direct.map((row) => row.candidate), ...attributeRows],
      enabled,
      directTotal + attributeTotal * rate,
    ));
  }
  return suggestions;
}

/** 移动速度合计：唯一来源是 implicit 时默认禁用（EE2 行为） */
function buildMovementSuggestions(candidates) {
  const sources = [];
  for (const candidate of candidates) {
    if (ruleKey(candidate.id) !== MOVEMENT_STAT) continue;
    if (resolveValue(candidate.value) === null) continue;
    sources.push(candidate);
  }
  if (sources.length === 0) return [];
  const implicitOnly = sources.length === 1 && /^implicit\./i.test(sources[0].id);
  return [makeSuggestion(
    'pseudo.pseudo_increased_movement_speed',
    sources,
    !implicitOnly,
    sources.reduce((sum, candidate) => sum + resolveValue(candidate.value), 0),
  )];
}

/** 石板剩余使用次数 */
function buildTabletSuggestions(candidates) {
  const sources = candidates.filter((candidate) =>
    typeof candidate.template === 'string'
    && TABLET_USES_TEMPLATE.test(candidate.template)
    && resolveValue(candidate.value) !== null);
  if (sources.length === 0) return [];
  return [makeSuggestion(
    'pseudo.pseudo_number_of_uses_remaining',
    sources,
    true,
    sources.reduce((sum, candidate) => sum + resolveValue(candidate.value), 0),
  )];
}

/**
 * 生成 pseudo 合并建议。
 *
 * @param candidates 查询候选词缀 [{ id, value, template, type, filter? }]
 *                   value 为写入市集的筛选值（{min} / {max} / 裸数字）
 * @returns 建议数组 [{ id, text, value:{min}, enabled, sources:[candidate] }]
 *          sources 是参与合并的候选对象引用，宿主据此把原词缀标为 disabled。
 */
function buildPseudoFilters(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];
  // 去重集合必须取自「全部候选」（含已存在的 pseudo）：
  // 重复优化时已有同 id 的 pseudo 不应再生成一条，否则数值会翻倍。
  const existing = new Set(candidates.map((candidate) => candidate.id));
  // 但计算输入要排除 pseudo 自身，避免把上一轮的合并结果当成来源再算一遍。
  const usable = candidates.filter((candidate) => !/^pseudo\./i.test(candidate.id || ''));
  if (usable.length === 0) return [];

  return [
    ...buildResistanceSuggestions(usable),
    ...buildAttributeSuggestions(usable),
    ...buildLifeManaSuggestions(usable),
    ...buildMovementSuggestions(usable),
    ...buildTabletSuggestions(usable),
  ].filter((suggestion) => !existing.has(suggestion.id));
}

module.exports = {
  buildPseudoFilters,
  PSEUDO_TEXT,
  RESISTANCE_STATS,
  ATTRIBUTE_STATS,
  ruleKey,
  resolveValue,
};
