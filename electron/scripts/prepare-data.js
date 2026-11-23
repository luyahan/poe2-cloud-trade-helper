#!/usr/bin/env node
/**
 * 打包前数据准备（npm run dist 自动执行）
 *
 * 1. 从国服 API 重新拉取词缀词典 /api/trade2/data/stats
 * 2. 从 /api/trade2/data/leagues 获取当前联赛（取第一个非专家 poe2 联赛）
 * 3. 写入 build-data/：
 *    - cn-stats.json        原始词典（在线兜底 / 调试）
 *    - cn-stats.compiled.bin  v8.serialize 后的 compiledDictionary（运行时直接 deserialize，零编译）
 *    - build-meta.json      打包时间 + 当前联赛，运行时读取作为默认联赛
 *
 * 任一 API 失败则打包中止（宁可打包失败，不出带旧数据的包）。
 */

const { writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const v8 = require('node:v8');
const { compileDictionary } = require('../src/lib/match-stats.js');

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

  // 编译期预建索引：v8.serialize 保留 Map 结构，运行时 deserialize 即得 compiledDictionary。
  console.log('[prepare] 编译词典索引…');
  const t0 = Date.now();
  const compiled = compileDictionary(stats);
  const bin = v8.serialize(compiled);
  writeFileSync(join(OUT, 'cn-stats.compiled.bin'), bin);
  console.log(`[prepare] 索引 OK：${(bin.length / 1024).toFixed(1)} KB，编译耗时 ${Date.now() - t0} ms`);

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