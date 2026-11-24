import Foundation
#if canImport(Darwin)
import Darwin
#endif

// 命令行测试入口：验证 QuickJS + JS 字面量词典 + 解析器工作正常
// 用法：swift run PoeQuickCLI [--help]
// 注意：这个 target 仅用于开发期验证，正式分发用纯 AppKit 菜单栏应用。

let helpText = """
PoeQuickCLI — PoE2 查价逻辑开发验证入口

用法:
  PoeQuickCLI [选项] [装备文本文件]
  PoeQuickCLI [选项] -            # 从标准输入读取装备文本

选项:
  -h, --help           显示本帮助并退出
  -l, --league <名称>  指定联赛（默认：周年庆巅峰挑战）
  --league=<名称>      同上，等号写法
  --poessid <值>       POESESSID；提供后调用交易 API 取前 10 个挂单价格
                       也可用环境变量 POESESSID（推荐，避免留在 shell 历史）

参数:
  装备文本文件          UTF-8 装备复制文本；省略则跑内置样本
  -                     从标准输入读取装备文本

说明:
  流程：初始化 QuickJS → 解析装备文本 → 匹配词缀 → 构造市集查询 →
  打印摘要与 URL 长度 → 重载 QuickJS 验证资源可安全释放。
  本命令仅用于开发期自检；正式使用请运行 PoeQuick 菜单栏应用。
  POESESSID 只保存在进程内存，不写入仓库或日志；退出登录后即失效。

示例:
  swift run PoeQuickCLI
  ./.build/debug/PoeQuickCLI --help
  ./.build/debug/PoeQuickCLI ../data/sample-hateforge.txt
  ./.build/debug/PoeQuickCLI -l 永久 ../data/sample-spear.txt
  cat ../data/sample-item.txt | ./.build/debug/PoeQuickCLI -
  POESESSID=xxx ./.build/debug/PoeQuickCLI ../data/sample-item.txt
"""

func cliFail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("\(message)\n使用 --help 查看用法。\n".utf8))
    exit(2)
}

let args = Array(CommandLine.arguments.dropFirst())
var league = "周年庆巅峰挑战"
var cliSessionId: String?
var inputFile: String?
var readStdin = false

var i = 0
while i < args.count {
    let arg = args[i]
    switch arg {
    case "-h", "--help":
        print(helpText)
        exit(0)
    case "-l", "--league":
        guard i + 1 < args.count else { cliFail("\(arg) 缺少联赛名称") }
        i += 1
        league = args[i]
    case let a where a.hasPrefix("--league="):
        league = String(a.dropFirst("--league=".count))
    case "--poessid", "--poesessid":
        guard i + 1 < args.count else { cliFail("\(arg) 缺少 POESESSID") }
        i += 1
        cliSessionId = args[i]
    case let a where a.hasPrefix("--poessid="):
        cliSessionId = String(a.dropFirst("--poessid=".count))
    case let a where a.hasPrefix("--poesessid="):
        cliSessionId = String(a.dropFirst("--poesessid=".count))
    case "-":
        readStdin = true
    case let a where a.hasPrefix("-"):
        cliFail("未知参数: \(a)")
    default:
        guard inputFile == nil else { cliFail("只能指定一个装备文本文件") }
        inputFile = arg
    }
    i += 1
}
if league.isEmpty { cliFail("联赛名称不能为空") }
if readStdin && inputFile != nil { cliFail("不能同时指定装备文本文件和标准输入") }

// 命令行参数优先，其次环境变量；不打印、不落盘。
let sessionId = (cliSessionId ?? ProcessInfo.processInfo.environment["POESESSID"])?
    .trimmingCharacters(in: .whitespacesAndNewlines)

let inputText: String?
if readStdin {
    guard let text = String(data: FileHandle.standardInput.readDataToEndOfFile(), encoding: .utf8),
          !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
        cliFail("标准输入为空或不是 UTF-8 文本")
    }
    inputText = text
} else if let path = inputFile {
    guard let text = try? String(contentsOfFile: path, encoding: .utf8) else {
        cliFail("无法读取装备文本文件: \(path)")
    }
    inputText = text
} else {
    inputText = nil  // 使用下方内置样本
}

func apiData(_ request: URLRequest) throws -> Data {
    let semaphore = DispatchSemaphore(value: 0)
    var responseData: Data?
    var responseError: Error?
    var httpResponse: HTTPURLResponse?
    URLSession.shared.dataTask(with: request) { data, response, error in
        responseData = data
        httpResponse = response as? HTTPURLResponse
        responseError = error
        semaphore.signal()
    }.resume()
    semaphore.wait()

    if let error = responseError { throw error }
    guard let http = httpResponse else {
        throw NSError(domain: "PoeQuickCLI", code: 10,
                      userInfo: [NSLocalizedDescriptionKey: "交易 API 无 HTTP 响应"])
    }
    guard (200..<300).contains(http.statusCode) else {
        let body = responseData.flatMap { String(data: $0, encoding: .utf8) } ?? ""
        throw NSError(domain: "PoeQuickCLI", code: 11,
                      userInfo: [NSLocalizedDescriptionKey: "HTTP \(http.statusCode): \(String(body.prefix(200)))"])
    }
    return responseData ?? Data()
}

