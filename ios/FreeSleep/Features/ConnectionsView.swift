import SwiftUI

struct ConnectionsView: View {
    @Environment(AppModel.self) private var model
    @AppStorage("appearance") private var appearance = "light"
    var body: some View {
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
            SleepCard(title: "Shortcuts & Siri", eyebrow: "EVERYDAY ACTIONS") {
                Text("Find Free Sleep in Shortcuts on your iPhone to control temperature, power, bed position, adaptive comfort and Away mode; change or skip your next alarm, sync Health, or read your latest summary.")
                    .foregroundStyle(SleepTheme.secondary)
                Text("Bed movement affects both sides. Your iPhone must be able to reach the Pod or your secure gateway.")
                    .sleepText(.caption).foregroundStyle(SleepTheme.secondary)
            }
        }
    }
}
