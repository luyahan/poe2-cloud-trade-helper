import Foundation
import CoreGraphics
import ApplicationServices

/// Ctrl+Alt+C 全局旁听，不消费事件，避免云游戏收不到复制指令。
/// 与 Electron uiohook 一样需要 macOS 辅助功能权限。
final class HotkeyManager {
    enum HotkeyError: LocalizedError {
        case permissionDenied
        case tapCreationFailed
        case runLoopSourceFailed

        var errorDescription: String? {
            switch self {
            case .permissionDenied:
                return "请在“系统设置 → 隐私与安全性 → 辅助功能”中允许 PoeQuick，然后重新启动。"
            case .tapCreationFailed:
                return "Ctrl+Alt+C 监听创建失败，请检查辅助功能权限。"
            case .runLoopSourceFailed:
                return "Ctrl+Alt+C 监听无法加入主运行循环。"
            }
        }
    }

    private let handler: () -> Void
    private let readDelayMs: Int
    private var eventTap: CFMachPort?
    private var runLoopSource: CFRunLoopSource?
    private var readWorkItem: DispatchWorkItem?
    private var lastTrigger = Date.distantPast

    init(readDelayMs: Int = 600, handler: @escaping () -> Void) {
        self.readDelayMs = readDelayMs
        self.handler = handler
    }

    func register() throws {
        guard eventTap == nil else { return }
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue(): true] as CFDictionary
        guard AXIsProcessTrustedWithOptions(options) else {
            throw HotkeyError.permissionDenied
        }

        let mask = CGEventMask(1 << CGEventType.keyDown.rawValue)
        let pointer = Unmanaged.passUnretained(self).toOpaque()
        guard let tap = CGEvent.tapCreate(
            tap: .cghidEventTap,
            place: .headInsertEventTap,
            options: .listenOnly,
            eventsOfInterest: mask,
            callback: { _, type, event, userInfo in
                guard let userInfo else { return Unmanaged.passUnretained(event) }
                let manager = Unmanaged<HotkeyManager>.fromOpaque(userInfo).takeUnretainedValue()
                if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
                    if let tap = manager.eventTap {
                        CGEvent.tapEnable(tap: tap, enable: true)
                    }
                    return Unmanaged.passUnretained(event)
                }
                manager.handle(event)
                // listen-only 必须原样返回，不能拦截或修改 Ctrl+Alt+C。
                return Unmanaged.passUnretained(event)
            },
            userInfo: pointer
        ) else {
            throw HotkeyError.tapCreationFailed
        }
        guard let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0) else {
            throw HotkeyError.runLoopSourceFailed
        }
        eventTap = tap
        runLoopSource = source
        CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
    }

    private func handle(_ event: CGEvent) {
        guard event.type == .keyDown,
              event.getIntegerValueField(.keyboardEventKeycode) == 8, // C
              event.getIntegerValueField(.keyboardEventAutorepeat) == 0 else { return }
        let flags = event.flags
        guard flags.contains(.maskControl),
              flags.contains(.maskAlternate),
              !flags.contains(.maskShift) else { return }

        let now = Date()
        guard now.timeIntervalSince(lastTrigger) >= 0.5 else { return }
        lastTrigger = now
        readWorkItem?.cancel()
        let work = DispatchWorkItem { [weak self] in
            self?.handler()
        }
        readWorkItem = work
        // 等远端游戏完成复制，并把剪贴板同步回本地。
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(readDelayMs), execute: work)
    }

    func stop() {
        readWorkItem?.cancel()
        readWorkItem = nil
        if let eventTap {
            CGEvent.tapEnable(tap: eventTap, enable: false)
        }
        if let runLoopSource {
            CFRunLoopRemoveSource(CFRunLoopGetMain(), runLoopSource, .commonModes)
        }
        runLoopSource = nil
        eventTap = nil
    }

    deinit {
        stop()
    }
}
