import Foundation
import Carbon

class HotkeyManager {
    var hotkeyRef: EventHotKeyRef?
    var handler: () -> Void

    init(handler: @escaping () -> Void) {
        self.handler = handler
    }

    func register() {
        // Cmd+Shift+D
        let keyCode: UInt32 = 2  // 'D'
        let modifiers: UInt32 = UInt32(cmdKey | shiftKey)

        var hotkeyID = EventHotKeyID()
        hotkeyID.signature = OSType(0x504F4532)  // 'POE2'
        hotkeyID.id = 1

        var eventType = EventTypeSpec()
        eventType.eventClass = OSType(kEventClassKeyboard)
        eventType.eventKind = OSType(kEventHotKeyPressed)

        let selfPtr = Unmanaged.passUnretained(self).toOpaque()
        InstallEventHandler(GetApplicationEventTarget(), { (_, _, userData) -> OSStatus in
            guard let userData = userData else { return noErr }
            let manager = Unmanaged<HotkeyManager>.fromOpaque(userData).takeUnretainedValue()
            DispatchQueue.main.async {
                manager.handler()
            }
            return noErr
        }, 1, &eventType, selfPtr, nil)

        RegisterEventHotKey(keyCode, modifiers, hotkeyID, GetApplicationEventTarget(), 0, &hotkeyRef)
    }

    deinit {
        if let ref = hotkeyRef {
            UnregisterEventHotKey(ref)
        }
    }
}
