import SwiftUI

struct ConnectionsView: View {
    @Environment(AppModel.self) private var model
    @AppStorage("appearance") private var appearance = "light"
    var body: some View {
        NavigationStack {
        SleepPage(title: "Make it yours.", narrow: true) {
            PodConnectionCard(demo: model.demo)
            SleepCard(title: "Appearance", eyebrow: "YOUR SPACE") {
                SleepFormField(title: "Color theme") {
                    Picker("Color theme", selection: $appearance) { Text("Warm daylight").tag("light"); Text("Quiet night").tag("dark") }
                        .pickerStyle(.menu).labelsHidden().tint(SleepTheme.text).accessibilityLabel("Color theme")
                }
            }
            HomeConnectionCard()
            HealthConnectionCard()
            SleepCard(title: "AI & personal history", eyebrow: "YOUR MODELS") {
                Text("Choose Apple Intelligence, OpenAI, Gemini, Claude or your local Gemma server. Save your own API keys privately on this device.").foregroundStyle(SleepTheme.secondary)
                NavigationLink("Model settings & Health history") { IntelligenceView() }.buttonStyle(SleepButtonStyle())
            }
            SleepCard(title: "Shortcuts & Siri", eyebrow: "EVERYDAY ACTIONS") {
                Text("Find Free Sleep in Shortcuts on your iPhone to control temperature, power, bed position, adaptive comfort and Away mode; change or skip your next alarm, sync Health, or read your latest summary.")
                    .foregroundStyle(SleepTheme.secondary)
                Text("Bed movement affects both sides. Your iPhone must be able to reach the Pod or your secure gateway.")
                    .sleepText(.caption).foregroundStyle(SleepTheme.secondary)
            }
            SleepCard(title: "Fine-tune your setup") {
                NavigationLink("Device settings") { DevicePreferencesView() }.buttonStyle(SleepButtonStyle())
                NavigationLink("System health") { SystemHealthView() }.buttonStyle(SleepButtonStyle())
            }
        }
        }
    }
}
