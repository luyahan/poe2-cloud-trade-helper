/**
 * 分层边界测试
 *
 * core 是仓库根目录的独立包（@poe2/core），两个宿主（electron、macos-quickjs）
 * 都以消费方身份使用它。core 必须能整份移植到 QuickJS，所以用测试把
 * 「core 不许碰平台能力」这条硬约束钉住，而不是只靠 README 的口头约定。
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync, existsSync } = require('node:fs');
const { join } = require('node:path');

// 本文件位于仓库根 test/，所以仓库根就是上一级
const REPO = join(__dirname, '..');
const CORE = join(REPO, 'core');
const ELECTRON_SRC = join(REPO, 'electron', 'src');

function coreFiles() {
  return readdirSync(CORE).filter((f) => f.endsWith('.js'));
}

test('结构：core 是独立包，不在 electron 内部', () => {
  assert.equal(existsSync(join(CORE, 'package.json')), true, 'core 应自带 package.json');
  assert.equal(existsSync(join(ELECTRON_SRC, 'core')), false, 'core 不应再位于 electron/src 下');
  for (const f of ['parse-item', 'match-stats', 'query', 'weapon-dps', 'defences', 'map-mods', 'pseudo', 'item-text']) {
    assert.equal(existsSync(join(CORE, `${f}.js`)), true, `core/${f}.js 应存在`);
  }
});

test('分层：core 不引用 node: 内置模块', () => {
  for (const f of coreFiles()) {
    const src = readFileSync(join(CORE, f), 'utf8');
    // 注释里提到 node:zlib 是允许的，只拦真正的 require
    const offenders = [...src.matchAll(/require\(\s*['"]node:[^'"]+['"]\s*\)/g)].map((m) => m[0]);
    assert.deepEqual(offenders, [], `${f} 不应 require node: 内置模块`);
  }
});

test('分层：core 不引用 electron / 宿主依赖', () => {
  for (const f of coreFiles()) {
    const src = readFileSync(join(CORE, f), 'utf8');
    const offenders = [...src.matchAll(/require\(\s*['"](electron|uiohook-napi)['"]\s*\)/g)];
    assert.equal(offenders.length, 0, `${f} 不应依赖 ${offenders[0]?.[1]}`);
  }
});

test('分层：core 不依赖任何宿主目录（electron / macos-quickjs）', () => {
  for (const f of coreFiles()) {
    const src = readFileSync(join(CORE, f), 'utf8');
    const offenders = [...src.matchAll(/require\(\s*['"]\.{1,2}\/[^'"]*(host|ui|electron|macos-quickjs)/g)];
    assert.equal(offenders.length, 0, `${f} 不得反向依赖宿主`);
  }
});

test('分层：core 不直接读剪贴板 / 打开 URL（副作用留在宿主）', () => {
  for (const f of coreFiles()) {
    const src = readFileSync(join(CORE, f), 'utf8');
    for (const forbidden of ['clipboard.readText', 'shell.openExternal', 'process.resourcesPath']) {
      assert.equal(src.includes(forbidden), false, `${f} 不应出现 ${forbidden}`);
    }
  }
});

test('分层：core 每个模块都能在纯 Node 下独立 require', () => {
  for (const f of coreFiles()) {
    assert.doesNotThrow(() => require(join(CORE, f)), `${f} 应能被独立 require`);
  }
});

test('分层：宿主只通过包入口消费 core', () => {
  for (const f of ['main.js', 'encode.js']) {
    const p = join(ELECTRON_SRC, 'host', f);
    const src = readFileSync(p, 'utf8');
    assert.equal(/require\(['"]\.\.?\/.*core/.test(src), false, `${f} 不应使用相对路径进 core`);
    assert.ok(src.includes("'@poe2/core"), `${f} 应通过 @poe2/core 消费`);
  }
});

test('分层：Swift 入口不引用 electron 目录', () => {
  const entry = join(REPO, 'macos-quickjs', 'PoeQuick', 'Resources', 'core-entry.js');
  const src = readFileSync(entry, 'utf8');
  assert.equal(src.includes('electron/'), false, 'Swift 侧不应再依赖 electron/');
  assert.ok(src.includes('core/parse-item'), 'Swift 侧应直接引用仓库根 core/');
});

test('分层：Swift 构建脚本不引用 electron 目录', () => {
  const sh = readFileSync(join(REPO, 'macos-quickjs', 'build.sh'), 'utf8');
  const code = sh.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
  assert.equal(code.includes('electron'), false, 'build.sh 不应引用 electron（含数据路径）');
  assert.ok(code.includes('../data/'), 'build.sh 应从仓库根 data/ 取词典');
});

test('分层：数据产物统一在仓库根 data/', () => {
  assert.equal(existsSync(join(REPO, 'data')), true, '根级 data/ 应存在');
  assert.equal(existsSync(join(REPO, 'electron', 'build-data')), false, '不应再有 electron/build-data');
  const prep = readFileSync(join(REPO, 'scripts', 'prepare-data.js'), 'utf8');
  assert.ok(prep.includes("join(__dirname, '..', 'data')"), 'prepare-data 应写入根级 data/');
  assert.equal(prep.includes('build-data'), false, 'prepare-data 不应再提及 build-data');
});

test('分层：根目录不散落数据文件（全部收进 data/）', () => {
  const rootData = readdirSync(REPO).filter((f) => /^(cn-|sample-).*\.(json|txt)$/.test(f));
  assert.deepEqual(rootData, [], '根目录不应再有 cn-*.json / sample-*.txt');
  for (const f of ['cn-stats.json', 'cn-stats.compiled.json', 'cn-stats.compiled.js',
                   'build-meta.json', 'cn-filters.json',
                   'sample-item.txt', 'sample-spear.txt', 'sample-hateforge.txt']) {
    assert.equal(existsSync(join(REPO, 'data', f)), true, `data/${f} 应存在`);
  }
});

test('分层：无引用的历史数据已删除', () => {
  // cn-items / cn-static / qjs.bin 无任何代码引用，已清理
  for (const f of ['cn-items.json', 'cn-static.json', 'cn-stats.qjs.bin']) {
    assert.equal(existsSync(join(REPO, 'data', f)), false, `data/${f} 应已删除`);
  }
});

test('结构：测试目录划分（纯逻辑在根 test/，宿主在 electron/test/）', () => {
  for (const f of ['pipeline.test.js', 'weapon-dps.test.js', 'defences.test.js',
                   'map-mods.test.js', 'pseudo.test.js', 'architecture.test.js']) {
    assert.equal(existsSync(join(REPO, 'test', f)), true, `根 test/${f} 应存在`);
  }
  assert.equal(existsSync(join(REPO, 'electron', 'test', 'host.test.js')), true,
    'electron/test/host.test.js 应存在');
  // electron 侧只应保留宿主相关测试
  const hostTests = readdirSync(join(REPO, 'electron', 'test'));
  assert.deepEqual(hostTests.filter((f) => f.endsWith('.test.js')), ['host.test.js']);
});

test('分层：core 不依赖任何数据文件（数据由宿主注入）', () => {
  for (const f of coreFiles()) {
    const src = readFileSync(join(CORE, f), 'utf8');
    assert.equal(/readFileSync|require\(['"].*\.json/.test(src), false, `${f} 不应自行读数据文件`);
  }
});

test('分层：query 只拼 URL，压缩编码留给宿主', () => {
  const { buildTradeUrl } = require('@poe2/core/query');
  assert.equal(buildTradeUrl('PAYLOAD', '联赛'), 'https://poe.game.qq.com/trade2/search/poe2/%E8%81%94%E8%B5%9B/PAYLOAD');
  const { encodePayload } = require(join(ELECTRON_SRC, 'host', 'encode.js'));
  const payload = encodePayload({ a: 1 });
  assert.equal(payload.includes('+'), false);
  assert.equal(payload.includes('/'), false);
  assert.equal(payload.includes('='), false);
});
