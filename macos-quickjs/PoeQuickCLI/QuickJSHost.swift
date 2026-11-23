import Foundation
import QuickJS
import AppKit

class QuickJSHost {
    var runtime: JSRuntime!
    var context: JSContext!

    func setup() throws {
        // 创建 Runtime（限制内存 32 MB）
        runtime = JSRuntime(options: JSRuntimeOptions(
            memoryLimit: 32 * 1024 * 1024,
            enableStdModules: true,
            enableHelpers: true
        ))!
        context = runtime.createContext()!

        // 注入宿主模块 Host
        context.module("Host") {
            JSModuleFunction("log", argc: 1) { ctx, _, _, argv in
                if let argv = argv, let v = JSValue(ctx, value: argv[0]) {
                    print("[JS] \(v.string ?? "")")
                }
                return nil
            }
            JSModuleFunction("openURL", argc: 1) { ctx, _, _, argv in
                if let argv = argv, let v = JSValue(ctx, value: argv[0]) {
                    if let urlStr = v.string, let url = URL(string: urlStr) {
                        DispatchQueue.main.async {
                            NSWorkspace.shared.open(url)
                        }
                    }
                }
                return nil
            }
        }

        // 加载 core.js（解析器 + 查询构造）
        guard let coreURL = Bundle.module.url(forResource: "core", withExtension: "js"),
              let coreSource = try? String(contentsOf: coreURL) else {
            throw NSError(domain: "PoeQuick", code: 1, userInfo: [NSLocalizedDescriptionKey: "core.js 未找到"])
        }
        do {
            _ = try context.evaluate(coreSource, options: EvalOptions(type: .module))
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
            _ = try context.evaluate(dictSource)
        } catch let e as JSError {
            print("[setup] 词典加载失败: \(e)")
            throw e
        }
    }

    func parseAndQuery(text: String, league: String) throws -> [String: Any] {
        // 把剪贴板文本安全传入 JS
        let escaped = text.replacingOccurrences(of: "\\", with: "\\\\")
                         .replacingOccurrences(of: "`", with: "\\`")
                         .replacingOccurrences(of: "${", with: "\\${")
        let js = """
            (function() {
                try {
                    const result = globalThis.parseAndQueryPrice(`\(escaped)`, '\(league)');
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
