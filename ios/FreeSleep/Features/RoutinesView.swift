import SwiftUI

struct RoutinesView: View {
    @Environment(AppModel.self) private var model
    @State private var day = "monday"
    @State private var schedule = DailySchedule.empty
    @State private var ready = false
    @State private var busy = false
    @State private var message: String?
    @State private var adjustmentTime = "01:00"
    @State private var adjustmentTemperature = 78
    private let days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    var body: some View {
        SleepPage(title: "Set your rhythm.", subtitle: "A comfortable night, right on time.") {
            SidePicker()
            Picker("Day", selection: $day) { ForEach(days, id: \.self) { Text($0.capitalized).tag($0) } }.pickerStyle(.menu)
            SleepCard(title: "Your nightly routine", eyebrow: "POD LOCAL TIME") {
                Toggle("Enable routine", isOn: $schedule.power.enabled)
                timeField("Turn on", $schedule.power.on)
                timeField("Turn off", $schedule.power.off)
                Stepper("Starting temperature: \(schedule.power.onTemperature)°F", value: $schedule.power.onTemperature, in: 55...110)
                Text("Times use your Pod timezone, including overnight routines.").font(.caption).foregroundStyle(.secondary)
            }.disabled(!ready || busy)
            SleepCard(title: "Ease into the morning") {
                Toggle("Vibration alarm", isOn: $schedule.alarm.enabled)
                timeField("Wake time", $schedule.alarm.time)
                Stepper("Alarm temperature: \(schedule.alarm.alarmTemperature)°F", value: $schedule.alarm.alarmTemperature, in: 55...110)
                Stepper("Intensity: \(schedule.alarm.vibrationIntensity)%", value: $schedule.alarm.vibrationIntensity, in: 1...100)
                Stepper("Duration: \(schedule.alarm.duration) seconds", value: $schedule.alarm.duration, in: 0...180, step: 5)
                Picker("Pattern", selection: $schedule.alarm.vibrationPattern) { Text("Rise").tag("rise"); Text("Double").tag("double") }
            }.disabled(!ready || busy)
            SleepCard(title: "Through the night") {
                ForEach(schedule.temperatures.keys.sorted(), id: \.self) { time in
                    HStack {
                        Text("\(time) · \(schedule.temperatures[time] ?? 80)°F")
                        Spacer()
                        Button("Remove \(time)", systemImage: "minus.circle", role: .destructive) { schedule.temperatures.removeValue(forKey: time) }
                            .labelStyle(.iconOnly)
                    }
                }
                timeField("Adjustment time", $adjustmentTime)
                Stepper("Temperature: \(adjustmentTemperature)°F", value: $adjustmentTemperature, in: 55...110)
                Button("Add adjustment") {
                    if Self.validTime(adjustmentTime) { schedule.temperatures[adjustmentTime] = adjustmentTemperature }
                    else { message = "Use a 24-hour time such as 01:30." }
                }.buttonStyle(.bordered)
            }.disabled(!ready || busy)
            Button(busy ? "Saving…" : "Save routine") { Task { await save() } }.buttonStyle(.borderedProminent)
                .controlSize(.large).disabled(!ready || busy)
            if let message { Text(message).font(.callout) }
        }.task(id: "\(day)-\(model.side.rawValue)") { await load() }
    }
    private func timeField(_ label: String, _ value: Binding<String>) -> some View {
        HStack { Text(label); Spacer(); TextField("HH:mm", text: value).multilineTextAlignment(.trailing).frame(maxWidth: 110)
            .keyboardType(.numbersAndPunctuation).textFieldStyle(.roundedBorder).accessibilityLabel(label) }
    }
    static func validTime(_ value: String) -> Bool { value.range(of: "^([01][0-9]|2[0-3]):[0-5][0-9]$", options: .regularExpression) != nil }
    private func load() async {
        ready = false; message = nil
        if model.demo { schedule = .empty; ready = true; return }
        do {
            let schedules: [String: [String: DailySchedule]] = try await PodClient.configured().get("schedules")
            guard !Task.isCancelled else { return }
            guard let selected = schedules[model.side.rawValue]?[day] else { throw PodError.message("No routine found for this day.") }
            schedule = selected; ready = true
        } catch { message = error.localizedDescription }
    }
    private func save() async {
        guard [schedule.power.on, schedule.power.off, schedule.alarm.time].allSatisfy(Self.validTime) else {
            message = "Use 24-hour times such as 22:00."; return
        }
        busy = true; defer { busy = false }
        do {
            if !model.demo { try await PodClient.configured().post("schedules", body: [model.side.rawValue: [day: schedule]]) }
            message = model.demo ? "Demo routine saved for this preview." : "Routine saved."
        } catch { message = error.localizedDescription }
    }
}
