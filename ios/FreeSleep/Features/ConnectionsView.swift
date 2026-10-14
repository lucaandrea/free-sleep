import SwiftUI

struct ConnectionsView: View {
    @Environment(AppModel.self) private var model
    @AppStorage("podURL") private var savedAddress = ""
    @AppStorage("appearance") private var appearance = "light"
    @State private var address = ""
    @State private var token = ""
    @State private var message: String?
    @State private var health = HealthSyncService()
    @State private var home = AppleHomeService()
    @State private var exportHeartRate = false
    @State private var bridge: HomeBridgeStatus?
    var body: some View {
        SleepPage(title: "Make it yours.") {
            SleepCard(title: "Your Pod connection", eyebrow: "LOCAL FIRST") {
                TextField("http://free-sleep.local:3000", text: $address).keyboardType(.URL).textContentType(.URL)
                    .textInputAutocapitalization(.never).autocorrectionDisabled().textFieldStyle(.roundedBorder)
                    .accessibilityLabel("Pod or secure gateway address")
                SecureField("Connection token", text: $token).textFieldStyle(.roundedBorder)
                Text("Your token stays in this iPhone's Keychain. Cloud model keys belong on your server.").font(.caption).foregroundStyle(.secondary)
                Button("Save connection") { save() }.buttonStyle(.borderedProminent).controlSize(.large)
                Picker("Appearance", selection: $appearance) { Text("Warm daylight").tag("light"); Text("Quiet night").tag("dark") }
                if let message { Text(message).font(.callout) }
            }
            SleepCard(title: "Apple Health", eyebrow: "YOUR HEALTH, YOUR CHOICE") {
                SidePicker()
                Text("Choose your own side before syncing. Pod presence is exported as time in bed, never as sleep stages. HRV and breathing estimates are not exported.")
                    .font(.callout).foregroundStyle(.secondary)
                Button("Choose Health permissions") { Task { await health.authorize() } }.buttonStyle(.bordered)
                    .disabled(health.busy || model.demo)
                Toggle("Also export Pod heart rate", isOn: $exportHeartRate)
                Button("Sync the last 30 days") { Task { await health.sync(side: model.side, exportHeartRate: exportHeartRate) } }
                    .buttonStyle(.borderedProminent).disabled(health.busy || model.demo || !model.connected)
                if health.busy { ProgressView("Syncing with Apple Health") }
                if let message = health.message { Text(message).font(.callout) }
                if let minutes = health.healthSleepMinutes {
                    Text("Apple Health sleep, past 24 hours: \(SleepAnalytics.duration(minutes))").font(.callout)
                }
                if let hrv = health.healthHRV { Text("Latest Apple Health HRV (SDNN): \(Int(hrv)) ms").font(.callout) }
                if let heartRate = health.healthHeartRate { Text("Latest Apple Health heart rate: \(Int(heartRate)) bpm").font(.callout) }
                if let breathing = health.healthRespiratoryRate { Text("Latest Apple Health breathing: \(breathing.formatted(.number.precision(.fractionLength(1)))) / min").font(.callout) }
                Text("Apple Health comparisons stay on this iPhone and are not sent to AI providers.").font(.caption).foregroundStyle(.secondary)
            }
            SleepCard(title: "Apple Home", eyebrow: "CONNECTED HOME") {
                Text("Enable the local bridge on your Pod, then add its pairing code in Apple Home.").foregroundStyle(.secondary)
                if let code = bridge?.pairingCode { Text(code).font(.title.monospacedDigit()) }
                if let error = bridge?.error { Text(error).foregroundStyle(.red) }
                Button("Connect Apple Home") { home.connect() }.buttonStyle(.bordered).disabled(model.demo)
                ForEach(home.homes, id: \.uniqueIdentifier) { house in
                    Text(house.name).font(.headline)
                    ForEach(house.actionSets, id: \.uniqueIdentifier) { scene in
                        Button("Run \(scene.name)") { Task { await home.run(scene, in: house) } }.buttonStyle(.bordered)
                    }
                }
                if let message = home.message { Text(message).font(.callout) }
            }
            SleepCard(title: "Shortcuts & Siri") {
                Text("Find Free Sleep in Shortcuts to set temperature, power, head and feet angles, choose a position, stop movement, or read your latest summary.")
                    .foregroundStyle(.secondary)
                Text("Bed movement affects both sides. Your iPhone must be able to reach the Pod or your secure gateway.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .onAppear { address = savedAddress; token = TokenStore.read(for: savedAddress) }
        .task { bridge = try? await PodClient.configured().get("integrations/homekit") }
    }
    private func save() {
        do {
            let clean = address.trimmingCharacters(in: .whitespacesAndNewlines)
            _ = try PodClient(address: clean, token: token)
            try TokenStore.save(token.trimmingCharacters(in: .whitespacesAndNewlines), for: clean)
            savedAddress = clean; message = "Connection saved."
            Task { await model.refresh() }
        } catch { message = error.localizedDescription }
    }
}
