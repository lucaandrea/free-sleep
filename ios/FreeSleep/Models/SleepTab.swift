import Foundation

enum SleepTab: String, CaseIterable {
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
