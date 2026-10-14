import Foundation
import Observation

@MainActor @Observable
final class AppModel {
    var tab = SleepTab.tonight
    var side = BedSide(rawValue: UserDefaults.standard.string(forKey: "bedSide") ?? "left") ?? .left {
        didSet { UserDefaults.standard.set(side.rawValue, forKey: "bedSide") }
    }
    var device: DeviceStatus?
    var settings: PodSettings?
    var base: BaseStatus?
    var analytics: SleepAnalytics?
    var message: String?
    var actionMessage: String?
    var acting = false
    var stopping = false
    var days = 30
    private var analyticsKey = ""
    private var analyticsRefreshedAt = Date.distantPast
    let demo: Bool
    var connected: Bool { device != nil }

    init() {
        demo = AppMode.isDemo
    }

    func refresh(includeAnalytics: Bool = true) async {
        if demo { loadDemo(); return }
        do {
            let client = try PodClient.configured()
            let key = "\(side.rawValue):\(days)"
            let refreshNights = includeAnalytics || key != analyticsKey || Date().timeIntervalSince(analyticsRefreshedAt) >= 60
            let previousAnalytics = analytics
            async let preferences: PodSettings? = try? client.get("settings")
            async let status: DeviceStatus? = try? client.get("deviceStatus")
            async let position: BaseStatus? = try? client.get("base")
            async let nights: SleepAnalytics? = refreshNights ? (try? client.get("analytics", query: [
                URLQueryItem(name: "side", value: side.rawValue), URLQueryItem(name: "days", value: String(days))])) : previousAnalytics
            let results = await (status, position, nights, preferences)
            guard !Task.isCancelled else { return }
            device = results.0; base = results.1; analytics = results.2; settings = results.3
            if refreshNights { analyticsKey = key; analyticsRefreshedAt = Date() }
            message = device == nil ? "Your Pod is unavailable. Check its address and token in Settings." : nil
        } catch { device = nil; base = nil; analytics = nil; message = error.localizedDescription }
    }

    func perform(_ operation: @MainActor () async throws -> Void) async {
        guard !acting else { return }
        acting = true; actionMessage = nil
        defer { acting = false }
        do { try await operation(); await refresh() }
        catch { actionMessage = error.localizedDescription }
    }
    func setTemperature(_ temperature: Double) async {
        await perform {
            if demo { if side == .left { device?.left.targetTemperatureF = temperature } else { device?.right.targetTemperatureF = temperature }; return }
            try await PodClient.configured().post("deviceStatus", body: [side.rawValue: ["targetTemperatureF": temperature]])
        }
    }
    func setPower(_ enabled: Bool) async {
        await perform {
            if demo { if side == .left { device?.left.isOn = enabled } else { device?.right.isOn = enabled }; return }
            try await PodClient.configured().post("deviceStatus", body: [side.rawValue: ["isOn": enabled]])
        }
    }
    func dismissAlarm() async {
        await perform {
            if demo { return }
            try await PodClient.configured().post("deviceStatus", body: [side.rawValue: ["isAlarmVibrating": false]])
        }
    }
    func temperatureLabel(_ fahrenheit: Double) -> String {
        let value = settings?.temperatureFormat == "celsius" ? (fahrenheit - 32) * 5 / 9 : fahrenheit
        return value.formatted(.number.precision(.fractionLength(0)))
    }
    func connectBase() async { await perform { if !demo { try await PodClient.configured().action("base/connect") } } }
    func moveBase(head: Double, feet: Double) async {
        await perform {
            if demo {
                let angles = BaseStatus.Angles(head: head, feet: feet)
                base?.position = .init(left: angles, right: angles); return
            }
            try await PodClient.configured().post("base/position", body: ["head": head, "feet": feet, "speed": 50])
        }
    }
    func stopBase() async {
        guard !stopping else { return }
        stopping = true
        defer { stopping = false }
        do { if !demo { try await PodClient.configured().action("base/stop") }; await refresh() }
        catch { actionMessage = error.localizedDescription }
    }
    private func loadDemo() {
        if device == nil { device = .init(left: .init(currentTemperatureF: 82, targetTemperatureF: 84, isOn: true),
            right: .init(currentTemperatureF: 80, targetTemperatureF: 80, isOn: false), isPriming: false, waterLevel: "full") }
        if base == nil { base = .init(state: "connected", position: .init(left: .init(head: 0, feet: 0), right: .init(head: 0, feet: 0)),
            updatedAt: Date().timeIntervalSince1970 * 1000, stale: false, busy: false, error: nil) }
        if analytics == nil, let url = Bundle.main.url(forResource: "analytics-demo", withExtension: "json"),
           let data = try? Data(contentsOf: url) { analytics = try? JSONDecoder().decode(SleepAnalytics.self, from: data) }
    }
}
