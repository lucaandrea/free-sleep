import Foundation

struct PodSettings: Decodable, Sendable {
    struct Side: Decodable, Sendable { var name: String; var awayMode: Bool }
    var id: String
    var timeZone: String
    var temperatureFormat: String
    var left: Side
    var right: Side
    subscript(side: BedSide) -> Side { side == .left ? left : right }
}
