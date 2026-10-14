import SwiftUI

struct TemperatureCard: View {
    @Environment(AppModel.self) private var model
    @State private var target = 80.0
    @State private var edited = false
    @ScaledMetric(relativeTo: .largeTitle) private var temperatureSize = 72
    var body: some View {
        let status = model.device?[model.side]
        SleepCard(title: "Your side of comfort", eyebrow: "TEMPERATURE") {
            VStack(spacing: 10) {
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text(status == nil ? "—" : model.temperatureLabel(edited ? target : status!.targetTemperatureF))
                        .font(.system(size: temperatureSize, weight: .medium)).tracking(-4)
                    Text(model.settings?.temperatureFormat == "celsius" ? "°C" : "°F").font(.title2).foregroundStyle(.secondary)
                }
                Text(status.map { "Target · currently \(model.temperatureLabel($0.currentTemperatureF))°" } ?? "Connect your Pod to set a temperature")
                    .font(.subheadline).foregroundStyle(.secondary)
            }.frame(maxWidth: .infinity).padding(.vertical, 10)
            Slider(value: $target, in: 55...110, step: 1) { Text("Target bed temperature") }
                .onChange(of: target) { if target != status?.targetTemperatureF { edited = true } }
                .disabled(status == nil || model.acting || model.settings?[model.side].awayMode == true)
            HStack { Text("Cool · \(model.temperatureLabel(55))°"); Spacer(); Text("Warm · \(model.temperatureLabel(110))°") }.font(.caption).foregroundStyle(.secondary)
            HStack {
                Button(status?.isOn == true ? "Turn off" : "Turn on", systemImage: "power") {
                    Task { await model.setPower(!(status?.isOn ?? false)) }
                }.buttonStyle(.bordered)
                Button("Set temperature") { Task { await model.setTemperature(target); if model.actionMessage == nil { edited = false } } }
                    .buttonStyle(.borderedProminent).disabled(!edited)
            }.controlSize(.large).disabled(status == nil || model.acting || model.settings?[model.side].awayMode == true)
        }
        .onAppear { target = status?.targetTemperatureF ?? 80; edited = false }
        .onChange(of: status?.targetTemperatureF) {
            if !edited { target = status?.targetTemperatureF ?? 80; edited = false }
        }
    }
}
