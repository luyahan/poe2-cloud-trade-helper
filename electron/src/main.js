/**
 * PoE2 云游戏查价托盘助手 — 主进程
 *
 * 流程：Ctrl+Alt+C（uiohook 旁听热键）→ 延迟读剪贴板 → 解析 → 匹配国服词典
 *       → 构造查询 → 编码 URL → 打开市集
 * 仅热键模式：macOS 需辅助功能权限，无权限/启动失败则弹窗提醒并退出（不降级）。
 * 托盘常驻菜单栏（macOS）/ 通知区（Windows）。
 */

const { app, Tray, Menu, clipboard, shell, nativeImage, BrowserWindow, Notification, net, ipcMain, systemPreferences, dialog } = require('electron');
const { join } = require('node:path');
const { readFileSync, writeFileSync, existsSync } = require('node:fs');

const { parseItemText } = require('./lib/parse-item.js');
const { compileDictionary, matchItem } = require('./lib/match-stats.js');
const { buildQuery, encodeTradeUrl } = require('./query.js');
const { looksLikeItemText } = require('./clipboard.js');
const { HotkeyWatcher } = require('./hotkey.js');
const { Settings } = require('./settings.js');

const ROOT = join(__dirname, '..');

// 模块级持有，防 GC 导致托盘图标消失
let tray = null;
let watcher = null;        // 热键旁听器（唯一监听方式）
let settings = null;
let compiledDict = null;
let settingsWin = null;
let lastResult = null;

const DICT_CACHE = () => join(app.getPath('userData'), 'cn-stats.json');
const DICT_URL = () => `https://${settings.get('host')}/api/trade2/data/stats`;
// 打包时 prepare-data.js 生成、随 app 分发的数据（Resources/build-data/）
const BUNDLED_DATA = () => join(process.resourcesPath || join(ROOT, 'build-data'), 'build-data');

// 读打包元信息（打包时间 + 打包时的当前联赛）
function readBuildMeta() {
  try {
    return JSON.parse(readFileSync(join(BUNDLED_DATA(), 'build-meta.json'), 'utf8'));
  } catch {
    return null; // 开发态未跑 prepare-data 时没有
  }
}

