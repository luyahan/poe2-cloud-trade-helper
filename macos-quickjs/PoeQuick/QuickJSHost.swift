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
        guard let coreURL = Bundle.main.url(forResource: "core", withExtension: "js"),
              let coreSource = try? String(contentsOf: coreURL) else {
            throw NSError(domain: "PoeQuick", code: 1, userInfo: [NSLocalizedDescriptionKey: "core.js 未找到"])
        }
        _ = try context.evaluate(coreSource, options: EvalOptions(type: .module))

        // 加载词典 bjson 二进制，作为全局 ArrayBuffer 传入
        guard let binURL = Bundle.main.url(forResource: "cn-stats.qjs", withExtension: "bin") else {
            throw NSError(domain: "PoeQuick", code: 2, userInfo: [NSLocalizedDescriptionKey: "cn-stats.qjs.bin 未找到"])
        }
        let binData = try Data(contentsOf: binURL)
        let base64 = binData.base64EncodedString()

        // 在 JS 中用 qjs:bjson 反序列化
        let loader = """
            import * as bjson from 'qjs:bjson';
            const binaryString = atob('\(base64)');
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            globalThis.compiledDict = bjson.read(bytes.buffer, 0, bytes.byteLength);
        """
        _ = try context.evaluate(loader, options: EvalOptions(type: .module))
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
