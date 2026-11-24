var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../core/roll-utils.js
var require_roll_utils = __commonJS({
  "../core/roll-utils.js"(exports, module) {
    function emptyRoll() {
      return { value: 0, min: 0, max: 0 };
    }
    function addRollMatch(target, m) {
      const value = Number(m[1]);
      target.value += value;
      target.min += Number(m[2] ?? value);
      target.max += Number(m[3] ?? value);
    }
    function addRolls(target, rolls) {
      for (const roll of rolls) {
        target.value += roll.value;
        target.min += roll.min;
        target.max += roll.max;
      }
    }
    function isModifiable(item) {
      return !item.corrupted && !item.isCorrupted && !item.mirrored && !item.isMirrored && !item.sanctified && !item.isSanctified;
    }
    function effectiveQuality(item) {
      const quality = item.quality ?? 0;
      return isModifiable(item) ? Math.max(20, quality) : quality;
    }
    function statTexts(item) {
      return (item.mods || []).flatMap((mod) => (mod.stats || []).map((stat) => stat.text || ""));
    }
    module.exports = { emptyRoll, addRollMatch, addRolls, isModifiable, effectiveQuality, statTexts };
  }
});

// ../core/weapon-dps.js
var require_weapon_dps = __commonJS({
  "../core/weapon-dps.js"(exports, module) {
    var { emptyRoll, addRollMatch, effectiveQuality, statTexts } = require_roll_utils();
    var ELEMENTS = ["fire", "cold", "lightning"];
    var ELEMENT_NAMES = { fire: "\u706B\u7130", cold: "\u51B0\u971C", lightning: "\u95EA\u7535" };
    var FLAT_DAMAGE_TARGET = { \u7269\u7406: "physicalFlat", \u706B\u7130: "fire", \u51B0\u971C: "cold", \u95EA\u7535: "lightning" };
    var PHYSICAL_INCREASED = /^物理伤害提高\s*(-?[\d.]+)(?:\s*\((-?[\d.]+)-(-?[\d.]+)\))?\s*%/;
    var FLAT_DAMAGE = /^(?:攻击)?附加\s*(-?[\d.]+)(?:\s*\((-?[\d.]+)-(-?[\d.]+)\))?\s*-\s*(-?[\d.]+)(?:\s*\((-?[\d.]+)-(-?[\d.]+)\))?\s*(物理|火焰|冰霜|闪电)伤害/;
    var ATTACK_SPEED_INCREASED = /^攻击速度提高\s*(-?[\d.]+)(?:\s*\((-?[\d.]+)-(-?[\d.]+)\))?\s*%/;
    function sumDamageStats(item) {
      const totals = {
        physicalFlat: emptyRoll(),
        physicalIncreased: emptyRoll(),
        fire: emptyRoll(),
        cold: emptyRoll(),
        lightning: emptyRoll()
      };
      for (const text of statTexts(item)) {
        const increased2 = text.match(PHYSICAL_INCREASED);
        if (increased2) {
          addRollMatch(totals.physicalIncreased, increased2);
          continue;
        }
        const flat = text.match(FLAT_DAMAGE);
        if (!flat) continue;
        const low = Number(flat[1]);
        const high = Number(flat[4]);
        const target = totals[FLAT_DAMAGE_TARGET[flat[7]]];
        target.value += (low + high) / 2;
        target.min += (Number(flat[2] ?? flat[1]) + Number(flat[5] ?? flat[4])) / 2;
        target.max += (Number(flat[3] ?? flat[1]) + Number(flat[6] ?? flat[4])) / 2;
      }
      return totals;
    }
    function parseElementalHeader(value, mods = []) {
      const totals = { fire: emptyRoll(), cold: emptyRoll(), lightning: emptyRoll() };
      if (typeof value !== "string") return totals;
      const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
      for (const part of parts) {
        const match = part.match(/^([\d.]+)\s*-\s*([\d.]+)(?:\s*\((fire|cold|lightning)\))?/);
        if (!match) continue;
        let element = match[3];
        if (!element && parts.length === 1) {
          const texts = statTexts({ mods });
          element = Object.entries(ELEMENT_NAMES).find(([, name]) => texts.some((text) => text.includes(`\u9644\u52A0`) && text.includes(`${name}\u4F24\u5BB3`)))?.[0];
        }
        if (!element || !totals[element]) continue;
        const average = (Number(match[1]) + Number(match[2])) / 2;
        totals[element] = { value: average, min: average, max: average };
      }
      return totals;
    }
    function sumAttackSpeed(item, aps) {
      const increased2 = emptyRoll();
      for (const text of statTexts(item)) {
        const match = text.match(ATTACK_SPEED_INCREASED);
        if (match) addRollMatch(increased2, match);
      }
      const base = aps / (1 + increased2.value / 100);
      return {
        value: aps,
        min: base * (1 + increased2.min / 100),
        max: base * (1 + increased2.max / 100),
        base,
        increased: increased2
      };
    }
    function increased(flat, increasedPct, qualityPct) {
      return flat * (1 + increasedPct / 100) * (1 + qualityPct / 100);
    }
    function calcPhysicalAverage(props, stats, quality, q20, hasElemental) {
      const physical = props.physicalDamage;
      const hasPhysical = physical && Number.isFinite(physical.min) && Number.isFinite(physical.max) && physical.min + physical.max > 0;
      if (!hasPhysical) {
        if (!hasElemental && stats.physicalFlat.value > 0) {
          return { ...stats.physicalFlat, base: 0, quality: 0, estimatedFromFlatOnly: true };
        }
        return void 0;
      }
      const currentAverage = (physical.min + physical.max) / 2;
      const increasedPct = stats.physicalIncreased.value;
      const base = currentAverage / ((1 + quality / 100) * (1 + increasedPct / 100)) - stats.physicalFlat.value;
      const min = increased(base + stats.physicalFlat.min, stats.physicalIncreased.min, q20);
      const max = increased(base + stats.physicalFlat.max, stats.physicalIncreased.max, q20);
      return {
        value: increased(base + stats.physicalFlat.value, increasedPct, q20),
        min: Math.min(min, max),
        max: Math.max(min, max),
        base,
        quality: q20
      };
    }
    function rollDps(entries, attackSpeed) {
      const sum = (key) => entries.reduce((total, entry) => total + entry[key], 0);
      return {
        value: sum("value") * attackSpeed.value,
        min: sum("min") * attackSpeed.min,
        max: sum("max") * attackSpeed.max
      };
    }
    function calcWeaponDps(item) {
      const props = item.properties || {};
      const aps = props.attackSpeed;
      if (!Number.isFinite(aps) || aps <= 0) return void 0;
      const stats = sumDamageStats(item);
      const headerElements = parseElementalHeader(props.elementalDamage, item.mods);
      const attackSpeed = sumAttackSpeed(item, aps);
      const quality = item.quality ?? 0;
      const q20 = effectiveQuality(item);
      const hasElemental = ELEMENTS.some((element) => headerElements[element].value > 0 || stats[element].value > 0);
      const physicalAverage = calcPhysicalAverage(props, stats, quality, q20, hasElemental);
      const elements = {};
      let hasElementalDamage = false;
      for (const element of ELEMENTS) {
        const header = headerElements[element];
        const local = stats[element];
        if (header.value <= 0 && local.value <= 0) continue;
        hasElementalDamage = true;
        const value = header.value > 0 ? header.value : local.value;
        elements[element] = local.value > 0 ? { value, min: local.min, max: local.max } : { value, min: value, max: value };
      }
      if (!physicalAverage && !hasElementalDamage) return void 0;
      const pDPS = physicalAverage ? rollDps([physicalAverage], attackSpeed) : void 0;
      const elemental = Object.values(elements);
      const eDPS = hasElementalDamage ? rollDps(elemental, attackSpeed) : void 0;
      const totalDPS = hasElementalDamage ? rollDps([...physicalAverage ? [physicalAverage] : [], ...elemental], attackSpeed) : void 0;
      const damageAverage = (physicalAverage ? physicalAverage.value : 0) + Object.values(elements).reduce((total, entry) => total + entry.value, 0);
      const round = (dps) => dps ? Math.round(dps.value) : void 0;
      return {
        attackSpeed,
        physicalAverage,
        elements,
        pDPS,
        eDPS,
        totalDPS,
        damageAverage,
        display: {
          damage: Math.round(damageAverage),
          pDPS: round(pDPS),
          eDPS: round(eDPS),
          totalDPS: round(totalDPS),
          fireDPS: elements.fire ? Math.round(elements.fire.value * attackSpeed.value) : void 0,
          coldDPS: elements.cold ? Math.round(elements.cold.value * attackSpeed.value) : void 0,
          lightningDPS: elements.lightning ? Math.round(elements.lightning.value * attackSpeed.value) : void 0
        }
      };
    }
    function searchMin(dps, rarity, rangePercent = 2) {
      if (!dps || !Number.isFinite(dps.value)) return void 0;
      const percent = Math.max(0, Math.min(2, rangePercent)) / 100;
      const theoreticalMin = Math.floor(dps.min);
      const requested = rarity === "\u4F20\u5947" ? dps.value - (dps.max - dps.min) * percent : dps.value * (1 - percent);
      return Math.max(theoreticalMin, Math.floor(requested));
    }
    function trunc2(value) {
      return Math.floor((value + Number.EPSILON) * 100) / 100;
    }
    function addDpsFilters(query, item, opts = {}) {
      var _a;
      if (opts.dps === false) return void 0;
      const dps = calcWeaponDps(item);
      if (!dps) return void 0;
      const rangePercent = opts.dpsRangePercent ?? 2;
      const filters = {};
      if (dps.totalDPS) filters.dps = { min: searchMin(dps.totalDPS, item.rarity, rangePercent) };
      if (dps.pDPS) filters.pdps = { min: searchMin(dps.pDPS, item.rarity, rangePercent) };
      if (dps.eDPS) filters.edps = { min: searchMin(dps.eDPS, item.rarity, rangePercent) };
      for (const key of ["dps", "pdps", "edps"]) {
        const requested = opts[`${key}Min`] ?? opts.dpsMin;
        if (filters[key] && requested != null) filters[key].min = Math.floor(requested);
      }
      if (opts.panel !== false) {
        if (dps.damageAverage > 0) filters.damage = { min: trunc2(dps.damageAverage) };
        if (dps.attackSpeed.value > 0) filters.aps = { min: trunc2(dps.attackSpeed.value) };
        const crit = item.properties?.critChance;
        if (Number.isFinite(crit) && crit > 0) filters.crit = { min: trunc2(crit) };
        for (const key of ["damage", "aps", "crit"]) {
          const requested = opts[`${key}Min`];
          if (filters[key] && requested != null) filters[key].min = trunc2(requested);
        }
      }
      const equipment = (_a = query.filters).equipment_filters ?? (_a.equipment_filters = { disabled: false, filters: {} });
      equipment.disabled = false;
      Object.assign(equipment.filters, filters);
      return dps;
    }
    module.exports = { calcWeaponDps, searchMin, addDpsFilters };
  }
});

