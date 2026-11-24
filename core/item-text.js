/**
 * 剪贴板文本识别（供热键旁听命中后与「立即解析」使用）
 *
 * 云游戏会把远端剪贴板同步回本地；热键命中后延迟读剪贴板，
 * 用这里的特征判断确认拿到的是装备高级描述文本。
 */

// 装备文本特征：必须含「物品类别:」或「稀有度:」，且通常有分隔线
function looksLikeItemText(text) {
  if (!text || text.length < 20) return false;
  const hasHeader = /^物品类别:/m.test(text) || /^稀有度:/m.test(text);
  if (!hasHeader) return false;
  // 排除明显不是装备的（如纯 URL、代码）
  if (/^https?:\/\//.test(text.trim())) return false;
  return true;
}

module.exports = { looksLikeItemText };
