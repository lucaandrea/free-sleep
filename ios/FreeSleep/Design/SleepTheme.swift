import SwiftUI

enum SleepTheme {
    static let accent = Color(red: 198 / 255, green: 65 / 255, blue: 28 / 255)
    static func canvas(_ scheme: ColorScheme) -> Color {
        scheme == .dark ? Color(red: 25 / 255, green: 24 / 255, blue: 23 / 255) : Color(red: 250 / 255, green: 246 / 255, blue: 241 / 255)
    }
    static func surface(_ scheme: ColorScheme) -> Color {
        scheme == .dark ? Color(red: 37 / 255, green: 35 / 255, blue: 33 / 255) : .white
    }
    static func border(_ scheme: ColorScheme) -> Color { scheme == .dark ? .white.opacity(0.12) : Color(red: 232 / 255, green: 226 / 255, blue: 218 / 255) }
}
