import AppIntents

struct FreeSleepShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: SetTemperatureIntent(), phrases: ["Set my bed temperature with \(.applicationName)"],
            shortTitle: "Bed temperature", systemImageName: "thermometer.medium")
        AppShortcut(intent: SetPowerIntent(), phrases: ["Turn on my bed with \(.applicationName)"],
            shortTitle: "Bed power", systemImageName: "power")
        AppShortcut(intent: SetBasePresetIntent(), phrases: ["Set my bed position with \(.applicationName)"],
            shortTitle: "Bed position", systemImageName: "bed.double")
        AppShortcut(intent: StopBaseIntent(), phrases: ["Stop my bed with \(.applicationName)"],
            shortTitle: "Stop bed", systemImageName: "stop.circle")
        AppShortcut(intent: SleepSummaryIntent(), phrases: ["My sleep routine in \(.applicationName)"],
            shortTitle: "Sleep routine", systemImageName: "chart.bar")
    }
}
