import Foundation

struct JournalEntry: Codable, Sendable {
    var date: String
    var side: String
    var restfulness = 3
    var comfort = "comfortable"
    var caffeine = false
    var alcohol = false
    var exercise = false
    var notes = ""
}
struct Journal: Decodable, Sendable {
    struct Patterns: Decodable, Sendable {
        struct Association: Decodable, Sendable {
            var habit: String
            var withCount: Int
            var withoutCount: Int
            var presenceDifferenceMinutes: Int
        }
        var associations: [Association]
        var note: String
    }
    var entries: [JournalEntry]
    var patterns: Patterns
}
