import SwiftUI

private enum SleepTab: String, CaseIterable {
    case tonight = "Tonight", sleep = "Sleep", coach = "Coach", routines = "Routines", settings = "Settings"
    var icon: String {
        switch self {
        case .tonight: "moon.stars"
        case .sleep: "chart.bar"
        case .coach: "sparkles"
        case .routines: "clock"
        case .settings: "gearshape"
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var phase
    @Environment(\.colorScheme) private var scheme
    @AppStorage("appearance") private var appearance = "light"
    @State private var selected = SleepTab.tonight
    var body: some View {
        GeometryReader { geometry in
            if geometry.size.width >= 900 {
                HStack(spacing: 0) {
                    VStack(alignment: .leading, spacing: 16) {
                        Label("free sleep", systemImage: "moon.stars").font(.title3.weight(.semibold)).padding(.bottom, 24)
                        Text("WORKSPACE").font(.caption2).foregroundStyle(.secondary)
                        ForEach(SleepTab.allCases, id: \.self) { tab in navigationButton(tab, horizontal: true) }
                        Spacer()
                        Text(model.connected ? "Pod connected" : "Pod offline").font(.caption).foregroundStyle(.secondary)
                    }.padding(20).frame(width: 224).background(SleepTheme.canvas(scheme))
                    Divider()
                    content
                }
            } else {
                content.safeAreaInset(edge: .bottom, spacing: 0) {
                    VStack(spacing: 0) {
                        Divider()
                        HStack(spacing: 0) {
                            ForEach(SleepTab.allCases, id: \.self) { tab in navigationButton(tab, horizontal: false) }
                        }.frame(height: 68)
                    }.background(SleepTheme.canvas(scheme))
                }
            }
        }
        .preferredColorScheme(appearance == "dark" ? .dark : .light)
        .task(id: "\(model.side.rawValue)-\(model.days)-\(phase)") {
            guard phase == .active else { return }
            while !Task.isCancelled {
                await model.refresh(includeAnalytics: false)
                do { try await Task.sleep(for: .seconds(5)) } catch { return }
            }
        }
    }
    @ViewBuilder private var content: some View {
        switch selected {
        case .tonight: TonightView()
        case .sleep: InsightsView()
        case .coach: CoachView()
        case .routines: RoutinesView()
        case .settings: ConnectionsView()
        }
    }
    private func navigationButton(_ tab: SleepTab, horizontal: Bool) -> some View {
        Button { selected = tab } label: {
            if horizontal {
                Label(tab.rawValue, systemImage: tab.icon).font(.subheadline)
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading).padding(.horizontal, 12)
                    .background(selected == tab ? SleepTheme.accent.opacity(0.08) : .clear, in: .rect(cornerRadius: 8))
            } else {
                VStack(spacing: 6) { Image(systemName: tab.icon).font(.system(size: 22)); Text(tab.rawValue).font(.system(size: 10, weight: .medium)) }
                    .frame(maxWidth: .infinity, minHeight: 52)
            }
        }.buttonStyle(.plain)
            .foregroundStyle(selected == tab ? SleepTheme.accent : .secondary)
            .accessibilityAddTraits(selected == tab ? .isSelected : [])
    }
}
