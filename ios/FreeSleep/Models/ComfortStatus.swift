import Foundation

struct ComfortConfig: Codable, Sendable, Equatable {
    var mode: String
    var minimumF: Int
    var maximumF: Int
    static let initial = Self(mode: "off", minimumF: 70, maximumF: 95)
    var valid: Bool { ["off", "preview", "active"].contains(mode) && minimumF >= 55 && maximumF <= 110 && minimumF <= maximumF }
}

struct ComfortStatus: Decodable, Sendable {
    struct Decision: Decodable, Sendable { var reason: String; var baselineF: Double?; var proposedF: Double?; var eligible: Bool }
    struct Event: Decodable, Sendable { var at: Double; var message: String; var targetF: Double? }
    var config: ComfortConfig
    var offsetF: Double
    var pausedUntil: Double?
    var feedbackThrough: String?
    var decision: Decision
    var history: [Event]
    static let demo = Self(config: .initial, offsetF: 0, decision: .init(reason: "Adaptive comfort is off.", baselineF: 80, proposedF: 80, eligible: false), history: [])
}
