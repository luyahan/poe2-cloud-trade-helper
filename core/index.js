/**
 * @poe2/core 统一入口
 *
 * 这里只做 re-export，不放业务逻辑。分层用途：
 *   - Electron 宿主：require('../core/index.js')
 *   - PoeQuick：core-entry.js 从这里 import，esbuild 打成单文件 ESM 给 QuickJS
 *   - 测试：需要细粒度模块时用子路径（@poe2/core/query 等）
 *
 * 硬约束：本目录不得 require node:* / electron / uiohook 等平台模块。
 * 违反会让 QuickJS 侧编译直接失败（gzip 等平台能力由宿主层提供）。
 */

const { parseItemText } = require('./parse-item.js');
const {
  compileDictionary,
  serializeCompiled,
  deserializeCompiled,
  normalizeTemplate,
  matchMod,
  matchItem,
} = require('./match-stats.js');
const { buildQuery, buildTradeUrl } = require('./query.js');
const { calcWeaponDps, searchMin, addDpsFilters } = require('./weapon-dps.js');
const { calcDefences, addDefenceFilters } = require('./defences.js');
const { calcMapMods, addMapFilters, MAP_FIELDS } = require('./map-mods.js');
const { looksLikeItemText } = require('./item-text.js');

/** 便捷流程：解析 → 匹配 → 构造查询（宿主只需关心压缩与打开） */
function buildPricedQuery(clipboardText, compiledDict, opts = {}) {
  const item = parseItemText(clipboardText);
  const matched = matchItem(item, compiledDict);
  const result = buildQuery(item, matched, opts);
  const hitCount = matched.filter((m) => m.match).length;
  const enabledCount = result.query.stats[0].filters.filter((f) => !f.disabled).length;
  return { item, matched, ...result, hitCount, enabledCount };
}

module.exports = {
  parseItemText,
  compileDictionary,
  serializeCompiled,
  deserializeCompiled,
  normalizeTemplate,
  matchMod,
  matchItem,
  buildQuery,
  buildTradeUrl,
  calcWeaponDps,
  searchMin,
  addDpsFilters,
  calcDefences,
  addDefenceFilters,
  calcMapMods,
  addMapFilters,
  MAP_FIELDS,
  looksLikeItemText,
  buildPricedQuery,
};
