// QuickJS 入口：包装 Electron 端的解析/匹配/查询逻辑为全局函数
import { parseItemText } from '../../../electron/src/lib/parse-item.js';
import { compileDictionary, matchItem } from '../../../electron/src/lib/match-stats.js';
import { buildQuery } from '../../../electron/src/query.js';

// 在 QuickJS 中，compiledDict 由宿主通过 bjson.read 注入到 globalThis.compiledDict
// gzip 由宿主 Swift 层处理（QuickJS 无 node:zlib）
globalThis.parseAndQueryPrice = function(clipboardText, leagueName) {
    const item = parseItemText(clipboardText);
    const matched = matchItem(item, globalThis.compiledDict);
    const { query, league, weaponDps, defences, mapMods } = buildQuery(item, matched, {
        league: leagueName || '周年庆巅峰挑战',
        dps: true,
        defences: true,
        mapFilters: true,
    });

    const hitCount = matched.filter(m => m.match).length;
    const enabledCount = query.stats[0].filters.filter(f => !f.disabled).length;

    return {
        query,           // 返回 query 对象，由 Swift 层 gzip + base64url + 打开 URL
        league,
        summary: `${item.name || item.baseName || '装备'} (${hitCount}命中/${enabledCount}启用)`,
        item: {
            name: item.name,
            baseName: item.baseName,
            rarity: item.rarity,
            category: item.category,
        },
        weaponDps,
        defences,
        mapMods,
    };
};