func priceNumber(_ value: Any?) -> String {
    guard let number = value as? NSNumber else { return "?" }
    let double = number.doubleValue
    if double.truncatingRemainder(dividingBy: 1) == 0 {
        return String(format: "%.0f", double)
    }
    return String(format: "%.2f", double)
}

func fetchTopPrices(query: [String: Any], league: String, sessionId: String) throws {
    let encodedLeague = league.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? league
    guard let searchURL = URL(string: "https://poe.game.qq.com/api/trade2/search/poe2/\(encodedLeague)") else {
        throw NSError(domain: "PoeQuickCLI", code: 12,
                      userInfo: [NSLocalizedDescriptionKey: "搜索 URL 构造失败"])
    }
    // 与浏览器请求不同：POST body 必须在扁平 query 外再包一层 + sort。
    let body = try JSONSerialization.data(withJSONObject: ["query": query, "sort": ["price": "asc"]])
    var searchRequest = URLRequest(url: searchURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
    searchRequest.httpMethod = "POST"
    searchRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
    searchRequest.setValue("application/json", forHTTPHeaderField: "Accept")
    searchRequest.setValue("POESESSID=\(sessionId)", forHTTPHeaderField: "Cookie")
    searchRequest.httpBody = body

    let searchData = try apiData(searchRequest)
    guard let searchJson = try? JSONSerialization.jsonObject(with: searchData) as? [String: Any],
          let searchId = searchJson["id"] as? String,
          let matchedIds = searchJson["result"] as? [String] else {
        throw NSError(domain: "PoeQuickCLI", code: 13,
                      userInfo: [NSLocalizedDescriptionKey: "搜索响应格式异常"])
    }
    let total = (searchJson["total"] as? NSNumber)?.intValue ?? matchedIds.count
    let ids = Array(matchedIds.prefix(10))
    print("[CLI] 命中 \(total) 条，取前 \(ids.count) 条价格…")
    guard !ids.isEmpty else { return }

    // search 限流 3 次/5 秒、fetch 6 次/10 秒；这里各只发一次，中间稍作间隔。
    Thread.sleep(forTimeInterval: 0.25)
    guard var components = URLComponents(string: "https://poe.game.qq.com/api/trade2/fetch/\(ids.joined(separator: ","))") else {
        throw NSError(domain: "PoeQuickCLI", code: 14,
                      userInfo: [NSLocalizedDescriptionKey: "fetch URL 构造失败"])
    }
    components.queryItems = [
        URLQueryItem(name: "query", value: searchId),
        URLQueryItem(name: "realm", value: "poe2"),
    ]
    guard let fetchURL = components.url else {
        throw NSError(domain: "PoeQuickCLI", code: 15,
                      userInfo: [NSLocalizedDescriptionKey: "fetch URL 编码失败"])
    }
    var fetchRequest = URLRequest(url: fetchURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
    fetchRequest.setValue("application/json", forHTTPHeaderField: "Accept")
    fetchRequest.setValue("POESESSID=\(sessionId)", forHTTPHeaderField: "Cookie")

    let fetchData = try apiData(fetchRequest)
    guard let fetchJson = try? JSONSerialization.jsonObject(with: fetchData) as? [String: Any],
          let listings = fetchJson["result"] as? [[String: Any]] else {
        throw NSError(domain: "PoeQuickCLI", code: 16,
                      userInfo: [NSLocalizedDescriptionKey: "fetch 响应格式异常"])
    }
    for (index, entry) in listings.prefix(10).enumerated() {
        let listing = entry["listing"] as? [String: Any]
        let price = listing?["price"] as? [String: Any]
        let amount = priceNumber(price?["amount"])
        let currency = price?["currency"] as? String ?? "?"
        let item = entry["item"] as? [String: Any]
        let name = [item?["name"] as? String, item?["typeLine"] as? String]
            .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " ")
        let seller = ((listing?["account"] as? [String: Any])?["name"] as? String) ?? "-"
        print(String(format: "[CLI] %2d. %@ %@ | %@ | 卖家 %@",
                     index + 1, amount, currency, name.isEmpty ? "(无名物品)" : name, seller))
    }
}

let host = QuickJSHost()
do {
    print("[CLI] 初始化 QuickJS…")
    let t0 = Date()
    try host.setup()
    print("[CLI] 初始化耗时: \(Date().timeIntervalSince(t0) * 1000) ms")

    let builtinSample = """
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

    print("[CLI] 输入: \(inputFile ?? (readStdin ? "标准输入" : "内置样本"))")
    print("[CLI] 联赛: \(league)")

    let t1 = Date()
    let result = try host.parseAndQuery(text: inputText ?? builtinSample, league: league)
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

    if let sessionId = sessionId, !sessionId.isEmpty {
        if let query = result["query"] as? [String: Any] {
            do {
                try fetchTopPrices(query: query, league: league, sessionId: sessionId)
            } catch {
                FileHandle.standardError.write(Data("[CLI] 查价失败: \(error.localizedDescription)\n".utf8))
            }
        } else {
            FileHandle.standardError.write(Data("[CLI] 查价失败: 解析结果里没有 query\n".utf8))
        }
    }

    // 回归检查：重载一次 QuickJS，确认旧 Runtime/Context 能安全释放。
    print("[CLI] 重载 QuickJS（回归检查）…")
    try host.setup()
    print("[CLI] 重载完成")
} catch {
    print("[CLI] 失败: \(error.localizedDescription)")
}
