import SwiftUI

struct SleepCard<Content: View>: View {
    @Environment(\.colorScheme) private var scheme
    let title: String
    var eyebrow: String = ""
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 6) {
                if !eyebrow.isEmpty { Text(eyebrow).font(.caption2.weight(.semibold)).tracking(1.6).foregroundStyle(.secondary) }
                Text(title).font(.title3.weight(.semibold))
            }
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading).padding(20)
        .background(SleepTheme.surface(scheme), in: .rect(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(SleepTheme.border(scheme)))
    }
}
