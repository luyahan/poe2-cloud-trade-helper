/**
 * 全局热键旁听（云游戏场景）
 *
 * 关键：listen-only，绝不拦截/消费按键。
 * 云游戏下 Ctrl+Alt+C 必须原样传到远端游戏才会触发复制；
 * 若用 globalShortcut.register 会吞掉按键导致游戏收不到复制指令。
 * 这里用 uiohook-napi 全局钩子只「旁听」，命中后延迟读剪贴板
 * （等远端复制 + 剪贴板同步回本地）。
 *
 * 需要 macOS 辅助功能权限（系统设置→隐私与安全性→辅助功能）。
 * 无权限时 start() 抛错，调用方弹窗提醒并退出（不降级）。
 */

let uiohookModule = null;
function loadUiohook() {
  if (!uiohookModule) {
    // 懒加载：原生模块缺失/未授权时不影响主链路
    uiohookModule = require('uiohook-napi');
  }
  return uiohookModule;
}

class HotkeyWatcher {
  /**
   * @param clipboard  Electron clipboard
   * @param onItem     命中装备文本回调 (text) => void
   * @param opts       { combo:{ctrl,alt,shift,key}, readDelayMs, enabled, looksLikeItemText }
   */
  constructor(clipboard, onItem, opts = {}) {
    this.clipboard = clipboard;
    this.onItem = onItem;
    this.combo = opts.combo ?? { ctrl: true, alt: true, shift: false, key: 'C' };
    this.readDelayMs = opts.readDelayMs ?? 600; // 等云游戏剪贴板同步
    this.enabled = opts.enabled ?? true;
    this.looksLikeItemText = opts.looksLikeItemText ?? (() => true);
    this.started = false;
    this.mods = { ctrl: false, alt: false, shift: false };
    this.lastTrigger = 0;
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._readTimer = null;
  }

  start() {
    if (this.started) return;
    const { uIOhook } = loadUiohook(); // 无权限/缺模块会在此抛错
    uIOhook.on('keydown', this._onKeyDown);
    uIOhook.on('keyup', this._onKeyUp);
    try {
      uIOhook.start();
    } catch (err) {
      // 失败时摘掉已注册的监听器，避免残留
      try {
        uIOhook.removeListener('keydown', this._onKeyDown);
        uIOhook.removeListener('keyup', this._onKeyUp);
      } catch { /* 忽略 */ }
      throw err;
    }
    this.started = true;
  }

  stop() {
    if (!this.started) return;
    try {
      const { uIOhook } = loadUiohook();
      uIOhook.removeListener('keydown', this._onKeyDown);
      uIOhook.removeListener('keyup', this._onKeyUp);
      uIOhook.stop();
    } catch { /* 忽略 */ }
    if (this._readTimer) { clearTimeout(this._readTimer); this._readTimer = null; }
    this.started = false;
    this.mods = { ctrl: false, alt: false, shift: false };
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  _isModKey(keycode, UiohookKey) {
    // Ctrl 左右 / Alt 左右 / Shift 左右
    if (keycode === UiohookKey.Ctrl || keycode === UiohookKey.CtrlRight) return 'ctrl';
    if (keycode === UiohookKey.Alt || keycode === UiohookKey.AltRight) return 'alt';
    if (keycode === UiohookKey.Shift || keycode === UiohookKey.ShiftRight) return 'shift';
    return null;
  }

  _onKeyDown(e) {
    const { UiohookKey } = loadUiohook();
    const mod = this._isModKey(e.keycode, UiohookKey);
    if (mod) { this.mods[mod] = true; return; }
    if (!this.enabled) return;
    // 命中目标键 + 修饰键组合
    const targetKey = UiohookKey[this.combo.key];
    if (e.keycode !== targetKey) return;
    if (!!this.mods.ctrl !== !!this.combo.ctrl) return;
    if (!!this.mods.alt !== !!this.combo.alt) return;
    if (!!this.mods.shift !== !!this.combo.shift) return;
    // 防抖：500ms 内重复触发忽略（按键自动重复）
    const now = Date.now();
    if (now - this.lastTrigger < 500) return;
    this.lastTrigger = now;
    this._scheduleRead();
  }

  _onKeyUp(e) {
    const { UiohookKey } = loadUiohook();
    const mod = this._isModKey(e.keycode, UiohookKey);
    if (mod) this.mods[mod] = false;
  }

  // 延迟读剪贴板：等远端游戏复制 + 云游戏剪贴板同步回本地
  _scheduleRead() {
    if (this._readTimer) clearTimeout(this._readTimer);
    this._readTimer = setTimeout(() => {
      this._readTimer = null;
      let text;
      try { text = this.clipboard.readText(); } catch { return; }
      if (text && this.looksLikeItemText(text)) {
        this.onItem(text);
      }
    }, this.readDelayMs);
  }
}

module.exports = { HotkeyWatcher };
