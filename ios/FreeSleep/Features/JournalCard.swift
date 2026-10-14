import SwiftUI

struct JournalCard: View {
    @Environment(AppModel.self) private var model
    @State private var date = Date()
    @State private var entries: [JournalEntry] = []
    @State private var draft = JournalEntry(date: "", side: "left")
    @State private var patterns: Journal.Patterns?
    @State private var message: String?
    @State private var busy = false
    private var dateKey: String {
        let formatter = DateFormatter(); formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: model.settings?.timeZone ?? model.analytics?.timeZone ?? "UTC")
        return formatter.string(from: date)
    }
    var body: some View {
        SleepCard(title: "How did the night feel?", eyebrow: "YOUR MORNING CHECK-IN") {
            DatePicker("Wake date", selection: $date, displayedComponents: .date)
            Picker("Restfulness", selection: $draft.restfulness) {
                Text("Very low").tag(1); Text("Low").tag(2); Text("Okay").tag(3); Text("Good").tag(4); Text("Great").tag(5)
            }
            Picker("Temperature comfort", selection: $draft.comfort) {
                Text("Too cold").tag("cold"); Text("Comfortable").tag("comfortable"); Text("Too warm").tag("warm")
            }
            Toggle("Caffeine", isOn: $draft.caffeine)
            Toggle("Alcohol", isOn: $draft.alcohol)
            Toggle("Exercise", isOn: $draft.exercise)
            TextField("Notes for yourself", text: $draft.notes, axis: .vertical).lineLimit(2...5).textFieldStyle(.roundedBorder)
                .onChange(of: draft.notes) { draft.notes = String(draft.notes.prefix(500)) }
            Button("Save check-in") { Task { await save() } }.buttonStyle(.borderedProminent).controlSize(.large)
                .disabled(busy || (!model.demo && !model.connected))
            if let message { Text(message).font(.caption) }
            Text("Your notes stay on your Pod. AI receives only numerical patterns when you choose to share a summary.")
                .font(.caption).foregroundStyle(.secondary)
            if let patterns {
                ForEach(patterns.associations, id: \.habit) { pattern in
                    Text("\(pattern.habit): \(pattern.presenceDifferenceMinutes > 0 ? "+" : "")\(pattern.presenceDifferenceMinutes) minutes of bed presence on recorded nights with this habit (\(pattern.withCount) with / \(pattern.withoutCount) without).")
                        .font(.callout)
                }
                Text(patterns.note).font(.caption).foregroundStyle(.secondary)
            }
        }.task(id: "\(model.side.rawValue):\(model.days)") { await load(); selectEntry() }
            .onChange(of: dateKey) { selectEntry() }
    }
    private func selectEntry() {
        draft = entries.first { $0.date == dateKey && $0.side == model.side.rawValue }
            ?? JournalEntry(date: dateKey, side: model.side.rawValue)
        message = nil
    }
    private func load() async {
        guard !model.demo else { return }
        do {
            let journal: Journal = try await PodClient.configured().get("journal", query: [
                URLQueryItem(name: "side", value: model.side.rawValue), URLQueryItem(name: "days", value: String(model.days))])
            guard !Task.isCancelled else { return }
            entries = journal.entries; patterns = journal.patterns
        } catch { message = error.localizedDescription }
    }
    private func save() async {
        busy = true; defer { busy = false }
        do {
            if model.demo {
                entries.removeAll { $0.date == draft.date && $0.side == draft.side }; entries.append(draft)
            } else { try await PodClient.configured().post("journal", body: draft); await load() }
            message = "Check-in saved."
        } catch { message = error.localizedDescription }
    }
}
