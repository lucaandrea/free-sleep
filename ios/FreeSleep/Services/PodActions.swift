import Foundation

// System actions use the same API as the app, and never send commands from its demo mode.
enum PodActions {
    static func client() throws -> PodClient {
        try AppMode.requireLiveConnection()
        return try PodClient.configured()
    }
    static func setComfort(side: BedSide, mode: ComfortMode) async throws {
        let client = try client()
        let status: ComfortStatus = try await client.get("comfort", query: [URLQueryItem(name: "side", value: side.rawValue)])
        var config = status.config
        config.mode = mode.rawValue
        struct Request: Encodable { var side: BedSide; var config: ComfortConfig }
        try await client.post("comfort", body: Request(side: side, config: config))
    }
    static func temperature(side: BedSide, reading: TemperatureReading) async throws -> Double {
        let status: DeviceStatus = try await client().get("deviceStatus")
        return reading == .current ? status[side].currentTemperatureF : status[side].targetTemperatureF
    }
}
