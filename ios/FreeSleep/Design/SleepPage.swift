import SwiftUI

struct SleepPage<Content: View>: View {
    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var scheme
    let title: String
    var subtitle: String = ""
    @ViewBuilder var content: Content
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if model.demo { Label("Demo · sample data and simulated controls", systemImage: "info.circle").font(.caption).foregroundStyle(.secondary) }
                Text(title).font(.largeTitle.weight(.semibold)).tracking(-1)
                if !subtitle.isEmpty { Text(subtitle).foregroundStyle(.secondary) }
                content
            }.padding(20).frame(maxWidth: 960).frame(maxWidth: .infinity)
        }.background(SleepTheme.canvas(scheme))
    }
}
