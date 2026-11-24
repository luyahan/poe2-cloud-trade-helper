/**
 * Electron 宿主层测试（与 UI 无关的部分：热键旁听、gzip 编码）
 *
 * 纯业务逻辑测试已提到仓库根 test/，这里只测「进入 Electron 之后」的能力：
 *   - host/hotkey.js  全局热键旁听（mock uiohook，不需要真实辅助功能权限）
 *   - host/encode.js  查询对象 → gzip → base64url → 市集 URL
 *
 * 运行：node --test test/*.test.js（在 electron/ 目录下）
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const zlib = require('node:zlib');

const { parseItemText } = require('@poe2/core/parse-item');
const { compileDictionary, matchItem } = require('@poe2/core/match-stats');
const { buildQuery } = require('@poe2/core/query');
const { encodeTradeUrl } = require('../src/host/encode.js');

const here = __dirname;
const sample = readFileSync(join(here, '../../data/sample-item.txt'), 'utf8');
const dict = JSON.parse(readFileSync(join(here, '../../data/cn-stats.json'), 'utf8'));
const compiled = compileDictionary(dict);

test('编码：URL 回环一致', async () => {
  const p = parseItemText(sample);
  const matched = matchItem(p, compiled);
  const { query, league } = buildQuery(p, matched, {});
  const url = await encodeTradeUrl(query, league);
  assert.match(url, /^https:\/\/poe\.game\.qq\.com\/trade2\/search\/poe2\//);
  const b64 = url.split('/').pop();
  const gz = Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const back = JSON.parse(zlib.gunzipSync(gz).toString('utf8'));
  assert.deepEqual(back, query);
});

test('编码：base64url 不含 + / =（否则市集会截断）', async () => {
  const p = parseItemText(sample);
  const { query, league } = buildQuery(p, matchItem(p, compiled), {});
  const url = await encodeTradeUrl(query, league);
  const payload = url.split('/').pop();
  assert.equal(payload.includes('+'), false);
  assert.equal(payload.includes('/'), false);
  assert.equal(payload.includes('='), false);
});

// ---- 热键组合键判定逻辑（mock uiohook，不依赖真实权限）----
function withMockedUiohook(fn) {
  const UiohookKey = { C: 46, Ctrl: 29, CtrlRight: 3629, Alt: 56, AltRight: 3640, Shift: 42, ShiftRight: 3654 };
  const Module = require('node:module');
  const origLoad = Module._load;
  Module._load = function (req, ...rest) {
    if (req === 'uiohook-napi') {
      return { uIOhook: { on() {}, removeListener() {}, start() {}, stop() {} }, UiohookKey };
    }
    return origLoad.call(this, req, ...rest);
  };
  try {
    return fn(UiohookKey);
  } finally {
    Module._load = origLoad;
  }
}

test('热键：Ctrl+Alt+C 命中判定与防抖', () => {
  const { HotkeyWatcher } = require('../src/host/hotkey.js');
  let captured = null;
  const fakeClipboard = { readText: () => '物品类别: 战矛\n稀有度: 稀有\n--------' };
  const w = new HotkeyWatcher(fakeClipboard, (t) => { captured = t; }, {
    readDelayMs: 10, looksLikeItemText: (t) => /^物品类别:/m.test(t),
  });
  // 直接驱动内部 handlers，模拟 uiohook 事件键码（C=46 Ctrl=29 Alt=56）
  return withMockedUiohook(() => {
    w.start();
    w._onKeyDown({ keycode: 29 }); // Ctrl down
    w._onKeyDown({ keycode: 56 }); // Alt down
    w._onKeyDown({ keycode: 46 }); // C down → 命中
    assert.equal(w.mods.ctrl, true);
    assert.equal(w.mods.alt, true);
    // 防抖：立即再按 C 不应重复调度
    const t0 = w.lastTrigger;
    w._onKeyDown({ keycode: 46 });
    assert.equal(w.lastTrigger, t0, '500ms 内重复触发应被防抖忽略');
    w._onKeyUp({ keycode: 29 });
    assert.equal(w.mods.ctrl, false);
    // 等延迟读剪贴板
    return new Promise((resolve) => setTimeout(() => {
      assert.ok(captured && captured.includes('物品类别'), '应读到装备文本并回调');
      w.stop();
      resolve();
    }, 40));
  });
});

test('热键：缺修饰键不触发', () => {
  const { HotkeyWatcher } = require('../src/host/hotkey.js');
  let captured = null;
  const w = new HotkeyWatcher({ readText: () => '物品类别: x' }, (t) => { captured = t; }, { readDelayMs: 10 });
  withMockedUiohook(() => {
    w.start();
    w._onKeyDown({ keycode: 29 }); // 只按 Ctrl
    w._onKeyDown({ keycode: 46 }); // C，缺 Alt
    assert.equal(w.lastTrigger, 0, '缺 Alt 不应触发');
    w.stop();
  });
});
