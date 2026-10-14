import Foundation
import HomeKit
import Observation

@MainActor @Observable
final class AppleHomeService: NSObject, HMHomeManagerDelegate {
    var homes: [HMHome] = []
    var message: String?
    private var manager: HMHomeManager?
    func connect() {
        manager = HMHomeManager()
        manager?.delegate = self
        message = "Waiting for Apple Home access…"
    }
    nonisolated func homeManagerDidUpdateHomes(_ manager: HMHomeManager) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            homes = self.manager?.homes ?? []
            message = homes.isEmpty ? "No homes available. Check Apple Home permissions and setup." : nil
        }
    }
    func run(_ scene: HMActionSet, in home: HMHome) async {
        do { try await home.executeActionSet(scene); message = "Ran \(scene.name)." }
        catch { message = error.localizedDescription }
    }
}
