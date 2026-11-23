#!/usr/bin/env node
/**
 * 打包前数据准备（npm run dist 自动执行）
 *
 * 1. 从国服 API 重新拉取词缀词典 /api/trade2/data/stats
 * 2. 从 /api/trade2/data/leagues 获取当前联赛（取第一个非专家 poe2 联赛）
 * 3. 写入 build-data/：
 *    - cn-stats.json            原始词典（在线兜底 / 调试）
 *    - cn-stats.compiled.json   预建索引（数组元组 JSON，跨引擎通用）
 *    - cn-stats.qjs.bin         预建索引（QuickJS JS_WriteObject 二进制）
 *    - build-meta.json          打包时间 + 当前联赛，运行时读取作为默认联赛
 *
 * 任一 API 失败则打包中止（宁可打包失败，不出带旧数据的包）。
 */

const { writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
const { compileDictionary, serializeCompiled } = require('../src/lib/match-stats.js');

const HOST = process.env.TRADE_HOST || 'poe.game.qq.com';
const OUT = join(__dirname, '..', 'build-data');

async function fetchJson(path) {
  const url = `https://${HOST}${path}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

(async () => {
  mkdirSync(OUT, { recursive: true });

  console.log(`[prepare] 拉取词典 https://${HOST}/api/trade2/data/stats …`);
  const stats = await fetchJson('/api/trade2/data/stats');
  const groups = stats.result || [];
  const total = groups.reduce((n, g) => n + (g.entries?.length || 0), 0);
  if (!groups.length || total < 100) throw new Error('词典数据异常（分组为空或条目过少）');
  writeFileSync(join(OUT, 'cn-stats.json'), JSON.stringify(stats));
  console.log(`[prepare] 词典 OK：${groups.length} 分组 / ${total} 条目`);

  // 编译期预建索引：数组元组 JSON（Electron/QuickJS/Lua 通用）
  console.log('[prepare] 编译词典索引…');
  const t0 = Date.now();
  const compiled = compileDictionary(stats);
  const serialized = serializeCompiled(compiled);
  const compiledJson = JSON.stringify(serialized);
  writeFileSync(join(OUT, 'cn-stats.compiled.json'), compiledJson);
  console.log(`[prepare] 索引 JSON OK：${(compiledJson.length / 1024).toFixed(1)} KB，编译耗时 ${Date.now() - t0} ms`);

  // 同时输出 JS 字面量（QuickJS 直接 evaluate，启动 ~5ms，比 JSON.parse 快）
  // 格式：globalThis.compiledDict = { [groupId]: new Map([...]), ... }
  // 注意：QuickJS bellard 原版的 JS_WriteObject 不支持 Map，所以用 JS 字面量代替。
  const jsLiteral = `// 编译期生成的词典索引（勿手改）
(function(){
  const serialized = ${compiledJson};
  const compiled = {};
  for (const [groupId, tuples] of Object.entries(serialized)) {
    const map = new Map();
    for (const [key, value] of tuples) {
      if (key === '__patterns__') map.set(key, new Map(value));
      else map.set(key, value);
    }
    compiled[groupId] = map;
  }
  globalThis.compiledDict = compiled;
})();
`;
  writeFileSync(join(OUT, 'cn-stats.compiled.js'), jsLiteral);
  console.log(`[prepare] 索引 JS 字面量 OK：${(jsLiteral.length / 1024).toFixed(1)} KB`);

  console.log(`[prepare] 拉取联赛 https://${HOST}/api/trade2/data/leagues …`);
  const leagues = await fetchJson('/api/trade2/data/leagues');
  const list = (leagues.result || []).filter((l) => l.realm === 'poe2');
  // 当前赛季联赛 = 第一个非专家、非永久的联赛；兜底取第一个非专家
  const current =
    list.find((l) => !/专家|Hardcore/.test(l.id) && l.id !== '永久') ||
    list.find((l) => !/专家|Hardcore/.test(l.id));
  if (!current) throw new Error('联赛列表为空，无法确定当前联赛');
  const meta = { fetchedAt: new Date().toISOString(), host: HOST, league: current.id, leagues: list.map((l) => l.id) };
  writeFileSync(join(OUT, 'build-meta.json'), JSON.stringify(meta, null, 2));
  console.log(`[prepare] 当前联赛：${current.id}`);
  console.log(`[prepare] 可选联赛：${meta.leagues.join(' / ')}`);
  console.log('[prepare] 完成 → build-data/');
})().catch((err) => {
  console.error(`[prepare] 失败：${err.message}`);
  process.exit(1);
});