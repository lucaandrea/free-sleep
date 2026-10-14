import SwiftUI

struct CoachView: View {
    @Environment(AppModel.self) private var model
    @State private var providers: [CoachProvider] = []
    @State private var provider = "rules"
    @State private var share = false
    @State private var question = "What patterns stand out in my recent nights?"
    @State private var result: Coaching?
    @State private var error: String?
    @State private var busy = false
    var body: some View {
        SleepPage(title: "A little perspective.", subtitle: "Thoughtful insights, grounded in your own routine.") {
            SidePicker()
            SleepCard(title: "What would you like to explore?", eyebrow: "YOUR SLEEP COACH") {
                Picker("Insight source", selection: $provider) {
                    Text("On-device insights").tag("rules")
                    ForEach(providers.filter { $0.provider != "rules" && $0.configured }) { option in Text(option.model).tag(option.provider) }
                }
                TextField("Your question", text: $question, axis: .vertical).lineLimit(3...6).textFieldStyle(.roundedBorder)
                if provider != "rules" { Toggle("Share my numerical sleep summary and question with this model for this request.", isOn: $share) }
                Button(busy ? "Finding perspective…" : "Explore my nights") { Task { await generate() } }
                    .buttonStyle(.borderedProminent).controlSize(.large).disabled(busy || (provider != "rules" && !share))
                Text("Suggestions support your routine. They do not diagnose conditions or change your bed.").font(.caption).foregroundStyle(.secondary)
            }
            if let error { Text(error).foregroundStyle(.red) }
            if let result {
                SleepCard(title: result.headline, eyebrow: result.model) {
                    ForEach(result.observations, id: \.self) { Text($0) }
                    Text("Try one small change").font(.headline)
                    ForEach(result.suggestions, id: \.self) { Text($0) }
                    ForEach(result.limitations, id: \.self) { Text($0).font(.caption).foregroundStyle(.secondary) }
                }
            }
        }
        .onChange(of: provider) { share = false; result = nil }
        .onChange(of: model.side) { result = nil }
        .task { providers = (try? await PodClient.configured().get("ai/providers")) ?? [] }
    }
    private func generate() async {
        busy = true; error = nil
        defer { busy = false }
        if model.demo {
            result = Coaching(headline: "A steadier rhythm is taking shape", observations: ["Your sample nights show about eight hours of bed presence."],
                suggestions: ["Try keeping your wind-down time consistent for another week."],
                limitations: ["This is sample data. Bed presence is not measured sleep."], provider: "rules", model: "Demo insights")
            return
        }
        do {
            result = try await PodClient.configured().coach(side: model.side, provider: provider, share: share, question: String(question.prefix(1000)))
        } catch { self.error = error.localizedDescription }
    }
}
