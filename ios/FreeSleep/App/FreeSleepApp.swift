import SwiftUI

@main
struct FreeSleepApp: App {
    @State private var model = AppModel()
    var body: some Scene {
        WindowGroup { RootView().environment(model).tint(SleepTheme.accent) }
    }
}
