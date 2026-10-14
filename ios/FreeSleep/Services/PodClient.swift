import Foundation

struct PodClient: Sendable {
    private static let session = URLSession(configuration: .ephemeral, delegate: RejectRedirects(), delegateQueue: nil)
    let baseURL: URL
    let token: String

    static func configured() throws -> PodClient {
        let address = UserDefaults.standard.string(forKey: "podURL") ?? ""
        return try PodClient(address: address, token: TokenStore.read(for: address))
    }
    init(address: String, token: String) throws {
        guard let url = URL(string: address), let scheme = url.scheme, let host = url.host,
              ["http", "https"].contains(scheme), url.user == nil, url.password == nil,
              (url.path.isEmpty || url.path == "/"), url.query == nil, url.fragment == nil else {
            throw PodError.message("Enter your Pod address in Settings, such as http://free-sleep.local:3000.")
        }
        let parts = host.split(separator: ".").compactMap { Int($0) }
        let privateIP = parts.count == 4 && parts.allSatisfy { (0...255).contains($0) } && (parts[0] == 10 || (parts[0] == 192 && parts[1] == 168)
            || (parts[0] == 172 && (16...31).contains(parts[1])))
        guard scheme == "https" || host == "localhost" || host == "127.0.0.1" || host.hasSuffix(".local") || privateIP else {
            throw PodError.message("Use HTTPS for a remote connection, or an address on your home network.")
        }
        baseURL = url; self.token = token
    }

    private func request(_ route: String, method: String, query: [URLQueryItem] = [], body: Data? = nil) async throws -> Data {
        var components = URLComponents(url: baseURL.appending(path: "api").appending(path: route), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { components.queryItems = query }
        var request = URLRequest(url: components.url!)
        request.httpMethod = method; request.httpBody = body; request.timeoutInterval = route == "ai/coach" ? 50 : 15
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if !token.isEmpty { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let (data, response) = try await Self.session.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw PodError.message("No response from the Pod.") }
        guard (200..<300).contains(response.statusCode) else {
            if response.statusCode == 401 { throw PodError.message("Check your connection token in Settings.") }
            let failure = try? JSONDecoder().decode(APIError.self, from: data)
            throw PodError.message(failure?.error.message ?? "The Pod returned an error (\(response.statusCode)).")
        }
        return data
    }
    func get<Result: Decodable & Sendable>(_ route: String, query: [URLQueryItem] = []) async throws -> Result {
        try JSONDecoder().decode(Result.self, from: await request(route, method: "GET", query: query))
    }
    func post<Body: Encodable & Sendable>(_ route: String, body: Body) async throws {
        _ = try await request(route, method: "POST", body: JSONEncoder().encode(body))
    }
    func postReturning<Result: Decodable & Sendable, Body: Encodable & Sendable>(_ route: String, body: Body) async throws -> Result {
        try JSONDecoder().decode(Result.self, from: await request(route, method: "POST", body: JSONEncoder().encode(body)))
    }
    func action(_ route: String) async throws { _ = try await request(route, method: "POST", body: Data("{}".utf8)) }
    func coach(side: BedSide, provider: String, share: Bool, question: String, days: Int = 30) async throws -> Coaching {
        struct Body: Encodable { var side: String; var provider: String; var shareSummary: Bool; var question: String; var days: Int }
        let body = Body(side: side.rawValue, provider: provider, shareSummary: share, question: question, days: days)
        return try JSONDecoder().decode(Coaching.self, from: await request("ai/coach", method: "POST", body: JSONEncoder().encode(body)))
    }
    func healthExport<Record: Decodable & Sendable & Identifiable>(kind: String, query: [URLQueryItem]) async throws -> [Record] where Record.ID == Int {
        var records: [Record] = []
        var cursor = 0
        while true {
            try Task.checkCancellation()
            let page: HealthExportPage<Record> = try await get("health/export", query: query + [
                URLQueryItem(name: "kind", value: kind), URLQueryItem(name: "afterId", value: String(cursor))])
            let identifiers = page.records.map(\.id)
            guard identifiers == identifiers.sorted(), Set(identifiers).count == identifiers.count,
                  identifiers.allSatisfy({ $0 > cursor }), records.count + page.records.count <= 200_000 else {
                throw PodError.message("Health export returned inconsistent or excessive records. Retry with a shorter period.")
            }
            records.append(contentsOf: page.records)
            guard let next = page.nextCursor else { return records }
            guard next > cursor, next == identifiers.last else { throw PodError.message("Health export returned an inconsistent cursor. Retry the sync.") }
            cursor = next
        }
    }
    private struct APIError: Decodable { struct Detail: Decodable { var message: String }; var error: Detail }
}

private struct HealthExportPage<Record: Decodable & Sendable>: Decodable, Sendable { var records: [Record]; var nextCursor: Int? }

private final class RejectRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
