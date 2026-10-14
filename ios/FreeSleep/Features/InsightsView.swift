import SwiftUI
import Charts

struct InsightsView: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        @Bindable var model = model
        SleepPage(title: "Understand your nights.", subtitle: "Notice your patterns. Find a rhythm that feels like you.") {
            SidePicker()
            Picker("History range", selection: $model.days) {
                ForEach([7, 30, 90], id: \.self) { days in Text("\(days) days").tag(days) }
            }.pickerStyle(.segmented)
            let summary = model.analytics?.summary
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 145), spacing: 16)], spacing: 16) {
                metric("Bed presence", SleepAnalytics.duration(summary?.averageOccupiedMinutes), "Recent recorded nights")
                metric("Bedtime variation", summary?.bedtimeVariationMinutes.map { "\(Int($0)) min" } ?? "—", "Lower means more consistent")
                metric("Heart rate", summary?.averageHeartRate.map { "\(Int($0)) bpm" } ?? "—", "During detected presence")
                metric("Recorded nights", summary.map { String($0.recordedNights) } ?? "—", "Missing nights are not zero")
            }
            SleepCard(title: "Time made for rest", eyebrow: "BED PRESENCE") {
                if let nights = model.analytics?.nights, !nights.isEmpty {
                    Chart(nights) { night in
                        if let minutes = night.occupiedMinutes {
                            BarMark(x: .value("Wake date", night.date), y: .value("Minutes", minutes))
                                .foregroundStyle(SleepTheme.accent.opacity(0.7)).cornerRadius(4)
                        }
                    }.frame(height: 180).chartXAxis(.hidden)
                    Text("Longest episode per wake date · \(model.analytics?.timeZone ?? "Pod timezone")").font(.caption).foregroundStyle(.secondary)
                } else {
                    Text(model.connected ? "No nights recorded yet. Enable biometrics on your Pod to start building your history." : "Connect to your Pod to see your recorded nights.")
                        .foregroundStyle(.secondary)
                }
            }
            JournalCard().id(model.side)
            SleepCard(title: "Beyond the headline") {
                Text("HRV estimate: \(summary?.averageHrv.map { String(Int($0)) } ?? "—") ms")
                Text("Breathing estimate: \(summary?.averageRespiratoryRate.map { String(Int($0)) } ?? "—") / min")
                Text("These estimates are experimental. Bed presence does not establish sleep stages or sleep quality.")
                    .font(.callout).foregroundStyle(.secondary)
            }
        }.refreshable { await model.refresh() }
    }
    private func metric(_ title: String, _ value: String, _ caption: String) -> some View {
        SleepCard(title: title) { Text(value).font(.title.weight(.medium)); Text(caption).font(.caption).foregroundStyle(.secondary) }
    }
}
