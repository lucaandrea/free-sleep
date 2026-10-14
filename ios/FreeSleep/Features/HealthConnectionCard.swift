import SwiftUI

struct HealthConnectionCard: View {
    @Environment(AppModel.self) private var model
    @Environment(HealthSyncService.self) private var health
    @State private var side: BedSide = .left
    @State private var heartRate = false
    @State private var automatic = false
    private var unsaved: Bool {
        guard let settings = health.settings else { return true }
        return settings.side != side || settings.exportHeartRate != heartRate || settings.automatic != automatic
    }

    var body: some View {
        SleepCard(title: "Apple Health", eyebrow: "YOUR HEALTH, YOUR CHOICE") {
            Text("Link your own bed side to Health. This choice stays separate from the side you browse in Free Sleep.")
                .font(.callout).foregroundStyle(.secondary)
            Picker("My Health side", selection: $side) {
                ForEach(BedSide.allCases, id: \.self) { Text($0.title).tag($0) }
            }.pickerStyle(.segmented).disabled(health.busy)
            Toggle("Also export Pod heart rate", isOn: $heartRate).disabled(health.busy)
            Toggle("Sync automatically", isOn: $automatic).disabled(health.busy)
            Text("Pod presence is saved as time in bed. Sleep stages, HRV and breathing estimates are not exported.")
                .font(.caption).foregroundStyle(.secondary)
            Button("Choose Health permissions") { Task { await health.authorize() } }
                .buttonStyle(.bordered).disabled(health.busy || model.demo || !health.available)
            Button(health.settings == nil ? "Link my side to this Pod" : "Save Health setup") {
                Task { await health.configure(side: side, exportHeartRate: heartRate, automatic: automatic) }
            }.buttonStyle(.bordered).disabled(health.busy || model.demo || !health.available)
            if unsaved && health.settings != nil {
                Text("Save your changes before syncing.").font(.caption).foregroundStyle(SleepTheme.accent)
            }
            if let settings = health.settings {
                Text("Linked to \(settings.side.title.lowercased()) on Pod \(settings.podID).")
                    .font(.caption).foregroundStyle(.secondary).textSelection(.enabled)
                if let success = settings.lastSuccess {
                    Text("Last sync: \(success.formatted(date: .abbreviated, time: .shortened)) · \(settings.lastSampleCount ?? 0) samples")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            Button("Sync the last 30 days") { Task { await health.syncFromButton() } }
                .buttonStyle(.borderedProminent)
                .disabled(health.busy || model.demo || !health.available || unsaved)
            if health.busy {
                ProgressView("Working with Apple Health")
                if health.canCancel { Button("Cancel sync", role: .cancel) { health.cancel() }.buttonStyle(.bordered) }
            }
            if let message = health.message { Text(message).font(.callout).accessibilityAddTraits(.updatesFrequently) }
            if let message = health.backgroundMessage { Text(message).font(.caption).foregroundStyle(.secondary) }
            if !health.available { Text("Apple Health is unavailable on this device.").font(.callout) }
            if let comparison = health.comparison { HealthComparisonView(comparison: comparison) }
            Text("Health comparisons stay on this iPhone and are not sent to AI providers. Empty readings can mean no data or no read permission.")
                .font(.caption).foregroundStyle(.secondary)
        }
        .onAppear {
            if let settings = health.settings {
                side = settings.side; heartRate = settings.exportHeartRate; automatic = settings.automatic
            }
        }
    }
}
