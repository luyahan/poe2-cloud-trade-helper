import Foundation

// 命令行测试入口：验证 QuickJS + JS 字面量词典 + 解析器工作正常
// 用法：swift run PoeQuickCLI
// 注意：这个 target 仅用于开发期验证，正式分发用纯 AppKit 菜单栏应用。

let host = QuickJSHost()
do {
    print("[CLI] 初始化 QuickJS…")
    let t0 = Date()
    try host.setup()
    print("[CLI] 初始化耗时: \(Date().timeIntervalSince(t0) * 1000) ms")

    let sample = """
    物品类别: 手套
    稀有度: 传奇
    仇恨熔炉
    铸锻护手
    --------
    护甲: 394 (augmented)
    --------
    需求： 等级 60, 39 (augmented) 力量
    --------
    插槽: S
    --------
    物品等级: 82
    --------
    攻击每击中一名敌人获得3点生命 (rune)
    攻击每击中一名敌人获得1点魔力 (rune)
    --------
    { 传奇属性 — 护甲 }
    护甲提高 343 (300-400)%
    { 传奇属性 }
    击中时获得 6 (3-6) 点怒火
    { 传奇属性 }
    处于怒火上限状态时，获得一个随机能量球，每 5.92 (3-6) 秒只能获得一次
    { 瓦尔传奇词缀 }
    过去 20 秒内每使用一次需要荣耀的技能时，怒火上限 +8 (8-10)
    { 传奇属性 }
    +9 (-10-+10) 怒火上限
    --------
    被腐化
    """

    let t1 = Date()
    let result = try host.parseAndQuery(text: sample, league: "周年庆巅峰挑战")
    let elapsed = Date().timeIntervalSince(t1) * 1000
    print("[CLI] 解析+构造耗时: \(String(format: "%.2f", elapsed)) ms")

    if let summary = result["summary"] as? String {
        print("[CLI] 摘要: \(summary)")
    }
    if let url = result["url"] as? String {
        print("[CLI] URL 长度: \(url.count) 字符")
        print("[CLI] URL 前缀: \(url.prefix(80))…")
    }
    if let error = result["error"] as? String {
        print("[CLI] 错误: \(error)")
    }
} catch {
    print("[CLI] 失败: \(error.localizedDescription)")
}
