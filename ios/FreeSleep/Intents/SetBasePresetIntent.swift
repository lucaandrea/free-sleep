import AppIntents

struct SetBasePresetIntent: AppIntent {
    static let title: LocalizedStringResource = "Set bed position"
    static let description = IntentDescription("Move the whole adjustable base to a preset. Both sides move together.")
    @Parameter(title: "Position", default: .flat) var preset: BasePreset
    func perform() async throws -> some IntentResult & ProvidesDialog {
        try await PodClient.configured().post("base/preset", body: ["preset": preset.rawValue])
        return .result(dialog: "The \(preset.rawValue) position command was sent. Both sides move together.")
    }
}
