import AppIntents
import Foundation

struct SleepSummaryIntent: AppIntent {
    static let title: LocalizedStringResource = "Get sleep routine summary"
    @Parameter(title: "Side", default: .left) var side: BedSide
    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        let analytics: SleepAnalytics = try await PodClient.configured().get("analytics", query: [URLQueryItem(name: "side", value: side.rawValue)])
        let summary = "Recent bed presence: \(SleepAnalytics.duration(analytics.summary.averageOccupiedMinutes)). "
            + "\(analytics.summary.recordedNights) recorded nights. Presence is not measured sleep."
        return .result(value: summary, dialog: IntentDialog(stringLiteral: summary))
    }
}
