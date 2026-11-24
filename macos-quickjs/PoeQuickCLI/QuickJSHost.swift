import Foundation
import QuickJS
import AppKit

class QuickJSHost {
    var runtime: JSRuntime!
    var context: JSContext!

    func setup() throws {
        // 创建 Runtime（限制内存 32 MB）。与 App target 一样，全部加载成功后
        // 才替换旧实例；同时不要注册 Host 模块，避免 JSContext 析构顺序触发
        // QuickJS 的 gc_obj_list 断言。
        let newRuntime = JSRuntime(options: JSRuntimeOptions(
            memoryLimit: 32 * 1024 * 1024,
            enableStdModules: true,
            enableHelpers: true
        ))!
        let newContext = newRuntime.createContext()!

        // 加载 core.js（解析器 + 查询构造）
        guard let coreURL = Bundle.module.url(forResource: "core", withExtension: "js"),
              let coreSource = try? String(contentsOf: coreURL) else {
            throw NSError(domain: "PoeQuick", code: 1, userInfo: [NSLocalizedDescriptionKey: "core.js 未找到"])
        }
        do {
            _ = try newContext.evaluate(coreSource, options: EvalOptions(type: .module))
        } catch let e as JSError {
            print("[setup] core.js 执行失败: \(e)")
            throw e
        }

        // 加载词典 JS 字面量（编译期生成，QuickJS 直接 evaluate，~5ms）
        guard let dictURL = Bundle.module.url(forResource: "cn-stats.compiled", withExtension: "js"),
              let dictSource = try? String(contentsOf: dictURL) else {
            throw NSError(domain: "PoeQuick", code: 2, userInfo: [NSLocalizedDescriptionKey: "cn-stats.compiled.js 未找到"])
        }
        do {
            _ = try newContext.evaluate(dictSource)
        } catch let e as JSError {
            print("[setup] 词典加载失败: \(e)")
            throw e
        }

        runtime = newRuntime
        context = newContext
    }

    func parseAndQuery(text: String, league: String) throws -> [String: Any] {
        // JSON 字符串字面量比手工转义安全，兼容引号、换行和 JS 模板字符。
        let argumentsData = try JSONSerialization.data(withJSONObject: [text, league])
        guard let arguments = String(data: argumentsData, encoding: .utf8) else {
            throw NSError(domain: "PoeQuick", code: 4, userInfo: [NSLocalizedDescriptionKey: "参数编码失败"])
        }
        let js = """
            (function() {
                try {
                    const [text, league] = \(arguments);
                    const result = globalThis.parseAndQueryPrice(text, league);
                    return JSON.stringify(result);
                } catch (e) {
                    return JSON.stringify({error: String(e && e.stack || e)});
                }
            })();
        """
        let result = try context.evaluate(js)
        guard let jsonStr = result.string,
              let data = jsonStr.data(using: .utf8),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw NSError(domain: "PoeQuick", code: 3, userInfo: [NSLocalizedDescriptionKey: "JS 返回格式错误"])
        }

        // Swift 层做 gzip + base64url 编码
        if let query = dict["query"] as? [String: Any],
           let league = dict["league"] as? String,
           let queryData = try? JSONSerialization.data(withJSONObject: query),
           let compressed = gzip(queryData) {
            let base64url = compressed.base64EncodedString()
                .replacingOccurrences(of: "+", with: "-")
                .replacingOccurrences(of: "/", with: "_")
                .replacingOccurrences(of: "=", with: "")
            let encodedLeague = league.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? league
            let url = "https://poe.game.qq.com/trade2/search/poe2/\(encodedLeague)/\(base64url)"
            var mutable = dict
            mutable["url"] = url
            return mutable
        }
        return dict
    }

    // 用系统 gzip 命令压缩（QuickJS 不提供 zlib，这里走 Process 调 /usr/bin/gzip）
    private func gzip(_ data: Data) -> Data? {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/gzip")
        process.arguments = ["-c"]
        let inputPipe = Pipe()
        let outputPipe = Pipe()
        process.standardInput = inputPipe
        process.standardOutput = outputPipe
        process.standardError = Pipe()
        do {
            try process.run()
            inputPipe.fileHandleForWriting.write(data)
            try inputPipe.fileHandleForWriting.close()
            let compressed = outputPipe.fileHandleForReading.readDataToEndOfFile()
            process.waitUntilExit()
            return process.terminationStatus == 0 ? compressed : nil
        } catch {
            return nil
        }
    }
}
