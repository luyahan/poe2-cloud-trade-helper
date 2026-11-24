// QuickJS 入口：把 @poe2/core 的业务逻辑包装成全局函数
//
// core 是仓库根目录的独立包，与 Electron 宿主无任何依赖关系。
// 这里用相对路径直连（Swift 侧没有包管理器参与，esbuild 只需能读到源文件），
// 不引入 node_modules 解析，避免构建环境差异。
import { parseItemText } from '../../../core/parse-item.js';
import { matchItem } from '../../../core/match-stats.js';
import { buildQuery } from '../../../core/query.js';

// 词典由宿主执行 cn-stats.compiled.js 后注入到 globalThis.compiledDict
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
