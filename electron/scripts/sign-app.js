#!/usr/bin/env node
/**
 * 对 electron-builder 产出的 .app 做 ad-hoc 签名（含 entitlements）。
 *
 * identity:null 时 builder 跳过签名，新 macOS 上 Electron 的 V8 JIT 被拒 → 闪退。
 * 必须带 entitlements 重签，--deep 会传给所有嵌套 Helper/Framework。
 *
 * 用法：node scripts/sign-app.js [arm64|x64]（默认 arm64）
 */

const { execFileSync } = require('node:child_process');
const { join } = require('node:path');
const { existsSync, readdirSync } = require('node:fs');

const ROOT = join(__dirname, '..');
const pkg = require(join(ROOT, 'package.json'));
const name = pkg.build.productName || pkg.name;
const version = pkg.version;

const arch = process.argv[2] || 'arm64';
// electron-builder 目录约定：arm64 → dist/mac-arm64，x64 → dist/mac
const appDir = join(ROOT, 'dist', arch === 'x64' ? 'mac' : `mac-${arch}`);
const app = readdirSync(appDir).find((f) => f.endsWith('.app'));
if (!app) { console.error(`[sign] ${appDir} 里没有 .app`); process.exit(1); }

const appPath = join(appDir, app);
const entitlements = join(ROOT, 'build', 'entitlements.mac.plist');

console.log(`[sign] ${appPath}`);
execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--entitlements', entitlements, appPath], { stdio: 'inherit' });
execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
console.log(`[sign] ✓ ${name} ${version} (${arch}) 签名完成`);
console.log(`[sign] 产物：${appPath}`);
console.log(`[sign] 安装：ditto "${appPath}" "/Applications/${app}"`);