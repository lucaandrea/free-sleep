import SwiftUI

struct TonightView: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        SleepPage(title: "Make room for rest.", subtitle: "Your bed, your rhythm. A little more comfortable tonight.") {
            SidePicker()
            PodNotifications()
            if let message = model.message { Text(message).font(.callout).foregroundStyle(.secondary) }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 280), spacing: 20)], spacing: 20) {
                TemperatureCard().id(model.side)
                BaseCard()
            }
            if let message = model.actionMessage { Label(message, systemImage: "exclamationmark.circle").foregroundStyle(.red) }
            SleepCard(title: "A glance at last night", eyebrow: "YOUR ROUTINE") {
                let night = model.analytics?.nights.last
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 24) { metrics(night) }
                    VStack(alignment: .leading, spacing: 20) { metrics(night) }
                }
                Text("Based on Pod presence and vitals. Presence is not measured sleep.").font(.caption).foregroundStyle(.secondary)
            }
        }.refreshable { await model.refresh() }
    }
    @ViewBuilder private func metrics(_ night: SleepAnalytics.Night?) -> some View {
        metric("Bed presence", SleepAnalytics.duration(night?.occupiedMinutes))
        metric("Heart rate", night?.heartRate.map { "\($0.formatted(.number.precision(.fractionLength(1)))) bpm" } ?? "—")
        metric("Bed exits", night.map { String($0.exits) } ?? "—")
    }
    private func metric(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 8) { Text(label).font(.caption).foregroundStyle(.secondary); Text(value).font(.title2.weight(.medium)) }
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}
