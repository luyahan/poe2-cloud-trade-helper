import Foundation
import AppKit

class ClipboardReader {
    static func read() -> String? {
        let pasteboard = NSPasteboard.general
        return pasteboard.string(forType: .string)
    }
}
