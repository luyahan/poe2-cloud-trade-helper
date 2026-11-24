import Foundation
import QuickJS
import AppKit

class QuickJSHost {
    var runtime: JSRuntime!
    var context: JSContext!

    func setup() throws {
        log("创建 JSRuntime")
        // 先在局部变量里完成初始化，全部成功后才替换旧实例：
        // 1) 重载失败时旧 Runtime/Context 仍可用；
        // 2) 旧 Context 的析构发生在赋值之后，避免半初始化对象被释放。
        let newRuntime = JSRuntime(options: JSRuntimeOptions(
            memoryLimit: 32 * 1024 * 1024,
            enableStdModules: true,
            enableHelpers: true
        ))!
        let newContext = newRuntime.createContext()!

        // 注意：不要再注册 Host 模块。core.js 已打包为自包含脚本，不使用 Host；
        // 而 QuickJS-Swift 的 JSContext 析构会按声明顺序先释放 runtime，
        // 再释放 modules/hostFunctions 里的 JSFunction。若这里注册了模块，
        // JS_FreeRuntime 时这些 JS 对象仍在 gc_obj_list 中，触发断言崩溃。

        // 裸二进制使用 SwiftPM 的 Bundle.module；.app 优先读取 Bundle.main。
        let coreURL = try resourceURL(name: "core", extension: "js")
        log("加载 core.js：\(coreURL.path)")
        let coreSource = try String(contentsOf: coreURL, encoding: .utf8)
        // core.js 为自包含脚本，按全局脚本执行，避免模块加载器异步执行。
        _ = try newContext.evaluate(coreSource, options: EvalOptions(filename: coreURL.path))

        // 编译期生成的 JS 字面量，不依赖 QuickJS 私有的二进制格式。
        let dictURL = try resourceURL(name: "cn-stats.compiled", extension: "js")
        log("加载词典：\(dictURL.path)")
        let dictSource = try String(contentsOf: dictURL, encoding: .utf8)
        _ = try newContext.evaluate(dictSource, options: EvalOptions(filename: dictURL.path))

        // 全部加载成功后再原子替换，旧 Context 会在这里被释放。
        runtime = newRuntime
        context = newContext
    }

    private func resourceURL(name: String, extension ext: String) throws -> URL {
        // .app 的 MacOS/core.js 优先；裸二进制使用 SwiftPM 资源包。
        if let url = Bundle.main.url(forResource: name, withExtension: ext) {
            return url
        }
        if let url = Bundle.module.url(forResource: name, withExtension: ext) {
            return url
        }
        throw NSError(
            domain: "PoeQuick",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: "资源 \(name).\(ext) 未找到"]
        )
    }

    func parseAndQuery(text: String, league: String) throws -> [String: Any] {
        // JSON 字符串字面量比手工转义安全，兼容引号、换行和 JS 模板字符。
        let argumentsData = try JSONSerialization.data(withJSONObject: [text, league])
        guard let arguments = String(data: argumentsData, encoding: .utf8) else {
            throw hostError("剪贴板文本编码失败", code: 2)
        }
        let js = """
            (function() {
                try {
                    const [text, league] = \(arguments);
                    const result = globalThis.parseAndQueryPrice(text, league);
                    return JSON.stringify(result);
                } catch (error) {
                    return JSON.stringify({error: String(error && error.stack || error)});
                }
            })();
        """
        let result = try context.evaluate(js)
        log("JS evaluate 返回")
        guard let jsonString = result.string,
              let data = jsonString.data(using: .utf8),
              let dict = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw hostError("JS 返回格式错误", code: 3)
        }
        if dict["error"] != nil {
            return dict
        }
        guard let query = dict["query"] as? [String: Any],
              let leagueName = dict["league"] as? String else {
            throw hostError("查询参数缺失", code: 4)
        }
        let queryData = try JSONSerialization.data(withJSONObject: query)
        guard let compressed = try gzip(queryData) else {
            throw hostError("市集查询参数 gzip 压缩失败", code: 5)
        }
        log("gzip 完成，\(compressed.count) 字节")
        let base64url = compressed.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        let encodedLeague = leagueName.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? leagueName
        var mutable = dict
        mutable["url"] = "https://poe.game.qq.com/trade2/search/poe2/\(encodedLeague)/\(base64url)"
        return mutable
    }

    private func log(_ message: String) {
        FileHandle.standardOutput.write(Data("[QuickJSHost] \(message)\n".utf8))
    }

    private func hostError(_ description: String, code: Int) -> NSError {
        NSError(domain: "PoeQuick", code: code, userInfo: [NSLocalizedDescriptionKey: description])
    }

    private func gzip(_ data: Data) throws -> Data? {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/gzip")
        process.arguments = ["-c"]
        let inputPipe = Pipe()
        let outputPipe = Pipe()
        process.standardInput = inputPipe
        process.standardOutput = outputPipe
        process.standardError = Pipe()
        try process.run()
        inputPipe.fileHandleForWriting.write(data)
        try inputPipe.fileHandleForWriting.close()
        let compressed = outputPipe.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        return process.terminationStatus == 0 ? compressed : nil
    }
}
