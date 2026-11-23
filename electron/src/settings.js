/**
 * 设置持久化（userData/settings.json）
 */

const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { join, dirname } = require('node:path');

const DEFAULTS = {
  enabled: true,          // 是否监听
  autoOpen: true,         // 命中后自动打开市集
  league: '周年庆巅峰挑战', // 国服联赛名（2026-11 实测，可在设置改）
  host: 'poe.game.qq.com',
  tierMax: 2,             // T1/T2 自动启用
  includeUntiered: false, // rune/implicit 是否默认启用
  readDelayMs: 600,       // 热键命中后延迟读剪贴板（等云游戏同步）
  dpsEnabled: true,       // 是否将武器面板 DPS 下限写入交易筛选
  dpsRangePercent: 2,     // 搜索阈值相对计算值下调比例（0-2%）
  defencesEnabled: true,  // 是否将 q20 防御面板下限写入交易筛选
  mapFiltersEnabled: true, // 是否将引路石面板字段写入 map_filters
};

class Settings {
  constructor(userDataPath) {
    this.file = join(userDataPath, 'settings.json');
    this.data = { ...DEFAULTS };
    this.userKeys = new Set(); // 用户显式保存过的字段（区别于默认值）
    this.load();
  }

  load() {
    try {
      const raw = readFileSync(this.file, 'utf8');
      const saved = JSON.parse(raw);
      this.data = { ...DEFAULTS, ...saved };
      this.userKeys = new Set(Object.keys(saved));
      // 清理已废弃的轮询与交易状态字段；status 永远由查询层固定为 any。
      delete this.data.mode;
      delete this.data.intervalMs;
      delete this.data.status;
    } catch {
      // 首次运行或损坏，用默认值
    }
    return this.data;
  }

  // 该字段是否被用户显式设置过（用于「打包默认联赛」只在未设置时生效）
  hasUserSet(key) {
    return this.userKeys.has(key);
  }

  save() {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
  }

  get(key) {
    return this.data[key];
  }

  set(key, value) {
    this.data[key] = value;
    this.userKeys.add(key);
    this.save();
  }

  all() {
    return { ...this.data };
  }
}



module.exports = { Settings, DEFAULTS };
