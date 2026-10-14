import Foundation

struct HealthExportRecords: Decodable, Sendable {
    struct Sleep: Decodable, Sendable {
        var id: Int
        var present_intervals: [[String]]
    }
    struct Vital: Decodable, Sendable {
        var id: Int
        var timestamp: String
        var heart_rate: Double?
    }
    struct Identity: Decodable, Sendable { var id: String }
}
