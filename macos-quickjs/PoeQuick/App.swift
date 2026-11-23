import SwiftUI
import QuickJS
import AppKit
import Carbon

@main
struct PoeQuickApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        // 菜单栏应用，无窗口
        Settings {
            EmptyView()
        }
    }
}

class AppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem!
    var quickJS: QuickJSHost!
    var hotkeyManager: HotkeyManager!

    func applicationDidFinishLaunching(_ notification: Notification) {
        // 隐藏 Dock 图标
        NSApp.setActivationPolicy(.accessory)

        // 初始化 QuickJS
        quickJS = QuickJSHost()
        do {
            try quickJS.setup()
        } catch {
            showNotification(title: "QuickJS 初始化失败", body: error.localizedDescription)
            return
        }

        // 菜单栏图标
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "magnifyingglass", accessibilityDescription: "PoE 查价")
        }
        rebuildMenu()

        // 注册热键 Cmd+Shift+D
        hotkeyManager = HotkeyManager { [weak self] in
            self?.handleHotkey()
        }
        hotkeyManager.register()
    }

    func rebuildMenu(lastResult: String? = nil) {
        let menu = NSMenu()
        if let last = lastResult {
            let item = NSMenuItem(title: last, action: nil, keyEquivalent: "")
            item.isEnabled = false
            menu.addItem(item)
            menu.addItem(NSMenuItem.separator())
        }
        menu.addItem(NSMenuItem(title: "🔄 重新加载 JS", action: #selector(reloadJS), keyEquivalent: "r"))
        menu.addItem(NSMenuItem(title: "❌ 退出", action: #selector(quit), keyEquivalent: "q"))
        statusItem.menu = menu
    }

    @objc func reloadJS() {
        do {
            try quickJS.setup()
            showNotification(title: "已重新加载", body: "core.js 与词典已刷新")
        } catch {
            showNotification(title: "重载失败", body: error.localizedDescription)
        }
    }

    @objc func quit() {
        NSApp.terminate(nil)
    }

    func handleHotkey() {
        guard let text = ClipboardReader.read() else {
            showNotification(title: "剪贴板为空", body: "请先在游戏中按 Ctrl+Alt+C 复制装备")
            return
        }
        do {
            let result = try quickJS.parseAndQuery(text: text, league: "周年庆巅峰挑战")
            if let url = result["url"] as? String {
                NSWorkspace.shared.open(URL(string: url)!)
                let summary = result["summary"] as? String ?? "已打开市集"
                rebuildMenu(lastResult: summary)
            } else if let error = result["error"] as? String {
                showNotification(title: "解析失败", body: error)
            }
        } catch {
            showNotification(title: "执行失败", body: error.localizedDescription)
        }
    }

    func showNotification(title: String, body: String) {
        let notification = NSUserNotification()
        notification.title = title
        notification.informativeText = body
        NSUserNotificationCenter.default.deliver(notification)
    }
}
