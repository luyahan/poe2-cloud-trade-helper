import Foundation
import AppKit

class ClipboardReader {
    static func read() -> String? {
        let pasteboard = NSPasteboard.general
        return pasteboard.string(forType: .string)
    }

    static func looksLikeItemText(_ text: String) -> Bool {
        guard text.count >= 20, !text.trimmingCharacters(in: .whitespacesAndNewlines).hasPrefix("http") else {
            return false
        }
        return text.range(of: #"(?m)^物品类别\s*:"#, options: .regularExpression) != nil ||
            text.range(of: #"(?m)^稀\s*有\s*度\s*:"#, options: .regularExpression) != nil
    }
}