// ../core/defences.js
var require_defences = __commonJS({
  "../core/defences.js"(exports, module) {
    var { searchMin } = require_weapon_dps();
    var { emptyRoll, addRollMatch, addRolls, effectiveQuality, statTexts } = require_roll_utils();
    var NUM_WITH_RANGE = String.raw`(-?[\d.]+)(?:\s*\((-?[\d.]+)-(-?[\d.]+)\))?`;
    var DEFENCES = {
      armour: {
        property: "armour",
        filter: "ar",
        label: "\u62A4\u7532",
        flat: /^\+?NUM\s*护甲$/
      },
      evasion: {
        property: "evasion",
        filter: "ev",
        label: "\u95EA\u907F",
        flat: /^\+?NUM\s*(?:点)?闪避值$/
      },
      energyShield: {
        property: "energyShield",
        filter: "es",
        label: "\u80FD\u91CF\u62A4\u76FE",
        flat: /^\+?NUM\s*(?:点)?能量护盾(?:上限)?$/
      },
      ward: {
        property: "ward",
        filter: "ward",
        label: "\u7B26\u6587\u7ED3\u754C",
        flat: /^\+?NUM\s*符文(?:结界|壁垒)(?:上限)?$/
      }
    };
    for (const definition of Object.values(DEFENCES)) {
      definition.flat = new RegExp(definition.flat.source.replaceAll("NUM", NUM_WITH_RANGE));
    }
    var HYBRID_INCREASED = [
      { ids: ["explicit.stat_3523867985", "rune.stat_3523867985"], targets: ["armour", "evasion", "energyShield"] },
      { ids: ["explicit.stat_2451402625", "crafted.stat_2451402625"], targets: ["armour", "evasion"] },
      { ids: ["explicit.stat_3321629045", "rune.stat_3321629045"], targets: ["armour", "energyShield"] },
      { ids: ["explicit.stat_1999113824", "rune.stat_1999113824"], targets: ["evasion", "energyShield"] }
    ];
    var LOCAL_INCREASED_IDS = {
      armour: ["explicit.stat_1062208444", "explicit.stat_2866361420"],
      evasion: ["explicit.stat_124859000", "explicit.stat_2106365538"],
      energyShield: ["explicit.stat_4015621042", "explicit.stat_2482852589"]
    };
    function collectRollsById(item, matched) {
      const byId = /* @__PURE__ */ new Map();
      const push = (id, roll) => {
        if (!id || !roll) return;
        if (!byId.has(id)) byId.set(id, []);
        byId.get(id).push({ value: roll.value, min: roll.min ?? roll.value, max: roll.max ?? roll.value });
      };
      if (matched.length) {
        for (const { stat, match } of matched) {
          push(match?.id || stat?.tradeId, stat?.rolls?.[match?.valueRollIndex ?? 0]);
        }
      } else {
        for (const mod of item.mods || []) {
          for (const stat of mod.stats || []) push(stat.tradeId, stat.rolls?.[0]);
        }
      }
      return byId;
    }
    function sumLocalIncreased(byId, ids) {
      const total = emptyRoll();
      const ordered = [...ids].sort((a, b) => Number(byId.has(b)) - Number(byId.has(a)));
      for (const id of ordered) {
        if (!byId.has(id)) continue;
        addRolls(total, byId.get(id));
        break;
      }
      return total;
    }
    function sumHybridIncreased(byId, key) {
      const total = emptyRoll();
      for (const hybrid of HYBRID_INCREASED) {
        if (!hybrid.targets.includes(key)) continue;
        for (const id of hybrid.ids) addRolls(total, byId.get(id) || []);
      }
      return total;
    }
    function constantEntry(filter, label, panel) {
      return { filter, label, panel, value: panel, min: panel, max: panel, display: panel };
    }
    function calcDefences(item, matched = []) {
      const props = item.properties || {};
      const quality = item.quality ?? 0;
      const q20 = effectiveQuality(item);
      const byId = collectRollsById(item, matched);
      const texts = statTexts(item);
      const output = {};
      for (const [key, definition] of Object.entries(DEFENCES)) {
        const panel = props[definition.property];
        if (!Number.isFinite(panel) || panel <= 0) continue;
        const flat = emptyRoll();
        for (const text of texts) {
          const match = text.match(definition.flat);
          if (match) addRollMatch(flat, match);
        }
        const local = sumLocalIncreased(byId, LOCAL_INCREASED_IDS[key] || []);
        const hybrid = sumHybridIncreased(byId, key);
        const increased = emptyRoll();
        addRolls(increased, [local, hybrid]);
        const base = panel / ((1 + quality / 100) * (1 + increased.value / 100)) - flat.value;
        const atQuality = (flatValue, increasedValue) => (base + flatValue) * (1 + increasedValue / 100) * (1 + q20 / 100);
        const value = atQuality(flat.value, increased.value);
        const min = atQuality(flat.min, increased.min);
        const max = atQuality(flat.max, increased.max);
        output[key] = {
          filter: definition.filter,
          label: definition.label,
          panel,
          base,
          quality: q20,
          flat,
          increased,
          value,
          min: Math.min(min, max),
          max: Math.max(min, max),
          display: Math.round(value)
        };
      }
      if (Number.isFinite(props.block) && props.block > 0) output.block = constantEntry("block", "\u683C\u6321", props.block);
      if (Number.isFinite(props.spirit) && props.spirit > 0) output.spirit = constantEntry("spirit", "\u7CBE\u9B42", props.spirit);
      return Object.keys(output).length ? output : void 0;
    }
    function addDefenceFilters(query, item, opts = {}, matched = []) {
      var _a;
      if (opts.defences === false) return void 0;
      const defences = calcDefences(item, matched);
      if (!defences) return void 0;
      const rangePercent = opts.defenceRangePercent ?? opts.dpsRangePercent ?? 2;
      const equipment = (_a = query.filters).equipment_filters ?? (_a.equipment_filters = { disabled: false, filters: {} });
      equipment.disabled = false;
      for (const defence of Object.values(defences)) {
        const override = opts[`${defence.filter}Min`];
        equipment.filters[defence.filter] = {
          min: override != null ? Math.floor(override) : searchMin(defence, item.rarity, rangePercent)
        };
      }
      return defences;
    }
    module.exports = { calcDefences, addDefenceFilters };
  }
});

