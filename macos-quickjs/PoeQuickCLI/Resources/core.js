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

// ../core/weapon-dps.js
var require_weapon_dps = __commonJS({
  "../core/weapon-dps.js"(exports, module) {
    var ELEMENT_NAMES = {
      fire: "\u706B\u7130",
      cold: "\u51B0\u971C",
      lightning: "\u95EA\u7535"
    };
    function statTexts(item) {
      return (item.mods || []).flatMap((mod) => (mod.stats || []).map((stat) => stat.text || ""));
    }
    function emptyRoll() {
      return { value: 0, min: 0, max: 0 };
    }
    function sumDamageStats(item) {
      const totals = {
        physicalFlat: emptyRoll(),
        physicalIncreased: emptyRoll(),
        fire: emptyRoll(),
        cold: emptyRoll(),
        lightning: emptyRoll()
      };
      for (const text of statTexts(item)) {
        const increased2 = text.match(/^物理伤害提高\s*(-?[\d.]+)(?:\s*\((-?[\d.]+)-(-?[\d.]+)\))?\s*%/);
        if (increased2) {
          totals.physicalIncreased.value += Number(increased2[1]);
          totals.physicalIncreased.min += Number(increased2[2] ?? increased2[1]);
          totals.physicalIncreased.max += Number(increased2[3] ?? increased2[1]);
          continue;
        }
        const flat = text.match(/^(?:攻击)?附加\s*(-?[\d.]+)(?:\s*\((-?[\d.]+)-(-?[\d.]+)\))?\s*-\s*(-?[\d.]+)(?:\s*\((-?[\d.]+)-(-?[\d.]+)\))?\s*(物理|火焰|冰霜|闪电)伤害/);
        if (!flat) continue;
        const roll = {
          min: (Number(flat[1]) + Number(flat[4])) / 2,
          max: (Number(flat[1]) + Number(flat[4])) / 2,
          value: (Number(flat[1]) + Number(flat[4])) / 2
        };
        roll.min = (Number(flat[2] ?? flat[1]) + Number(flat[5] ?? flat[4])) / 2;
        roll.max = (Number(flat[3] ?? flat[1]) + Number(flat[6] ?? flat[4])) / 2;
        const target = flat[7] === "\u7269\u7406" ? totals.physicalFlat : flat[7] === "\u706B\u7130" ? totals.fire : flat[7] === "\u51B0\u971C" ? totals.cold : totals.lightning;
        target.value += roll.value;
        target.min += roll.min;
        target.max += roll.max;
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
        totals[element].value = (Number(match[1]) + Number(match[2])) / 2;
        totals[element].min = totals[element].value;
        totals[element].max = totals[element].value;
      }
      return totals;
    }
    function isModifiable(item) {
      return !item.corrupted && !item.isCorrupted && !item.mirrored && !item.isMirrored && !item.sanctified && !item.isSanctified;
    }
    function increased(flat, increasedPct, qualityPct) {
      return flat * (1 + increasedPct / 100) * (1 + qualityPct / 100);
    }
    function calcWeaponDps(item) {
      const props = item.properties || {};
      const aps = props.attackSpeed;
      if (!Number.isFinite(aps) || aps <= 0) return void 0;
      const stats = sumDamageStats(item);
      const headerElements = parseElementalHeader(props.elementalDamage, item.mods);
      let attackSpeedIncreased = emptyRoll();
      for (const text of statTexts(item)) {
        const match = text.match(/^攻击速度提高\s*(-?[\d.]+)(?:\s*\((-?[\d.]+)-(-?[\d.]+)\))?\s*%/);
        if (!match) continue;
        attackSpeedIncreased.value += Number(match[1]);
        attackSpeedIncreased.min += Number(match[2] ?? match[1]);
        attackSpeedIncreased.max += Number(match[3] ?? match[1]);
      }
      const baseAttackSpeed = aps / (1 + attackSpeedIncreased.value / 100);
      const attackSpeed = {
        value: aps,
        min: baseAttackSpeed * (1 + attackSpeedIncreased.min / 100),
        max: baseAttackSpeed * (1 + attackSpeedIncreased.max / 100),
        base: baseAttackSpeed,
        increased: attackSpeedIncreased
      };
      const physical = props.physicalDamage;
      const hasPhysical = physical && Number.isFinite(physical.min) && Number.isFinite(physical.max) && physical.min + physical.max > 0;
      const hasElemental = Object.values(headerElements).some((entry) => entry.value > 0) || ["fire", "cold", "lightning"].some((element) => stats[element].value > 0);
      const physicalOnlyFromFlat = !hasPhysical && !hasElemental && stats.physicalFlat.value > 0;
      const quality = item.quality ?? 0;
      const q20 = isModifiable(item) ? Math.max(20, quality) : quality;
      let physicalAverage;
      if (physicalOnlyFromFlat) {
        physicalAverage = {
          value: stats.physicalFlat.value,
          min: stats.physicalFlat.min,
          max: stats.physicalFlat.max,
          base: 0,
          quality: 0,
          estimatedFromFlatOnly: true
        };
      } else if (hasPhysical) {
        const currentAverage = (physical.min + physical.max) / 2;
        const increasedPct = stats.physicalIncreased.value;
        const base = currentAverage / ((1 + quality / 100) * (1 + increasedPct / 100)) - stats.physicalFlat.value;
        const value = increased(base + stats.physicalFlat.value, increasedPct, q20);
        const min = increased(base + stats.physicalFlat.min, stats.physicalIncreased.min, q20);
        const max = increased(base + stats.physicalFlat.max, stats.physicalIncreased.max, q20);
        physicalAverage = { value, min: Math.min(min, max), max: Math.max(min, max), base, quality: q20 };
      }
      const elements = {};
      let hasElementalDamage = false;
      for (const element of Object.keys(ELEMENT_NAMES)) {
        const header = headerElements[element];
        const local = stats[element];
        if (header.value <= 0 && local.value <= 0) continue;
        hasElementalDamage = true;
        const value = header.value > 0 ? header.value : local.value;
        elements[element] = { value, min: local.min, max: local.max };
        if (local.value <= 0) {
          elements[element].min = value;
          elements[element].max = value;
        }
      }
      if (!hasPhysical && !hasElemental && !physicalOnlyFromFlat) return void 0;
      const roll = (averages) => ({
        value: averages.reduce((sum, entry) => sum + entry.value, 0) * attackSpeed.value,
        min: averages.reduce((sum, entry) => sum + entry.min, 0) * attackSpeed.min,
        max: averages.reduce((sum, entry) => sum + entry.max, 0) * attackSpeed.max
      });
      const elemental = Object.values(elements);
      const pDPS = hasPhysical || physicalOnlyFromFlat ? roll([physicalAverage]) : void 0;
      const eDPS = hasElemental ? roll(elemental) : void 0;
      const totalDPS = hasElemental ? roll([...hasPhysical || physicalOnlyFromFlat ? [physicalAverage] : [], ...elemental]) : void 0;
      return {
        attackSpeed,
        physicalAverage,
        elements,
        pDPS,
        eDPS,
        totalDPS,
        display: {
          pDPS: pDPS ? Math.round(pDPS.value) : void 0,
          eDPS: eDPS ? Math.round(eDPS.value) : void 0,
          totalDPS: totalDPS ? Math.round(totalDPS.value) : void 0,
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
    function addDpsFilters(query, item, opts = {}) {
      if (opts.dps === false) return void 0;
      const dps = calcWeaponDps(item);
      if (!dps) return void 0;
      const rangePercent = opts.dpsRangePercent ?? 2;
      const filters = {};
      if (dps.totalDPS) filters.dps = { min: searchMin(dps.totalDPS, item.rarity, rangePercent) };
      if (dps.pDPS) filters.pdps = { min: searchMin(dps.pDPS, item.rarity, rangePercent) };
      if (dps.eDPS) filters.edps = { min: searchMin(dps.eDPS, item.rarity, rangePercent) };
      if (opts.dpsMin != null || opts.pdpsMin != null || opts.edpsMin != null) {
        for (const key of ["dps", "pdps", "edps"]) {
          const requested = opts[`${key}Min`] ?? opts.dpsMin;
          if (filters[key] && requested != null) filters[key].min = Math.floor(requested);
        }
      }
      query.filters.equipment_filters = { disabled: false, filters };
      return dps;
    }
    module.exports = { calcWeaponDps, searchMin, addDpsFilters };
  }
});

// ../core/defences.js
var require_defences = __commonJS({
  "../core/defences.js"(exports, module) {
    var { searchMin } = require_weapon_dps();
    var DEFENCES = {
      armour: {
        property: "armour",
        filter: "ar",
        label: "\u62A4\u7532",
        flat: /^\+?(-?[\d.]+)(?:\s*\((-?[\d.]+)-(-?[\d.]+)\))?\s*护甲$/,
        increased: /^护甲提高\s*(-?[\d.]+)(?:\s*\((-?[\d.]+)-(-?[\d.]+)\))?\s*%/
      },
      evasion: {
        property: "evasion",
        filter: "ev",
        label: "\u95EA\u907F",
        flat: /^\+?(-?[\d.]+)(?:\s*\((-?[\d.]+)-(-?[\d.]+)\))?\s*(?:点)?闪避值$/,
        increased: /^闪避值提高\s*(-?[\d.]+)(?:\s*\((-?[\d.]+)-(-?[\d.]+)\))?\s*%/
      },
      energyShield: {
        property: "energyShield",
        filter: "es",
        label: "\u80FD\u91CF\u62A4\u76FE",
        flat: /^\+?(-?[\d.]+)(?:\s*\((-?[\d.]+)-(-?[\d.]+)\))?\s*(?:点)?能量护盾(?:上限)?$/,
        increased: /^能量护盾(?:上限)?提高\s*(-?[\d.]+)(?:\s*\((-?[\d.]+)-(-?[\d.]+)\))?\s*%/
      },
      ward: {
        property: "ward",
        filter: "ward",
        label: "\u7B26\u6587\u7ED3\u754C",
        flat: /^\+?(-?[\d.]+)(?:\s*\((-?[\d.]+)-(-?[\d.]+)\))?\s*符文(?:结界|壁垒)(?:上限)?$/,
        increased: /^符文(?:结界|壁垒)(?:上限)?提高\s*(-?[\d.]+)(?:\s*\((-?[\d.]+)-(-?[\d.]+)\))?\s*%/
      }
    };
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
    function emptyRoll() {
      return { value: 0, min: 0, max: 0 };
    }
    function addRoll(target, match) {
      const value = Number(match[1]);
      target.value += value;
      target.min += Number(match[2] ?? value);
      target.max += Number(match[3] ?? value);
    }
    function isModifiable(item) {
      return !item.corrupted && !item.isCorrupted && !item.mirrored && !item.isMirrored && !item.sanctified && !item.isSanctified;
    }
    function statLines(item) {
      return (item.mods || []).flatMap((mod) => (mod.stats || []).map((stat) => stat.text || ""));
    }
    function calcDefences(item, matched = []) {
      const props = item.properties || {};
      const quality = item.quality ?? 0;
      const q20 = isModifiable(item) ? Math.max(20, quality) : quality;
      const output = {};
      const byId = /* @__PURE__ */ new Map();
      for (const { stat, match } of matched) {
        if (!stat?.rolls?.length) continue;
        const id = match?.id || stat.tradeId;
        if (!id) continue;
        const roll = stat.rolls[match?.valueRollIndex ?? 0];
        if (!roll) continue;
        const entry = { value: roll.value, min: roll.min ?? roll.value, max: roll.max ?? roll.value };
        if (!byId.has(id)) byId.set(id, []);
        byId.get(id).push(entry);
      }
      if (!matched.length) {
        for (const mod of item.mods || []) for (const stat of mod.stats || []) {
          if (!stat.tradeId || !stat.rolls?.length) continue;
          const roll = stat.rolls[0];
          const entry = { value: roll.value, min: roll.min ?? roll.value, max: roll.max ?? roll.value };
          if (!byId.has(stat.tradeId)) byId.set(stat.tradeId, []);
          byId.get(stat.tradeId).push(entry);
        }
      }
      for (const [key, definition] of Object.entries(DEFENCES)) {
        const panel = props[definition.property];
        if (!Number.isFinite(panel) || panel <= 0) continue;
        const flat = emptyRoll();
        const increased = emptyRoll();
        const localIds = LOCAL_INCREASED_IDS[key] || [];
        const orderedIds = [...localIds].sort((a, b) => Number(byId.has(b)) - Number(byId.has(a)));
        for (const id of orderedIds) {
          for (const roll of byId.get(id) || []) {
            increased.value += roll.value;
            increased.min += roll.min;
            increased.max += roll.max;
          }
          if (byId.has(id)) break;
        }
        for (const hybrid of HYBRID_INCREASED) {
          if (!hybrid.targets.includes(key)) continue;
          for (const id of hybrid.ids) {
            for (const roll of byId.get(id) || []) {
              increased.value += roll.value;
              increased.min += roll.min;
              increased.max += roll.max;
            }
          }
        }
        for (const text of statLines(item)) {
          const singleFlat = text.match(definition.flat);
          if (singleFlat) addRoll(flat, singleFlat);
        }
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
      if (Number.isFinite(props.block) && props.block > 0) {
        output.block = { filter: "block", label: "\u683C\u6321", panel: props.block, value: props.block, min: props.block, max: props.block, display: props.block };
      }
      if (Number.isFinite(props.spirit) && props.spirit > 0) {
        output.spirit = { filter: "spirit", label: "\u7CBE\u9B42", panel: props.spirit, value: props.spirit, min: props.spirit, max: props.spirit, display: props.spirit };
      }
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
      for (const [key, defence] of Object.entries(defences)) {
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
    var MOD_LINE = /^\{\s*(?<special>亵渎的|打造的|已破裂|已工艺)?\s*(?<gen>前缀属性|后缀属性|前缀词缀|后缀词缀|固定词缀|基底属性|传奇属性|瓦尔传奇词缀)\s*(?:"(?<name>[^"]*)"|“(?<nameCN>[^”]*)”)?\s*(?:\(等阶：(?<tier>\d+)\))?\s*(?:\(阶级：(?<rank>\d+)\))?\s*(?:—\s*(?<tags>[^}]*))?\}$/;
    var GRANT_SKILL_LINE = /^获得技能:\s*(.+)$/;
    var NUM_RANGE = /(?<sign>[+-]?)(?<value>\d+(?:\.\d+)?)\s*(?:\((?<min>[+-]?\d+(?:\.\d+)?)\s*[-–—]\s*(?<max>[+-]?\d+(?:\.\d+)?)\))?/g;
    var SECTION_SEP = /^-{4,}$/;
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
      if (/^被腐化/.test(text)) return false;
      if (/\d/.test(text)) return false;
      return /[，。]$/.test(text) || /^[一-龥，。、；：""''（）\s]+$/.test(text);
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
      for (const line of lines) {
        let m;
        if (m = line.match(/^物品类别:\s*(.+)$/)) item.category = m[1].trim();
        else if (m = line.match(/^稀\s*有\s*度:\s*(.+)$/)) item.rarity = m[1].trim();
        else if (m = line.match(/^物品等级:\s*(\d+)/)) item.itemLevel = Number(m[1]);
        else if (m = line.match(/^品质:\s*\+?(\d+)%/)) item.quality = Number(m[1]);
        else if (m = line.match(/^护甲:\s*(\d+)/)) item.properties.armour = Number(m[1]);
        else if (m = line.match(/^闪避(?:值)?:\s*(\d+)/)) item.properties.evasion = Number(m[1]);
        else if (m = line.match(/^能量护盾(?:上限)?:\s*(\d+)/)) item.properties.energyShield = Number(m[1]);
        else if (m = line.match(/^符文(?:结界|壁垒):\s*(\d+)/)) item.properties.ward = Number(m[1]);
        else if (m = line.match(/^格挡(?:几率|率)?:\s*([\d.]+)%/)) item.properties.block = Number(m[1]);
        else if (m = line.match(/^精魂:\s*(\d+)/)) item.properties.spirit = Number(m[1]);
        else if (m = line.match(/^插槽:\s*(.+)$/)) item.sockets = m[1].trim();
        else if (m = line.match(/^(?:引路石)?等阶:\s*(\d+)/)) item.properties.mapTier = Number(m[1]);
        else if (m = line.match(/^怪物群(?:大小|规模):\s*\+?([\d.]+)%/)) item.properties.mapPackSize = Number(m[1]);
        else if (m = line.match(/^魔法怪物(?:数量)?:\s*\+?([\d.]+)%/)) item.properties.mapMagicMonsters = Number(m[1]);
        else if (m = line.match(/^稀有怪物(?:数量)?:\s*\+?([\d.]+)%/)) item.properties.mapRareMonsters = Number(m[1]);
        else if (m = line.match(/^物品稀有度:\s*\+?([\d.]+)%/)) item.properties.mapIir = Number(m[1]);
        else if (m = line.match(/^(?:可用)?(?:复活|挑战)次数:\s*(\d+)/)) item.properties.mapRevives = Number(m[1]);
        else if (m = line.match(/^(?:引路石)?掉落几率:\s*\+?([\d.]+)%/)) item.properties.mapBonus = Number(m[1]);
        else if (m = line.match(/^金币:\s*\+?([\d.]+)%/)) item.properties.mapGold = Number(m[1]);
        else if (m = line.match(/^经验:\s*\+?([\d.]+)%/)) item.properties.mapExperience = Number(m[1]);
        else if (m = line.match(/^物理伤害:\s*(\d+)-(\d+)/))
          item.properties.physicalDamage = { min: Number(m[1]), max: Number(m[2]) };
        else if (m = line.match(/^暴击率:\s*([\d.]+)%/))
          item.properties.critChance = Number(m[1]);
        else if (m = line.match(/^每秒攻击次数:\s*([\d.]+)/))
          item.properties.attackSpeed = Number(m[1]);
        else if (/^被腐化/.test(line)) item.corrupted = true;
        else if (m = line.match(/^元素伤害:\s*(.+)$/))
          item.properties.elementalDamage = m[1].trim();
      }
      const rarityIdx = lines.findIndex((l) => /^稀\s*有\s*度:/.test(l));
      if (rarityIdx >= 0) {
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
      let modRegionStarted = false;
      let current = null;
      let pendingPlain = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (SECTION_SEP.test(trimmed)) {
          if (current) {
            item.mods.push(current);
            current = null;
          }
          continue;
        }
        const isModInfo = MOD_LINE.test(trimmed);
        const isTaggedPlain = /\((rune|implicit|enchant|crafted|fractured|desecrated)\)\s*$/.test(trimmed);
        const isGrantSkill = GRANT_SKILL_LINE.test(trimmed);
        if (!modRegionStarted) {
          if (isModInfo || isTaggedPlain || isGrantSkill) modRegionStarted = true;
          else continue;
        }
        const mm = trimmed.match(MOD_LINE);
        if (mm) {
          if (current) item.mods.push(current);
          const g = mm.groups;
          const isBase = g.gen === "\u57FA\u5E95\u5C5E\u6027";
          current = {
            type: g.special === "\u4EB5\u6E0E\u7684" ? "Desecrated" : g.special === "\u6253\u9020\u7684" ? "Crafted" : g.special === "\u5DF2\u7834\u88C2" ? "Fractured" : isBase ? "Implicit" : "Explicit",
            generation: /^(前缀属性|前缀词缀)$/.test(g.gen) ? "prefix" : /^(后缀属性|后缀词缀)$/.test(g.gen) ? "suffix" : "implicit",
            name: g.name || g.nameCN || void 0,
            tier: g.tier ? Number(g.tier) : void 0,
            rank: g.rank ? Number(g.rank) : void 0,
            tags: g.tags ? g.tags.split(",").map((s) => s.trim()).filter(Boolean) : [],
            statLines: []
          };
          continue;
        }
        const gs = trimmed.match(GRANT_SKILL_LINE);
        if (gs) {
          if (current) {
            item.mods.push(current);
            current = null;
          }
          item.grantedSkills ?? (item.grantedSkills = []);
          item.grantedSkills.push(gs[1].trim());
          item.mods.push({
            type: "Skill",
            generation: void 0,
            name: gs[1].trim(),
            tier: void 0,
            tags: [],
            statLines: [trimmed]
          });
          continue;
        }
        if (/^引路石掉落/.test(trimmed)) continue;
        if (/^被腐化/.test(trimmed)) {
          item.corrupted = true;
          continue;
        }
        if (current && current.statLines.length > 0 && isFlavourText(trimmed)) {
          item.mods.push(current);
          current = null;
          continue;
        }
        if (!current && item.mods.length > 0 && isFlavourText(trimmed)) {
          continue;
        }
        if (current) {
          current.statLines.push(trimmed);
        } else {
          pendingPlain.push(trimmed);
        }
      }
      if (current) item.mods.push(current);
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
      const { calcWeaponDps } = require_weapon_dps();
      const weaponDps = calcWeaponDps(item);
      const { calcDefences } = require_defences();
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
    function matchMod(mod, compiled) {
      const groups = TYPE_GROUP_PRIORITY[mod.type] || ["explicit"];
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
      { property: "mapMagicMonsters", filter: "map_magic_monsters", label: "\u9B54\u6CD5\u602A\u7269", integer: false },
      { property: "mapRareMonsters", filter: "map_rare_monsters", label: "\u7A00\u6709\u602A\u7269", integer: false },
      { property: "mapIir", filter: "map_iir", label: "\u7269\u54C1\u7A00\u6709\u5EA6", integer: false },
      { property: "mapRevives", filter: "map_revives", label: "\u53EF\u7528\u590D\u6D3B\u6B21\u6570", integer: true },
      { property: "mapBonus", filter: "map_bonus", label: "\u5F15\u8DEF\u77F3\u6389\u843D\u51E0\u7387", integer: false },
      { property: "mapGold", filter: "map_gold", label: "\u91D1\u5E01", integer: false },
      { property: "mapExperience", filter: "map_experience", label: "\u7ECF\u9A8C", integer: false }
    ];
    var MOD_TO_FIELD = [
      { property: "mapIir", pattern: /(?:区域内发现物品的稀有度|物品稀有度)(?:提高|增加)\s*\+?([\d.]+)/ },
      { property: "mapPackSize", pattern: /怪物群(?:规模|大小)(?:提高|增加)\s*\+?([\d.]+)/ },
      { property: "mapMagicMonsters", pattern: /魔法怪物(?:数量)?(?:提高|增加)\s*\+?([\d.]+)/ },
      { property: "mapRareMonsters", pattern: /稀有怪物(?:数量)?(?:提高|增加)\s*\+?([\d.]+)/ },
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
        if (override != null) {
          mapFilters.filters[def.filter] = { min: def.integer ? Math.floor(override) : Math.floor(override) };
          continue;
        }
        const value = entry.value;
        const min = def.integer ? Math.max(0, Math.floor(value)) : Math.max(0, Math.floor(value * (1 - percent)));
        mapFilters.filters[def.filter] = { min };
      }
      return mapMods;
    }
    module.exports = { calcMapMods, addMapFilters, MAP_FIELDS };
  }
});

// ../core/query.js
var require_query = __commonJS({
  "../core/query.js"(exports, module) {
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
    var { addDpsFilters } = require_weapon_dps();
    var { addDefenceFilters } = require_defences();
    var { addMapFilters } = require_map_mods();
    function buildQuery2(parsedItem, matched, opts = {}) {
      var _a, _b;
      const {
        tierMax = 2,
        includeUntiered = false,
        league = "\u8054\u8D5B"
      } = opts;
      const filters = [];
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
      }
      const query = {
        status: { option: "any" },
        stats: [{ type: "and", filters }],
        filters: {}
      };
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
      const RARITY_OPTION = { "\u7A00\u6709": "rare", "\u4F20\u5947": "unique", "\u9B54\u6CD5": "magic", "\u666E\u901A": "normal" };
      const rarityOpt = RARITY_OPTION[parsedItem.rarity];
      if (rarityOpt) {
        (_a = query.filters).type_filters ?? (_a.type_filters = { filters: {} });
        query.filters.type_filters.filters.rarity = { option: rarityOpt };
      }
      if (parsedItem.itemLevel != null && parsedItem.rarity !== "\u4F20\u5947") {
        (_b = query.filters).type_filters ?? (_b.type_filters = { filters: {} });
        query.filters.type_filters.filters.ilvl = { min: parsedItem.itemLevel };
      }
      const weaponDps = addDpsFilters(query, parsedItem, opts);
      const defences = addDefenceFilters(query, parsedItem, opts, matched);
      const mapMods = addMapFilters(query, parsedItem, opts);
      return { query, league, weaponDps, defences, mapMods };
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
  const { query, league, weaponDps, defences, mapMods } = (0, import_query.buildQuery)(item, matched, {
    league: leagueName || "\u5468\u5E74\u5E86\u5DC5\u5CF0\u6311\u6218",
    dps: true,
    defences: true,
    mapFilters: true
  });
  const hitCount = matched.filter((m) => m.match).length;
  const enabledCount = query.stats[0].filters.filter((f) => !f.disabled).length;
  return {
    query,
    // 返回 query 对象，由 Swift 层 gzip + base64url + 打开 URL
    league,
    summary: `${item.name || item.baseName || "\u88C5\u5907"} (${hitCount}\u547D\u4E2D/${enabledCount}\u542F\u7528)`,
    item: {
      name: item.name,
      baseName: item.baseName,
      rarity: item.rarity,
      category: item.category
    },
    weaponDps,
    defences,
    mapMods
  };
};