// ---- 词典加载（userData 缓存 24h TTL → 打包内置词典 → 在线拉取）----
async function loadDictionary(force = false) {
  const cacheFile = DICT_CACHE();
  if (!force && existsSync(cacheFile)) {
    try {
      const { ts, data } = JSON.parse(readFileSync(cacheFile, 'utf8'));
      if (Date.now() - ts < 86400000) {
        compiledDict = compileDictionary(data);
        return compiledDict;
      }
    } catch { /* 缓存损坏，重新拉 */ }
  }
  let data = null;
  try {
    // 用 Electron net 走系统代理（云游戏环境可能需要）
    data = await new Promise((resolve, reject) => {
      const req = net.request(DICT_URL());
      req.on('response', (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
          catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.end();
    });
    writeFileSync(cacheFile, JSON.stringify({ ts: Date.now(), data }), 'utf8');
  } catch (err) {
    // 在线失败 → 打包内置词典兜底（首次运行离线也能用）
    const bundled = join(BUNDLED_DATA(), 'cn-stats.json');
    if (existsSync(bundled)) {
      console.warn('[dict] 在线拉取失败，用打包内置词典：', err.message);
      data = JSON.parse(readFileSync(bundled, 'utf8'));
    } else {
      throw err;
    }
  }
  compiledDict = compileDictionary(data);
  return compiledDict;
}

// ---- 核心流水线 ----
async function handleItemText(text) {
  try {
    if (!compiledDict) await loadDictionary();
    const parsed = parseItemText(text);
    const matched = matchItem(parsed, compiledDict);
    const { query, league, weaponDps } = buildQuery(parsed, matched, {
      tierMax: settings.get('tierMax'),
      includeUntiered: settings.get('includeUntiered'),
      league: settings.get('league'),
      dps: settings.get('dpsEnabled'),
      dpsRangePercent: settings.get('dpsRangePercent'),
    });
    const url = await encodeTradeUrl(query, league, settings.get('host'));

    const hitCount = matched.filter((m) => m.match).length;
    const totalFilters = query.stats[0].filters.length;
    const enabledCount = query.stats[0].filters.filter((f) => !f.disabled).length;
    lastResult = { parsed, matched, query, url, hitCount, enabledCount, weaponDps };

    rebuildTrayMenu();

    // 防线：一条词缀都没匹配上时不打开空查询（避免无意义页面），提示用户检查
    if (totalFilters === 0) {
      notify(`⚠ ${parsed.name || parsed.baseName || '装备'}：未匹配到任何词缀（命中 0/${matched.length}），未打开市集。请确认复制的是高级描述文本（Ctrl+Alt+C）。`);
      return;
    }

    notify(`已解析 ${parsed.name || parsed.baseName || '装备'}：命中 ${hitCount}/${matched.length} 词缀，启用 ${enabledCount} 条`, url);

    if (settings.get('autoOpen')) {
      shell.openExternal(url);
    }
  } catch (err) {
    console.error('[handleItemText]', err);
    notify(`解析失败：${err.message}`);
  }
}

// ---- 通知（macOS 用 tray.setTitle，跨平台用 Notification）----
function notify(body, url) {
  try {
    if (Notification.isSupported()) {
      const n = new Notification({ title: 'PoE2 查价助手', body });
      if (url) n.on('click', () => shell.openExternal(url));
      n.show();
    }
  } catch { /* 通知不可用则忽略 */ }
  if (process.platform === 'darwin' && tray) {
    tray.setTitle(' ✓');
    setTimeout(() => tray && tray.setTitle(''), 2500);
  }
}

// ---- 托盘图标 ----
function makeTrayIcon() {
  // 16x16 模板图（纯黑+alpha），macOS 自动适配明暗；这里用内嵌 PNG 占位
  // 正式图标应放 assets/iconTemplate.png + @2x
  const iconPath = join(ROOT, 'assets', 'iconTemplate.png');
  if (existsSync(iconPath)) {
    const img = nativeImage.createFromPath(iconPath);
    img.setTemplateImage(true);
    return img;
  }
  // 兜底：16x16 实心圆点 PNG（data URL）
  return nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHklEQVR42mNgGAWjYBSMglEwCkbBKBgFo2AUjAIAE6AAfH2v7iYAAAAASUVORK5CYII='
  );
}

function rebuildTrayMenu() {
  if (!tray) return;
  const enabled = settings.get('enabled');
  const template = [
    { label: enabled ? '⏸ 暂停监听' : '▶ 启用监听', click: () => toggleEnabled() },
    { label: '监听：热键 Ctrl+Alt+C', enabled: false },
    { label: '📋 立即解析剪贴板', click: () => parseNow() },
    { type: 'separator' },
  ];

  if (lastResult) {
    const { parsed, hitCount, enabledCount, url, weaponDps } = lastResult;
    template.push(
      { label: `最近：${parsed.name || parsed.baseName || '装备'} (${hitCount}命中/${enabledCount}启用)`, enabled: false },
    );
    if (weaponDps) {
      const { display } = weaponDps;
      const dpsSummary = [
        display.pDPS != null ? `物理 ${display.pDPS}` : '',
        display.eDPS != null ? `元素 ${display.eDPS}` : '',
        display.totalDPS != null ? `总 ${display.totalDPS}` : '',
      ].filter(Boolean).join(' / ');
      const dpsFilters = lastResult.query.filters.equipment_filters?.filters;
      const thresholdSummary = ['pdps', 'edps', 'dps']
        .filter((key) => dpsFilters?.[key]?.min != null)
        .map((key) => `${{ pdps: '物理', edps: '元素', dps: '总' }[key]}≥${dpsFilters[key].min}`)
        .join(' / ');
      template.push(
        { label: `武器面板 DPS：${dpsSummary}`, enabled: false },
        { label: thresholdSummary ? `搜索下限：${thresholdSummary}` : 'DPS 仅计算，不写入筛选', enabled: false },
        { label: '📋 复制 DPS 明细', click: () => clipboard.writeText(JSON.stringify(weaponDps, null, 2)) },
      );
    }
    template.push(
      { label: '🔗 重新打开市集', click: () => shell.openExternal(url) },
      { label: '📄 复制查询 JSON', click: () => clipboard.writeText(JSON.stringify(lastResult.query, null, 2)) },
      { type: 'separator' },
    );
  }

  template.push(
    { label: `自动打开市集：${settings.get('autoOpen') ? '开' : '关'}`, click: () => { settings.set('autoOpen', !settings.get('autoOpen')); rebuildTrayMenu(); } },
    { label: `联赛：${settings.get('league')}`, click: () => changeLeague() },
    { label: '⚙ 设置…', click: () => openSettings() },
    { label: '🔄 刷新词典', click: async () => { await loadDictionary(true); notify('词典已刷新'); } },
    { type: 'separator' },
    { label: '退出', click: () => { app.quit(); } },
  );

  tray.setContextMenu(Menu.buildFromTemplate(template));
  tray.setToolTip('PoE2 云游戏查价助手');
}

function toggleEnabled() {
  const next = !settings.get('enabled');
  settings.set('enabled', next);
  watcher.setEnabled(next);
  rebuildTrayMenu();
}

function parseNow() {
  // 手动兜底：直接读当前剪贴板走流水线（不依赖热键）
  const text = clipboard.readText();
  if (text && looksLikeItemText(text)) handleItemText(text);
  else notify('剪贴板里没有装备文本，请先在游戏内 Ctrl+Alt+C 复制');
}

function changeLeague() {
  openSettings();
}

function openSettings() {
  if (settingsWin) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 420, height: 480, title: '查价助手设置',
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true },
  });
  settingsWin.loadFile(join(__dirname, 'settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

// ---- 热键旁听（唯一监听方式；无权限/启动失败 → 提醒并退出）----
function hasAccessibilityPermission() {
  if (process.platform !== 'darwin') return true; // Windows 无此门槛
  try { return systemPreferences.isTrustedAccessibilityClient(false); }
  catch { return false; }
}

// 弹窗提醒后退出。用同步对话框确保用户看到原因（纯托盘应用没有窗口可依附）。
function alertAndQuit(title, message) {
  try {
    dialog.showMessageBoxSync({ type: 'error', title, message, buttons: ['退出'] });
  } catch { /* 对话框不可用时至少留下日志 */ }
  console.error(`[exit] ${title}: ${message}`);
  app.quit();
}

function setupWatcher() {
  // 停掉旧监听器
  if (watcher) { try { watcher.stop(); } catch {} watcher = null; }

  // macOS 先查权限：未授权 → 触发系统授权弹窗 + 说明后退出（不再降级轮询）
  if (!hasAccessibilityPermission()) {
    try { systemPreferences.isTrustedAccessibilityClient(true); } catch {} // 弹系统授权提示
    alertAndQuit(
      '需要辅助功能权限',
      '热键监听（Ctrl+Alt+C）需要辅助功能权限。\n\n请到「系统设置 → 隐私与安全性 → 辅助功能」勾选「PoE2查价助手」，然后重新启动应用。'
    );
    return;
  }

  try {
    watcher = new HotkeyWatcher(clipboard, handleItemText, {
      combo: { ctrl: true, alt: true, shift: false, key: 'C' },
      readDelayMs: settings.get('readDelayMs'),
      enabled: settings.get('enabled'),
      looksLikeItemText,
    });
    watcher.start();
  } catch (err) {
    console.error('[hotkey start failed]', err.message);
    alertAndQuit('热键监听启动失败', `${err.message}\n\n请确认已授予辅助功能权限后重新启动。`);
  }
}

// ---- 单实例锁 ----
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => { if (settingsWin) { settingsWin.show(); settingsWin.focus(); } });

  app.whenReady().then(async () => {
    // macOS 隐藏 dock 图标，只留菜单栏（纯托盘应用）
    if (process.platform === 'darwin' && app.dock) app.dock.hide();

    settings = new Settings(app.getPath('userData'));
    // 用打包时从 API 获取的当前联赛作为默认值（用户显式改过则尊重用户设置）
    const meta = readBuildMeta();
    if (meta?.league && !settings.hasUserSet('league')) {
      settings.data.league = meta.league; // 只改运行时默认，不落盘（保持「未设置」状态）
    }
    tray = new Tray(makeTrayIcon());

    setupWatcher(); // 热键旁听；无权限/失败会弹窗并退出
    rebuildTrayMenu();

    // 预加载词典（失败不阻塞，首次解析时重试）
    loadDictionary().catch((e) => console.error('[dict preload]', e.message));

    // ---- 设置窗口 IPC ----
    ipcMain.handle('settings:get', () => settings.all());
    ipcMain.handle('settings:set', (_e, key, value) => {
      settings.set(key, value);
      if (key === 'enabled' && watcher) watcher.setEnabled(value);
      if (key === 'readDelayMs' && watcher) watcher.readDelayMs = value;
      rebuildTrayMenu();
      return true;
    });
    ipcMain.handle('dict:refresh', async () => { await loadDictionary(true); return true; });
    ipcMain.handle('window:close', () => { if (settingsWin) settingsWin.close(); });
  });

  // 纯托盘应用：关窗不退出
  app.on('window-all-closed', (e) => { /* 不 quit，保持托盘 */ });
  app.on('before-quit', () => { if (watcher) watcher.stop(); });
}