// ../core/parse-item.js
var require_parse_item = __commonJS({
  "../core/parse-item.js"(exports, module) {
    var { calcWeaponDps } = require_weapon_dps();
    var { calcDefences } = require_defences();
    var MOD_LINE = /^\{\s*(?<special>亵渎的|打造的|已破裂|已工艺)?\s*(?<gen>前缀属性|后缀属性|前缀词缀|后缀词缀|固定词缀|基底属性|传奇属性|瓦尔传奇词缀|腐化强化)\s*(?:"(?<name>[^"]*)"|“(?<nameCN>[^”]*)”)?\s*(?:\(等阶：(?<tier>\d+)\))?\s*(?:\(阶级：(?<rank>\d+)\))?\s*(?:—\s*(?<tags>[^}]*))?\}$/;
    var GRANT_SKILL_LINE = /^获得技能:\s*(.+)$/;
    var NUM_RANGE = /(?<sign>[+-]?)(?<value>\d+(?:\.\d+)?)\s*(?:\((?<min>[+-]?\d+(?:\.\d+)?)\s*[-–—]\s*(?<max>[+-]?\d+(?:\.\d+)?)\))?/g;
    var SECTION_SEP = /^-{4,}$/;
    var TAGGED_PLAIN = /\((rune|implicit|enchant|crafted|fractured|desecrated)\)\s*$/;
    var HEADER_FIELDS = [
      { pattern: /^物品类别:\s*(.+)$/, field: "category", text: true },
      { pattern: /^稀\s*有\s*度:\s*(.+)$/, field: "rarity", text: true },
      { pattern: /^物品等级:\s*(\d+)/, field: "itemLevel" },
      { pattern: /^品质:\s*\+?(\d+)%/, field: "quality" },
      { pattern: /^护甲:\s*(\d+)/, target: "armour" },
      { pattern: /^闪避(?:值)?:\s*(\d+)/, target: "evasion" },
      { pattern: /^能量护盾(?:上限)?:\s*(\d+)/, target: "energyShield" },
      { pattern: /^符文(?:结界|壁垒):\s*(\d+)/, target: "ward" },
      { pattern: /^格挡(?:几率|率)?:\s*([\d.]+)%/, target: "block" },
      { pattern: /^精魂:\s*(\d+)/, target: "spirit" },
      { pattern: /^插槽:\s*(.+)$/, field: "sockets", text: true },
      // 引路石面板字段（map_filters）。字段名以国服 filters 词典官方 text 为准：
      // map_magic_monsters=「怪物效能」、map_rare_monsters=「怪物稀有度」，
      // 旧文本变体（魔法怪物/稀有怪物数量）一并保留。
      { pattern: /^(?:引路石)?等阶:\s*(\d+)/, target: "mapTier" },
      { pattern: /^怪物群(?:大小|规模):\s*\+?([\d.]+)%/, target: "mapPackSize" },
      { pattern: /^(?:怪物效能|魔法怪物(?:数量)?):\s*\+?([\d.]+)%/, target: "mapMagicMonsters" },
      { pattern: /^(?:怪物稀有度|稀有怪物(?:数量)?):\s*\+?([\d.]+)%/, target: "mapRareMonsters" },
      { pattern: /^物品稀有度:\s*\+?([\d.]+)%/, target: "mapIir" },
      { pattern: /^(?:可用)?(?:复活|挑战)次数:\s*(\d+)/, target: "mapRevives" },
      { pattern: /^(?:引路石)?掉落几率:\s*\+?([\d.]+)%/, target: "mapBonus" },
      { pattern: /^金币:\s*\+?([\d.]+)%/, target: "mapGold" },
      { pattern: /^经验:\s*\+?([\d.]+)%/, target: "mapExperience" },
      { pattern: /^暴击率:\s*([\d.]+)%/, target: "critChance" },
      { pattern: /^每秒攻击次数:\s*([\d.]+)/, target: "attackSpeed" },
      { pattern: /^元素伤害:\s*(.+)$/, target: "elementalDamage", text: true }
    ];
    var PHYSICAL_DAMAGE_LINE = /^物理伤害:\s*(\d+)-(\d+)/;
    function detectModType(statLines) {
      const joined = statLines.join("\n");
      if (/\(rune\)\s*$/m.test(joined)) return "Rune";
      if (/\(implicit\)\s*$/m.test(joined)) return "Implicit";
      if (/\(enchant\)\s*$/m.test(joined)) return "Enchant";
      if (/\(crafted\)\s*$/m.test(joined)) return "Crafted";
      if (/\(fractured\)\s*$/m.test(joined)) return "Fractured";
      if (/\(desecrated\)\s*$/m.test(joined)) return "Desecrated";
      return "Explicit";
    }
    function isFlavourText(text) {
      if (/^\{/.test(text)) return false;
      if (/\((rune|implicit|enchant|crafted|fractured|desecrated|augmented)\)/.test(text)) return false;
      if (/^获得技能:/.test(text)) return false;
      if (CORRUPTED_LINE.test(text)) return false;
      if (/^未鉴定/.test(text)) return false;
      if (/^放置到一个天赋树/.test(text)) return false;
      if (/^可在地图装置中使用/.test(text)) return false;
      if (/\d/.test(text)) return false;
      return /[，。]$/.test(text) || /…$/.test(text) || /^[一-龥，。、；：""''（）…\s]+$/.test(text);
    }
    function extractRolls(text) {
      const rolls = [];
      for (const m of text.matchAll(NUM_RANGE)) {
        rolls.push({
          value: Number(`${m.groups.sign || ""}${m.groups.value}`),
          min: m.groups.min != null ? Number(m.groups.min) : void 0,
          max: m.groups.max != null ? Number(m.groups.max) : void 0
        });
      }
      return rolls;
    }
    function toTemplate(text) {
      return text.replace(/\+?\s*(?=\d)/g, "").replace(NUM_RANGE, "#").replace(/\s+/g, " ").trim();
    }
    function goodness(roll, better = "positive") {
      if (roll.min == null || roll.max == null || roll.max === roll.min) return void 0;
      let g = (roll.value - roll.min) / (roll.max - roll.min);
      if (better === "negative") g = 1 - g;
      return Math.round(g * 1e3) / 1e3;
    }
    var CORRUPTED_LINE = /^(?:被腐化|双重腐化)/;
    function parseHeader(lines, item) {
      for (const line of lines) {
        if (CORRUPTED_LINE.test(line)) {
          item.corrupted = true;
          continue;
        }
        if (/^未鉴定/.test(line)) {
          item.unidentified = true;
          continue;
        }
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
    function parseNames(lines, item) {
      const rarityIdx = lines.findIndex((l) => /^稀\s*有\s*度:/.test(l));
      if (rarityIdx < 0) return;
      const nameLines = [];
      for (let i = rarityIdx + 1; i < lines.length; i++) {
        if (SECTION_SEP.test(lines[i])) break;
        if (/^[^:：]+[:：]/.test(lines[i])) continue;
        if (lines[i].trim()) nameLines.push(lines[i].trim());
      }
      if (nameLines.length >= 2) {
        item.name = nameLines[0];
        item.baseName = nameLines[nameLines.length - 1];
      } else if (nameLines.length === 1) {
        item.baseName = nameLines[0];
      }
    }
    var WAYSTONE_BASE = /^引路石\s*[（(]\s*(?:等阶\s*)?(\d+)\s*(?:阶)?\s*[)）]$/;
    function normalizeWaystoneBase(item) {
      if (item.category !== "\u5F15\u8DEF\u77F3" || !item.baseName) return;
      const m = item.baseName.match(WAYSTONE_BASE);
      if (!m) return;
      if (item.properties.mapTier == null) item.properties.mapTier = Number(m[1]);
      item.baseName = "\u5F15\u8DEF\u77F3";
    }
    var SPECIAL_MOD_TYPE = { \u4EB5\u6E0E\u7684: "Desecrated", \u6253\u9020\u7684: "Crafted", \u5DF2\u7834\u88C2: "Fractured" };
    var GENERATION = {
      \u524D\u7F00\u5C5E\u6027: "prefix",
      \u524D\u7F00\u8BCD\u7F00: "prefix",
      \u540E\u7F00\u5C5E\u6027: "suffix",
      \u540E\u7F00\u8BCD\u7F00: "suffix"
    };
    function modFromInfoLine(groups) {
      return {
        // 腐化强化（双重腐化珠宝的附加属性）按 Explicit 处理：
        // 市集在售装备按外延词缀索引，与亵渎/打造同策略。
        type: SPECIAL_MOD_TYPE[groups.special] || (groups.gen === "\u57FA\u5E95\u5C5E\u6027" ? "Implicit" : "Explicit"),
        generation: GENERATION[groups.gen] || "implicit",
        name: groups.name || groups.nameCN || void 0,
        tier: groups.tier ? Number(groups.tier) : void 0,
        rank: groups.rank ? Number(groups.rank) : void 0,
        tags: groups.tags ? groups.tags.split(",").map((s) => s.trim()).filter(Boolean) : [],
        statLines: []
      };
    }
    function pushGrantedSkill(item, skillName, rawLine) {
      item.grantedSkills ?? (item.grantedSkills = []);
      item.grantedSkills.push(skillName);
      item.mods.push({
        type: "Skill",
        generation: void 0,
        name: skillName,
        tier: void 0,
        tags: [],
        statLines: [rawLine]
      });
    }
    function parseMods(lines, item) {
      let modRegionStarted = false;
      let current = null;
      const pendingPlain = [];
      const flush = () => {
        if (current) {
          item.mods.push(current);
          current = null;
        }
      };
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (SECTION_SEP.test(trimmed)) {
          flush();
          continue;
        }
        const info = trimmed.match(MOD_LINE);
        const isTaggedPlain = TAGGED_PLAIN.test(trimmed);
        const skill = trimmed.match(GRANT_SKILL_LINE);
        if (!modRegionStarted) {
          if (!info && !isTaggedPlain && !skill) continue;
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
        if (/^引路石掉落/.test(trimmed)) continue;
        if (/^可在地图装置中使用/.test(trimmed)) continue;
        if (/^放置到一个天赋树/.test(trimmed)) continue;
        if (CORRUPTED_LINE.test(trimmed)) {
          item.corrupted = true;
          continue;
        }
        if (/^未鉴定/.test(trimmed)) {
          item.unidentified = true;
          continue;
        }
        if (current && current.statLines.length > 0 && isFlavourText(trimmed)) {
          flush();
          continue;
        }
        if (!current && item.mods.length > 0 && isFlavourText(trimmed)) continue;
        if (current) current.statLines.push(trimmed);
        else pendingPlain.push(trimmed);
      }
      flush();
      for (const pl of pendingPlain) {
        item.mods.push({
          type: detectModType([pl]),
          generation: void 0,
          name: void 0,
          tier: void 0,
          tags: [],
          statLines: [pl]
        });
      }
    }
    function parseItemText2(raw) {
      let text = raw.replace(/\r\n?/g, "\n").trim();
      const firstAnchor = text.indexOf("\u7269\u54C1\u7C7B\u522B:");
      if (firstAnchor >= 0) {
        const secondAnchor = text.indexOf("\u7269\u54C1\u7C7B\u522B:", firstAnchor + 1);
        if (secondAnchor >= 0) text = text.slice(0, secondAnchor).trim();
      }
      const lines = text.split("\n").map((l) => l.trimEnd());
      const item = {
        category: void 0,
        rarity: void 0,
        name: void 0,
        baseName: void 0,
        quality: void 0,
        itemLevel: void 0,
        properties: {},
        requirements: {},
        sockets: void 0,
        mods: [],
        unidentified: false
      };
      parseHeader(lines, item);
      parseNames(lines, item);
      normalizeWaystoneBase(item);
      parseMods(lines, item);
      for (const mod of item.mods) {
        mod.stats = mod.statLines.map((sl) => {
          const rolls = extractRolls(sl);
          return {
            text: sl,
            template: toTemplate(sl),
            rolls,
            goodness: rolls.length ? goodness(rolls[0]) : void 0
          };
        });
        delete mod.statLines;
      }
      const weaponDps = calcWeaponDps(item);
      const defences = calcDefences(item);
      if (weaponDps || defences) item.derived = { weaponDps, defences };
      return item;
    }
    module.exports = { parseItemText: parseItemText2 };
  }
});

// ../core/match-stats.js
var require_match_stats = __commonJS({
  "../core/match-stats.js"(exports, module) {
    var TYPE_GROUP_PRIORITY = {
      Desecrated: ["explicit", "desecrated"],
      Crafted: ["explicit", "crafted"],
      Fractured: ["explicit", "fractured"],
      Rune: ["rune", "explicit"],
      Enchant: ["enchant", "explicit"],
      Implicit: ["implicit", "explicit"],
      Skill: ["skill", "explicit"],
      Explicit: ["explicit"]
    };
    var TYPE_SUFFIX = /\s*\((rune|implicit|enchant|crafted|fractured|desecrated|augmented)\)\s*$/i;
    var SIGNED_RANGE = /\+?-?\d+(?:\.\d+)?\s*(?:\([+-]?\d+(?:\.\d+)?\s*[-–—]\s*[+-]?\d+(?:\.\d+)?\))?/g;
    function normalizeTemplate(text) {
      return text.replace(TYPE_SUFFIX, "").replace(SIGNED_RANGE, "#").replace(/\s+/g, "").trim();
    }
    function dictValueRollIndex(text) {
      const index = text.indexOf("#");
      if (index < 0) return void 0;
      return (text.slice(0, index).match(/\d+(?:\.\d+)?/g) || []).length;
    }
    function normalizeDictText(text) {
      return text.replace(/\s+/g, "").replace(/\+#/g, "#").trim();
    }
    function compileDictionary(dict) {
      const byGroup = {};
      for (const group of dict.result) {
        const map = /* @__PURE__ */ new Map();
        for (const entry of group.entries) {
          const key = normalizeDictText(entry.text);
          if (!map.has(key)) map.set(key, []);
          map.get(key).push(entry);
          const patternKey = normalizeTemplate(entry.text).replace(/\+#/g, "#");
          if (patternKey === key || !/\d/.test(entry.text)) continue;
          if (!map.has("__patterns__")) map.set("__patterns__", /* @__PURE__ */ new Map());
          const patterns = map.get("__patterns__");
          if (!patterns.has(patternKey)) patterns.set(patternKey, []);
          patterns.get(patternKey).push(entry);
        }
        byGroup[group.id] = map;
      }
      return byGroup;
    }
    function serializeCompiled(compiled) {
      const out = {};
      for (const [groupId, map] of Object.entries(compiled)) {
        const tuples = [];
        for (const [key, value] of map.entries()) {
          if (key === "__patterns__") {
            tuples.push([key, [...value.entries()].map(([pk, pv]) => [pk, pv])]);
          } else {
            tuples.push([key, value]);
          }
        }
        out[groupId] = tuples;
      }
      return out;
    }
    function deserializeCompiled(serialized) {
      const byGroup = {};
      for (const [groupId, tuples] of Object.entries(serialized)) {
        const map = /* @__PURE__ */ new Map();
        for (const [key, value] of tuples) {
          if (key === "__patterns__") {
            map.set(key, new Map(value));
          } else {
            map.set(key, value);
          }
        }
        byGroup[groupId] = map;
      }
      return byGroup;
    }
    function matchStatLine(stat, groups, compiled) {
      const key = normalizeTemplate(stat.text);
      for (const gid of groups) {
        const map = compiled[gid];
        if (!map) continue;
        const hits = map.get(key) || map.get("__patterns__")?.get(key);
        if (hits && hits.length) {
          const exact = hits.find((h) => h.text === stat.template);
          const chosen = exact || hits[0];
          const valueIndex = dictValueRollIndex(chosen.text);
          return {
            id: chosen.id,
            text: chosen.text,
            group: gid,
            confidence: exact ? "exact" : "normalized",
            ambiguous: hits.length > 1,
            tradeInvert: chosen.id === "explicit.stat_2284588585" || void 0,
            valueRollIndex: valueIndex
          };
        }
      }
      return null;
    }
    function matchWholeMod(mod, groups, compiled) {
      const stats = mod.stats || [];
      if (stats.length < 2) return null;
      const joined = stats.map((s) => s.text).join("\n");
      const key = normalizeTemplate(joined);
      for (const gid of groups) {
        const map = compiled[gid];
        if (!map) continue;
        const hits = map.get(key);
        if (hits && hits.length) {
          const chosen = hits[0];
          const valueIndex = dictValueRollIndex(chosen.text);
          const allRolls = stats.flatMap((s) => s.rolls || []);
          const stat = {
            text: joined,
            template: stats.map((s) => s.template).join(" "),
            rolls: allRolls
          };
          return {
            stat,
            match: {
              id: chosen.id,
              text: chosen.text,
              group: gid,
              confidence: "normalized",
              ambiguous: hits.length > 1,
              valueRollIndex: valueIndex
            }
          };
        }
      }
      return null;
    }
    function matchMod(mod, compiled) {
      const groups = TYPE_GROUP_PRIORITY[mod.type] || ["explicit"];
      const whole = matchWholeMod(mod, groups, compiled);
      if (whole) {
        if (mod.stats?.[0]) mod.stats[0].tradeId = whole.match.id;
        return [whole];
      }
      return (mod.stats || []).map((rawStat) => {
        const tags = Array.isArray(mod.tags) ? mod.tags : (mod.tags || "").split(/[,，]/).map((tag) => tag.trim());
        const stat = tags.includes("\u62A4\u7532") && /^护甲提高\s/.test(rawStat.text) ? { ...rawStat, text: `${rawStat.text} (\u533A\u57DF)`, template: `${rawStat.template} (\u533A\u57DF)` } : rawStat;
        const match = matchStatLine(stat, groups, compiled);
        if (match) rawStat.tradeId = match.id;
        return { stat, match };
      });
    }
    function matchItem2(parsedItem, compiled) {
      const out = [];
      for (const mod of parsedItem.mods) {
        for (const { stat, match } of matchMod(mod, compiled)) {
          out.push({ mod, stat, match });
        }
      }
      return out;
    }
    module.exports = { normalizeTemplate, compileDictionary, serializeCompiled, deserializeCompiled, matchMod, matchItem: matchItem2 };
  }
});

// ../core/map-mods.js
var require_map_mods = __commonJS({
  "../core/map-mods.js"(exports, module) {
    var MAP_FIELDS = [
      { property: "mapTier", filter: "map_tier", label: "\u5F15\u8DEF\u77F3\u7B49\u9636", integer: true },
      { property: "mapPackSize", filter: "map_packsize", label: "\u602A\u7269\u7FA4\u89C4\u6A21", integer: false },
      { property: "mapMagicMonsters", filter: "map_magic_monsters", label: "\u602A\u7269\u6548\u80FD", integer: false },
      { property: "mapRareMonsters", filter: "map_rare_monsters", label: "\u602A\u7269\u7A00\u6709\u5EA6", integer: false },
      { property: "mapIir", filter: "map_iir", label: "\u7269\u54C1\u7A00\u6709\u5EA6", integer: false },
      { property: "mapRevives", filter: "map_revives", label: "\u53EF\u7528\u590D\u6D3B\u6B21\u6570", integer: true },
      { property: "mapBonus", filter: "map_bonus", label: "\u5F15\u8DEF\u77F3\u6389\u843D\u51E0\u7387", integer: false },
      { property: "mapGold", filter: "map_gold", label: "\u91D1\u5E01", integer: false },
      { property: "mapExperience", filter: "map_experience", label: "\u7ECF\u9A8C", integer: false }
    ];
    var MOD_TO_FIELD = [
      { property: "mapIir", pattern: /(?:区域内发现物品的稀有度|物品稀有度)(?:提高|增加)\s*\+?([\d.]+)/ },
      { property: "mapPackSize", pattern: /怪物群(?:规模|大小)(?:提高|增加)\s*\+?([\d.]+)/ },
      { property: "mapMagicMonsters", pattern: /(?:怪物效能|魔法怪物(?:数量)?)(?:提高|增加)\s*\+?([\d.]+)/ },
      { property: "mapRareMonsters", pattern: /(?:怪物稀有度|稀有怪物(?:数量)?)(?:提高|增加)\s*\+?([\d.]+)/ },
      { property: "mapBonus", pattern: /引路石掉落几率(?:提高|增加)\s*\+?([\d.]+)/ },
      { property: "mapGold", pattern: /金币(?:提高|增加)\s*\+?([\d.]+)/ },
      { property: "mapExperience", pattern: /经验(?:提高|增加)\s*\+?([\d.]+)/ }
    ];
    function calcMapMods(item) {
      const props = item.properties || {};
      const output = {};
      for (const def of MAP_FIELDS) {
        const value = props[def.property];
        if (!Number.isFinite(value)) continue;
        if (value <= 0 && def.property !== "mapRevives") continue;
        output[def.property] = {
          filter: def.filter,
          label: def.label,
          integer: def.integer,
          panel: value,
          value,
          sources: ["panel"]
        };
      }
      for (const mod of item.mods || []) {
        const lines = (mod.statLines || []).concat((mod.stats || []).map((s) => s.text || ""));
        for (const line of lines) {
          for (const rule of MOD_TO_FIELD) {
            const m = line.match(rule.pattern);
            if (!m) continue;
            const value = Number(m[1]);
            if (!Number.isFinite(value)) continue;
            const def = MAP_FIELDS.find((f) => f.property === rule.property);
            if (!def) continue;
            if (output[rule.property]?.sources.includes("panel")) continue;
            if (!output[rule.property]) {
              output[rule.property] = {
                filter: def.filter,
                label: def.label,
                integer: def.integer,
                panel: 0,
                value: 0,
                sources: []
              };
            }
            output[rule.property].value += value;
            if (!output[rule.property].sources.includes("mod")) {
              output[rule.property].sources.push("mod");
            }
          }
        }
      }
      return Object.keys(output).length ? output : void 0;
    }
    function addMapFilters(query, item, opts = {}) {
      var _a;
      if (opts.mapFilters === false) return void 0;
      if (item.category !== "\u5F15\u8DEF\u77F3") return void 0;
      const mapMods = calcMapMods(item);
      if (!mapMods) return void 0;
      const rangePercent = opts.mapRangePercent ?? opts.dpsRangePercent ?? 2;
      const percent = Math.max(0, Math.min(100, rangePercent)) / 100;
      const mapFilters = (_a = query.filters).map_filters ?? (_a.map_filters = { disabled: false, filters: {} });
      mapFilters.disabled = false;
      for (const def of MAP_FIELDS) {
        const entry = mapMods[def.property];
        if (!entry) continue;
        const override = opts[`${def.filter}Min`];
        const value = override != null ? override : entry.value;
        const min = override != null || def.integer ? Math.max(0, Math.floor(value)) : Math.max(0, Math.floor(value * (1 - percent)));
        mapFilters.filters[def.filter] = { min };
      }
      return mapMods;
    }
    module.exports = { calcMapMods, addMapFilters, MAP_FIELDS };
  }
});

// ../core/pseudo.js
var require_pseudo = __commonJS({
  "../core/pseudo.js"(exports, module) {
    var RESISTANCE_STATS = {
      stat_3372524247: { elements: ["fire"] },
      // 火焰抗性 #%
      stat_4220027924: { elements: ["cold"] },
      // 冰霜抗性 #%
      stat_1671376347: { elements: ["lightning"] },
      // 闪电抗性 #%
      stat_2923486259: { elements: [], chaos: true },
      // 混沌抗性 #%
      stat_2901986750: { elements: ["fire", "cold", "lightning"] },
      // 所有元素抗性 #%
      stat_3441501978: { elements: ["fire", "lightning"] },
      // #% 火焰与闪电抗性
      stat_2915988346: { elements: ["fire", "cold"] },
      // #% 火焰与冰霜抗性
      stat_4277795662: { elements: ["cold", "lightning"] },
      // #% 冰霜与闪电抗性
      stat_378817135: { elements: ["fire"], chaos: true },
      // #% 火焰与混沌抗性
      stat_3393628375: { elements: ["cold"], chaos: true },
      // #% 冰霜与混沌抗性
      stat_3465022881: { elements: ["lightning"], chaos: true }
      // #% 闪电与混沌抗性
    };
    var ATTRIBUTE_STATS = {
      stat_4080418644: ["strength"],
      // # 力量
      stat_3261801346: ["dexterity"],
      // # 敏捷
      stat_328541901: ["intelligence"],
      // # 智慧
      stat_1379411836: ["strength", "dexterity", "intelligence"],
      // # 全属性
      stat_1535626285: ["strength", "intelligence"],
      // # 力量和智慧
      stat_538848803: ["strength", "dexterity"],
      // # 力量和敏捷
      stat_2300185227: ["dexterity", "intelligence"]
      // # 敏捷和智慧
    };
    var LIFE_STAT = "stat_3299347043";
    var MANA_STAT = "stat_1050105434";
    var MOVEMENT_STAT = "stat_2250533757";
    var TABLET_USES_TEMPLATE = /剩余次数：#/;
    var ATTRIBUTE_TO_LIFE = 2;
    var ATTRIBUTE_TO_MANA = 2;
    var PSEUDO_TEXT = {
      "pseudo.pseudo_total_elemental_resistance": "\u603B\u5143\u7D20\u6297\u6027",
      "pseudo.pseudo_total_resistance": "\u603B\u6297\u6027\uFF08\u5168\u6297+\u6700\u4F4E\u5355\u6297\uFF09",
      "pseudo.pseudo_total_fire_resistance": "\u603B\u706B\u7130\u6297\u6027",
      "pseudo.pseudo_total_cold_resistance": "\u603B\u51B0\u971C\u6297\u6027",
      "pseudo.pseudo_total_lightning_resistance": "\u603B\u95EA\u7535\u6297\u6027",
      "pseudo.pseudo_total_chaos_resistance": "\u603B\u6DF7\u6C8C\u6297\u6027",
      "pseudo.pseudo_total_strength": "\u603B\u529B\u91CF",
      "pseudo.pseudo_total_dexterity": "\u603B\u654F\u6377",
      "pseudo.pseudo_total_intelligence": "\u603B\u667A\u6167",
      "pseudo.pseudo_total_all_attributes": "\u5168\u5C5E\u6027\u5408\u8BA1",
      "pseudo.pseudo_total_attributes": "\u5C5E\u6027\u603B\u548C",
      "pseudo.pseudo_total_life": "\u603B\u751F\u547D\u503C",
      "pseudo.pseudo_total_mana": "\u603B\u9B54\u529B\u503C",
      "pseudo.pseudo_increased_movement_speed": "\u79FB\u52A8\u901F\u5EA6\u5408\u8BA1",
      "pseudo.pseudo_number_of_uses_remaining": "\u77F3\u677F\u5269\u4F59\u4F7F\u7528\u6B21\u6570"
    };
    function ruleKey(id) {
      if (typeof id !== "string") return "";
      const dot = id.indexOf(".");
      return dot >= 0 ? id.slice(dot + 1) : id;
    }
    function resolveValue(value) {
      if (typeof value === "number") return value;
      if (!value || typeof value !== "object") return null;
      if (typeof value.min === "number") return value.min;
      if (typeof value.max === "number") return value.max;
      return null;
    }
    function collectRows(candidates, ruleOf) {
      const rows = [];
      for (const candidate of candidates) {
        const rule = ruleOf(candidate);
        if (rule == null) continue;
        const value = resolveValue(candidate.value);
        if (value === null) continue;
        rows.push({ candidate, rule, value });
      }
      return rows;
    }
    function makeSuggestion(id, sources, enabled, value) {
      return {
        id,
        text: PSEUDO_TEXT[id] || id,
        value: { min: value },
        enabled,
        sources
      };
    }
    function buildResistanceSuggestions(candidates) {
      const rows = collectRows(candidates, (c) => RESISTANCE_STATS[ruleKey(c.id)]);
      if (rows.length === 0) return [];
      const elements = { fire: 0, cold: 0, lightning: 0 };
      for (const row of rows) {
        for (const element of row.rule.elements) elements[element] += row.value;
      }
      const elementalRows = rows.filter((row) => row.rule.elements.length > 0);
      const suggestions = [];
      const elemental = elementalRows.reduce((sum, row) => sum + row.value * row.rule.elements.length, 0);
      if (elemental > 0) {
        suggestions.push(makeSuggestion(
          "pseudo.pseudo_total_elemental_resistance",
          elementalRows.map((row) => row.candidate),
          true,
          elemental
        ));
      }
      const universal = rows.filter((row) => row.rule.elements.length === 3 && row.rule.chaos === true);
      if (universal.length > 0) {
        const universalTotal = universal.reduce((sum, row) => sum + row.value, 0);
        suggestions.push(makeSuggestion(
          "pseudo.pseudo_total_resistance",
          rows.map((row) => row.candidate),
          false,
          universalTotal + Math.min(elements.fire, elements.cold, elements.lightning)
        ));
      }
      const singles = [];
      for (const [element, id] of [
        ["fire", "pseudo.pseudo_total_fire_resistance"],
        ["cold", "pseudo.pseudo_total_cold_resistance"],
        ["lightning", "pseudo.pseudo_total_lightning_resistance"]
      ]) {
        if (elements[element] <= 0) continue;
        const elementRows = rows.filter((row) => row.rule.elements.includes(element));
        singles.push(makeSuggestion(id, elementRows.map((row) => row.candidate), false, elements[element]));
      }
      const chaosRows = rows.filter((row) => row.rule.chaos === true);
      const chaos = chaosRows.reduce((sum, row) => sum + row.value, 0);
      if (chaos > 0) {
        suggestions.push(makeSuggestion(
          "pseudo.pseudo_total_chaos_resistance",
          chaosRows.map((row) => row.candidate),
          false,
          chaos
        ));
      }
      if (singles.length > 0) {
        const ordered = [...singles].sort((a, b) => b.value.min - a.value.min);
        const keep = ordered.length === 1 ? ordered[0] : ordered[0].value.min !== ordered[1].value.min ? ordered[0] : null;
        if (keep) suggestions.push(keep);
      }
      return suggestions;
    }
    function buildAttributeSuggestions(candidates) {
      const rows = collectRows(candidates, (c) => ATTRIBUTE_STATS[ruleKey(c.id)]);
      if (rows.length === 0) return [];
      const totals = { strength: 0, dexterity: 0, intelligence: 0 };
      for (const row of rows) {
        for (const attribute of row.rule) totals[attribute] += row.value;
      }
      const suggestions = [];
      for (const [attribute, id] of [
        ["strength", "pseudo.pseudo_total_strength"],
        ["dexterity", "pseudo.pseudo_total_dexterity"],
        ["intelligence", "pseudo.pseudo_total_intelligence"]
      ]) {
        if (totals[attribute] <= 0) continue;
        const attributeRows = rows.filter((row) => row.rule.includes(attribute));
        suggestions.push(makeSuggestion(
          id,
          attributeRows.map((row) => row.candidate),
          true,
          totals[attribute]
        ));
      }
      const universalRows = rows.filter((row) => row.rule.length === 3);
      const universal = universalRows.reduce((sum, row) => sum + row.value, 0);
      if (universal > 0) {
        suggestions.push(makeSuggestion(
          "pseudo.pseudo_total_all_attributes",
          universalRows.map((row) => row.candidate),
          false,
          universal
        ));
      }
      if (rows.length >= 2) {
        suggestions.push(makeSuggestion(
          "pseudo.pseudo_total_attributes",
          rows.map((row) => row.candidate),
          false,
          rows.reduce((sum, row) => sum + row.value, 0)
        ));
      }
      return suggestions;
    }
    function buildLifeManaSuggestions(candidates) {
      const rows = collectRows(candidates, (c) => {
        const key = ruleKey(c.id);
        return key === LIFE_STAT || key === MANA_STAT ? key : null;
      });
      if (rows.length === 0) return [];
      const suggestions = [];
      for (const [directKey, attribute, id, rate, enabled] of [
        [LIFE_STAT, "strength", "pseudo.pseudo_total_life", ATTRIBUTE_TO_LIFE, true],
        [MANA_STAT, "intelligence", "pseudo.pseudo_total_mana", ATTRIBUTE_TO_MANA, false]
      ]) {
        const direct = rows.filter((row) => row.rule === directKey);
        if (direct.length === 0) continue;
        const directTotal = direct.reduce((sum, row) => sum + row.value, 0);
        const attributeRows = collectRows(candidates, (c) => {
          const attributes = ATTRIBUTE_STATS[ruleKey(c.id)];
          return attributes && attributes.includes(attribute) ? attributes : null;
        });
        const attributeTotal = attributeRows.reduce((sum, row) => sum + row.value, 0);
        suggestions.push(makeSuggestion(
          id,
          [...direct.map((row) => row.candidate), ...attributeRows.map((row) => row.candidate)],
          enabled,
          directTotal + attributeTotal * rate
        ));
      }
      return suggestions;
    }
    function buildMovementSuggestions(candidates) {
      const rows = collectRows(candidates, (c) => ruleKey(c.id) === MOVEMENT_STAT || null);
      if (rows.length === 0) return [];
      const sources = rows.map((row) => row.candidate);
      const implicitOnly = sources.length === 1 && /^implicit\./i.test(sources[0].id);
      return [makeSuggestion(
        "pseudo.pseudo_increased_movement_speed",
        sources,
        !implicitOnly,
        rows.reduce((sum, row) => sum + row.value, 0)
      )];
    }
    function buildTabletSuggestions(candidates) {
      const sources = candidates.filter((candidate) => typeof candidate.template === "string" && TABLET_USES_TEMPLATE.test(candidate.template) && resolveValue(candidate.value) !== null);
      if (sources.length === 0) return [];
      return [makeSuggestion(
        "pseudo.pseudo_number_of_uses_remaining",
        sources,
        true,
        sources.reduce((sum, candidate) => sum + resolveValue(candidate.value), 0)
      )];
    }
    function buildPseudoFilters(candidates) {
      if (!Array.isArray(candidates) || candidates.length === 0) return [];
      const existing = new Set(candidates.map((candidate) => candidate.id));
      const usable = candidates.filter((candidate) => !/^pseudo\./i.test(candidate.id || ""));
      if (usable.length === 0) return [];
      return [
        ...buildResistanceSuggestions(usable),
        ...buildAttributeSuggestions(usable),
        ...buildLifeManaSuggestions(usable),
        ...buildMovementSuggestions(usable),
        ...buildTabletSuggestions(usable)
      ].filter((suggestion) => !existing.has(suggestion.id));
    }
    module.exports = {
      buildPseudoFilters,
      PSEUDO_TEXT,
      RESISTANCE_STATS,
      ATTRIBUTE_STATS,
      ruleKey,
      resolveValue
    };
  }
});

// ../core/query.js
var require_query = __commonJS({
  "../core/query.js"(exports, module) {
    var { addDpsFilters } = require_weapon_dps();
    var { addDefenceFilters } = require_defences();
    var { addMapFilters } = require_map_mods();
    var { buildPseudoFilters } = require_pseudo();
    var CATEGORY_BY_ITEM_CLASS = {
      "\u722A": "weapon.claw",
      "\u5315\u9996": "weapon.dagger",
      "\u5355\u624B\u5251": "weapon.onesword",
      "\u5355\u624B\u65A7": "weapon.oneaxe",
      "\u5355\u624B\u9524": "weapon.onemace",
      "\u6218\u77DB": "weapon.spear",
      "\u77DB": "weapon.spear",
      "\u8FDE\u67B7": "weapon.flail",
      "\u94FE\u67B7": "weapon.flail",
      "\u53CC\u624B\u5251": "weapon.twosword",
      "\u53CC\u624B\u65A7": "weapon.twoaxe",
      "\u53CC\u624B\u9524": "weapon.twomace",
      "\u8282\u6756": "weapon.warstaff",
      "\u6218\u6756": "weapon.warstaff",
      "\u9B54\u7B26": "weapon.talisman",
      "\u5F13": "weapon.bow",
      "\u6218\u5F29": "weapon.crossbow",
      "\u5F29": "weapon.crossbow",
      "\u6CD5\u6756": "weapon.wand",
      "\u77ED\u6756": "weapon.sceptre",
      "\u6743\u6756": "weapon.sceptre",
      "\u957F\u6756": "weapon.staff",
      "\u9C7C\u7AFF": "weapon.rod",
      "\u5934\u76D4": "armour.helmet",
      "\u80F8\u7532": "armour.chest",
      "\u62A4\u7532": "armour.chest",
      "\u624B\u5957": "armour.gloves",
      "\u978B\u5B50": "armour.boots",
      "\u9774": "armour.boots",
      "\u7BAD\u888B": "armour.quiver",
      "\u76FE": "armour.shield",
      "\u76FE\u724C": "armour.shield",
      "\u6CD5\u5668": "armour.focus",
      "\u8F7B\u76FE": "armour.buckler",
      "\u9879\u94FE": "accessory.amulet",
      "\u8170\u5E26": "accessory.belt",
      "\u6212\u6307": "accessory.ring",
      "\u73E0\u5B9D": "jewel",
      // 国服顶层 option「任何珠宝」，无子类
      "\u751F\u547D\u836F\u5242": "flask.life",
      "\u9B54\u529B\u836F\u5242": "flask.mana",
      "\u5492\u7B26": "flask.charm",
      "\u5F15\u8DEF\u77F3": "map.waystone",
      "\u65E5\u5FD7": "map.logbook",
      "\u77F3\u677F": "map.tablet",
      "\u9884\u5146": "currency.omen",
      "\u7B26\u6587": "currency.rune",
      "\u7075\u6838": "currency.soulcore"
    };
    var BASE_CATEGORY_HINTS = [
      { test: /战矛|矛/, option: "weapon.spear" },
      { test: /钉头锤|巨锤|锤/, option: "weapon.onemace" },
      { test: /战杖/, option: "weapon.warstaff" },
      { test: /弩/, option: "weapon.crossbow" },
      { test: /链枷/, option: "weapon.flail" },
      { test: /弓/, option: "weapon.bow" },
      { test: /法杖|短杖/, option: "weapon.wand" },
      { test: /斧/, option: "weapon.oneaxe" },
      { test: /剑/, option: "weapon.onesword" }
    ];
    function guessCategory(parsedItem) {
      const cat = (parsedItem.category || "").trim();
      if (CATEGORY_BY_ITEM_CLASS[cat]) return CATEGORY_BY_ITEM_CLASS[cat];
      const base = parsedItem.baseName || "";
      for (const hint of BASE_CATEGORY_HINTS) {
        if (hint.test.test(base) || hint.test.test(cat)) return hint.option;
      }
      return void 0;
    }
    function rollValue(stat, match) {
      const r = stat.rolls?.[match.valueRollIndex ?? 0];
      if (!r) return void 0;
      if (match.tradeInvert) return r.max != null ? { max: r.max } : { max: r.value };
      return { min: r.min != null ? r.min : r.value };
    }
    var RARITY_OPTION = { "\u7A00\u6709": "rare", "\u4F20\u5947": "unique", "\u9B54\u6CD5": "magic", "\u666E\u901A": "normal" };
    function addSocketFilters(query, item, opts = {}) {
      var _a;
      if (opts.sockets === false) return void 0;
      const raw = item.sockets;
      if (typeof raw !== "string" || !raw.trim()) return void 0;
      const count = raw.trim().split(/\s+/).filter(Boolean).length;
      if (!count) return void 0;
      const equipment = (_a = query.filters).equipment_filters ?? (_a.equipment_filters = { disabled: false, filters: {} });
      equipment.disabled = false;
      const override = opts.socketsMin;
      equipment.filters.rune_sockets = { min: override != null ? Math.floor(override) : count };
      return count;
    }
    function buildQuery2(parsedItem, matched, opts = {}) {
      var _a, _b, _c;
      const {
        tierMax = 2,
        includeUntiered = false,
        league = "\u8054\u8D5B",
        pseudoEnabled = true,
        pseudoRangePercent = 0
      } = opts;
      const filters = [];
      const candidates = [];
      const seen = /* @__PURE__ */ new Set();
      for (const { mod, stat, match } of matched) {
        if (!match || !stat) continue;
        const value = rollValue(stat, match);
        const dedupKey = `${match.id}:${JSON.stringify(value) || ""}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);
        let disabled;
        if (parsedItem.category === "\u5F15\u8DEF\u77F3") {
          disabled = true;
        } else if (parsedItem.rarity === "\u4F20\u5947") {
          disabled = mod.type === "Rune" || mod.tier == null && mod.type !== "Explicit" && !includeUntiered;
        } else if (mod.tier != null) {
          disabled = mod.tier > tierMax;
        } else {
          disabled = !includeUntiered;
        }
        const filter = { id: match.id };
        if (value) filter.value = value;
        if (disabled) filter.disabled = true;
        filters.push(filter);
        candidates.push({
          id: match.id,
          filter,
          value,
          template: match.text,
          type: (match.group || mod.type || "").toLowerCase()
        });
      }
      const query = {
        status: { option: "any" },
        stats: [{ type: "and", filters }],
        filters: {}
      };
      const pseudoResult = pseudoEnabled && parsedItem.category !== "\u5F15\u8DEF\u77F3" ? applyPseudoMerge(query, candidates, { pseudoRangePercent }) : { suggestions: [], applied: [] };
      if (parsedItem.rarity === "\u4F20\u5947" && parsedItem.name) {
        query.name = parsedItem.name;
        if (parsedItem.baseName) query.type = parsedItem.baseName;
      } else if (parsedItem.baseName) {
        query.type = parsedItem.baseName;
      }
      const category = guessCategory(parsedItem);
      if (category) {
        query.filters.type_filters = { filters: { category: { option: category } } };
      }
      const rarityOpt = RARITY_OPTION[parsedItem.rarity];
      if (rarityOpt) {
        (_a = query.filters).type_filters ?? (_a.type_filters = { filters: {} });
        query.filters.type_filters.filters.rarity = { option: rarityOpt };
      }
      if (parsedItem.itemLevel != null && parsedItem.rarity !== "\u4F20\u5947") {
        (_b = query.filters).type_filters ?? (_b.type_filters = { filters: {} });
        query.filters.type_filters.filters.ilvl = { min: parsedItem.itemLevel };
      }
      if (parsedItem.quality != null && parsedItem.quality > 20 && opts.quality !== false) {
        (_c = query.filters).type_filters ?? (_c.type_filters = { filters: {} });
        const override = opts.qualityMin;
        query.filters.type_filters.filters.quality = {
          min: override != null ? Math.floor(override) : parsedItem.quality
        };
      }
      if (parsedItem.rarity === "\u4F20\u5947" || parsedItem.category === "\u5F15\u8DEF\u77F3") {
        const unidentified = !!parsedItem.unidentified;
        const corrupted = !!parsedItem.corrupted;
        query.filters.misc_filters = {
          disabled: false,
          filters: {
            corrupted: { option: corrupted ? "true" : unidentified ? null : "false" },
            identified: { option: unidentified ? "false" : "true" }
          }
        };
      }
      const weaponDps = addDpsFilters(query, parsedItem, opts);
      const defences = addDefenceFilters(query, parsedItem, opts, matched);
      const mapMods = addMapFilters(query, parsedItem, opts);
      const socketCount = addSocketFilters(query, parsedItem, opts);
      return { query, league, weaponDps, defences, mapMods, socketCount, pseudo: pseudoResult };
    }
    function adjustThreshold(value, rangePercent = 0) {
      const percent = Math.max(0, Math.min(100, rangePercent)) / 100;
      return Math.max(0, Math.floor(value * (1 - percent)));
    }
    function applyPseudoMerge(query, candidates, opts = {}) {
      const { pseudoRangePercent = 0 } = opts;
      const suggestions = buildPseudoFilters(candidates);
      const applied = suggestions.filter((suggestion) => suggestion.enabled);
      if (applied.length > 0) {
        const filters = applied.map((suggestion) => {
          const threshold = adjustThreshold(suggestion.value.min, pseudoRangePercent);
          return { id: suggestion.id, value: { min: threshold } };
        });
        query.stats.push({ type: "and", filters });
        for (const suggestion of applied) {
          for (const source of suggestion.sources) {
            if (!source.filter.disabled) {
              source.filter.disabled = true;
              source.pseudoConsumed = suggestion.id;
            }
          }
        }
      }
      return { suggestions, applied };
    }
    function buildTradeUrl(payload, league, host = "poe.game.qq.com") {
      return `https://${host}/trade2/search/poe2/${encodeURIComponent(league)}/${payload}`;
    }
    module.exports = { buildQuery: buildQuery2, buildTradeUrl };
  }
});

// PoeQuick/Resources/core-entry.js
var import_parse_item = __toESM(require_parse_item());
var import_match_stats = __toESM(require_match_stats());
var import_query = __toESM(require_query());
globalThis.parseAndQueryPrice = function(clipboardText, leagueName) {
  const item = (0, import_parse_item.parseItemText)(clipboardText);
  const matched = (0, import_match_stats.matchItem)(item, globalThis.compiledDict);
  const { query, league, weaponDps, defences, mapMods, pseudo } = (0, import_query.buildQuery)(item, matched, {
    league: leagueName || "\u5468\u5E74\u5E86\u5DC5\u5CF0\u6311\u6218",
    dps: true,
    defences: true,
    mapFilters: true,
    pseudoEnabled: true
  });
  const hitCount = matched.filter((m) => m.match).length;
  const enabledCount = query.stats.flatMap((group) => group.filters || []).filter((f) => !f.disabled).length;
  const mergedCount = pseudo.applied.length;
  return {
    query,
    // 返回 query 对象，由 Swift 层 gzip + base64url + 打开 URL
    league,
    summary: `${item.name || item.baseName || "\u88C5\u5907"} (${hitCount}\u547D\u4E2D/${enabledCount}\u542F\u7528${mergedCount ? `/${mergedCount}\u5408\u5E76` : ""})`,
    item: {
      name: item.name,
      baseName: item.baseName,
      rarity: item.rarity,
      category: item.category
    },
    weaponDps,
    defences,
    mapMods,
    pseudo
  };
};
