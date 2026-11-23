import AppKit

// 纯 AppKit 菜单栏应用，零窗口零 SwiftUI Scene
// 启动后只在菜单栏显示放大镜图标，Ctrl+Alt+C 后延迟 600ms 自动查价

@main
class AppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem!
    var quickJS: QuickJSHost!
    var hotkeyManager: HotkeyManager!
    var isReady = false

    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.accessory)  // 无 Dock 图标
        // Swift 手动启动 NSApplication 时需要持有 delegate，直至 app.run() 退出。
        withExtendedLifetime(delegate) {
            app.run()
        }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        // 先创建菜单栏入口，即使脚本初始化失败也允许重载和退出。
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "magnifyingglass", accessibilityDescription: "PoE 查价")
        }
        rebuildMenu()

        quickJS = QuickJSHost()
        do {
            log("[启动] 开始加载 QuickJS 与词典")
            try quickJS.setup()
            isReady = true
            log("[启动] QuickJS 与词典加载完成")
        } catch {
            isReady = false
            quickJS = nil
            log("[启动] QuickJS 初始化失败：\(String(describing: error))")
            rebuildMenu(lastResult: "QuickJS 初始化失败")
            showNotification(title: "QuickJS 初始化失败", body: String(describing: error))
            return
        }

        // 与 Electron 一致：Ctrl+Alt+C 只旁听，等待 600ms 云游戏剪贴板同步。
        hotkeyManager = HotkeyManager(readDelayMs: 600) { [weak self] in
            self?.handleHotkey()
        }
        do {
            try hotkeyManager.register()
            rebuildMenu()
            log("[PoeQuick] 菜单栏已启动：Ctrl+Alt+C 后延迟 600ms 解析剪贴板")
        } catch {
            rebuildMenu(lastResult: "热键监听未授权")
            showNotification(title: "无法监听 Ctrl+Alt+C", body: error.localizedDescription)
            log("[PoeQuick] \(error.localizedDescription)")
        }
    }

    func rebuildMenu(lastResult: String? = nil) {
        let menu = NSMenu()
        if let last = lastResult {
            let item = NSMenuItem(title: last, action: nil, keyEquivalent: "")
            item.isEnabled = false
            menu.addItem(item)
            menu.addItem(NSMenuItem.separator())
        }
        let parseItem = NSMenuItem(title: "解析剪贴板", action: #selector(parseClipboard), keyEquivalent: "")
        parseItem.target = self
        menu.addItem(parseItem)
        menu.addItem(NSMenuItem.separator())
        let reloadItem = NSMenuItem(title: "重新加载 JS", action: #selector(reloadJS), keyEquivalent: "r")
        reloadItem.target = self
        menu.addItem(reloadItem)
        let quitItem = NSMenuItem(title: "退出", action: #selector(quit), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)
        statusItem.menu = menu
    }

    @objc func parseClipboard() {
        log("[PoeQuick] 点击解析剪贴板")
        handleHotkey()
    }

    @objc func reloadJS() {
        do {
            try quickJS.setup()
            isReady = true
            rebuildMenu(lastResult: "已重新加载 JS 与词典")
            showNotification(title: "已重新加载", body: "core.js 与词典已刷新")
        } catch {
            isReady = false
            rebuildMenu(lastResult: "JS 重载失败")
            showNotification(title: "重载失败", body: String(describing: error))
        }
    }

    @objc func quit() {
        NSApp.terminate(nil)
    }

    func handleHotkey() {
        log("[parse] 1/6 读取剪贴板")
        guard isReady, let quickJS else {
            rebuildMenu(lastResult: "QuickJS 未初始化，请先重新加载")
            log("[parse] 停止：QuickJS 未初始化，不能执行查价")
            return
        }
        let pasteboardText = ClipboardReader.read()
        log("[parse] 剪贴板字符数：\(pasteboardText?.count ?? 0)，changeCount：\(NSPasteboard.general.changeCount)")
        guard let text = pasteboardText else {
            rebuildMenu(lastResult: "剪贴板没有文本")
            log("[parse] 停止：NSPasteboard 没有文本")
            return
        }
        log("[parse] 2/6 检查装备文本特征")
        guard ClipboardReader.looksLikeItemText(text) else {
            log("[parse] 停止：未匹配物品类别或稀有度；首行=\(text.components(separatedBy: .newlines).first ?? "")")
            rebuildMenu(lastResult: "未识别到装备文本")
            showNotification(title: "未识别到装备", body: "请确认云游戏已复制，并同步装备文本到本机剪贴板")
            return
        }
        do {
            log("[parse] 3/6 调用 QuickJS")
            let result = try quickJS.parseAndQuery(text: text, league: "周年庆巅峰挑战")
            log("[parse] 4/6 QuickJS 返回，键：\(result.keys.sorted().joined(separator: ","))")
            if let urlString = result["url"] as? String,
               let url = URL(string: urlString) {
                let summary = result["summary"] as? String ?? "已打开市集"
                rebuildMenu(lastResult: summary)
                log("[parse] 5/6 \(summary)，URL 长度：\(urlString.count)")
                let opened = NSWorkspace.shared.open(url)
                log("[parse] 6/6 NSWorkspace.open 返回：\(opened)")
            } else if let error = result["error"] as? String {
                rebuildMenu(lastResult: "解析失败")
                log("[parse] JS 错误：\(error)")
                showNotification(title: "解析失败", body: error)
            } else {
                rebuildMenu(lastResult: "没有生成 URL")
                log("[parse] 停止：结果中没有 URL 或 error")
            }
        } catch {
            rebuildMenu(lastResult: "执行失败")
            log("[parse] 异常：\(String(describing: error))")
            showNotification(title: "执行失败", body: String(describing: error))
        }
    }

    func log(_ message: String) {
        FileHandle.standardOutput.write(Data("\(message)\n".utf8))
    }

    func showNotification(title: String, body: String) {
        let notification = NSUserNotification()
        notification.title = title
        notification.informativeText = body
        NSUserNotificationCenter.default.deliver(notification)
    }
}
