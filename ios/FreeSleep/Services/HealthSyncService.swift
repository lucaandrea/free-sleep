import Foundation
import HealthKit
import Observation

@MainActor @Observable
final class HealthSyncService {
    var available = HKHealthStore.isHealthDataAvailable()
    var busy = false
    var message: String?
    var healthSleepMinutes: Double?
    var healthHRV: Double?
    var healthHeartRate: Double?
    var healthRespiratoryRate: Double?
    private let store = HKHealthStore()
    private let sleepType = HKCategoryType(.sleepAnalysis)
    private let heartType = HKQuantityType(.heartRate)
    private let hrvType = HKQuantityType(.heartRateVariabilitySDNN)

    func authorize() async {
        guard available else { message = "Apple Health is not available on this device."; return }
        busy = true; defer { busy = false }
        do {
            try await store.requestAuthorization(toShare: [sleepType, heartType], read: [sleepType, heartType, hrvType, HKQuantityType(.respiratoryRate)])
            message = "Permission choices saved. Health keeps read permissions private; an empty result may mean no data or no access."
            try await refreshComparison()
        } catch { message = error.localizedDescription }
    }

    // Apple-derived sleep stays on this iPhone; merge overlaps from multiple sources.
    func refreshComparison() async throws {
        let start = Date().addingTimeInterval(-24 * 3600)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: Date(), options: [])
        let sleepQuery = HKSampleQueryDescriptor(predicates: [.categorySample(type: sleepType, predicate: predicate)],
            sortDescriptors: [SortDescriptor(\.startDate)], limit: HKObjectQueryNoLimit)
        let sleep = try await sleepQuery.result(for: store).filter {
            $0.sourceRevision.source.bundleIdentifier != Bundle.main.bundleIdentifier
                && [HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue, HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                    HKCategoryValueSleepAnalysis.asleepDeep.rawValue, HKCategoryValueSleepAnalysis.asleepREM.rawValue].contains($0.value)
        }
        var merged: [DateInterval] = []
        for sample in sleep {
            let interval = DateInterval(start: max(start, sample.startDate), end: min(Date(), sample.endDate))
            if let previous = merged.last, previous.end >= interval.start {
                merged[merged.count - 1] = DateInterval(start: previous.start, end: max(previous.end, interval.end))
            } else { merged.append(interval) }
        }
        healthSleepMinutes = merged.isEmpty ? nil : merged.reduce(0) { $0 + $1.duration } / 60
        let hrvQuery = HKSampleQueryDescriptor(predicates: [.quantitySample(type: hrvType, predicate: predicate)],
            sortDescriptors: [SortDescriptor(\.startDate, order: .reverse)], limit: 1)
        for identifier in [HKQuantityTypeIdentifier.heartRate, .respiratoryRate] {
            let query = HKSampleQueryDescriptor(predicates: [.quantitySample(type: HKQuantityType(identifier), predicate: predicate)],
                sortDescriptors: [SortDescriptor(\.startDate, order: .reverse)], limit: 1)
            let sample = try await query.result(for: store).first
            let value = sample?.quantity.doubleValue(for: .count().unitDivided(by: .minute()))
            if identifier == .heartRate { healthHeartRate = value } else { healthRespiratoryRate = value }
        }
        healthHRV = try await hrvQuery.result(for: store).first?.quantity.doubleValue(for: .secondUnit(with: .milli))
    }

    // Export only the selected person's side. Stable IDs replace samples on repeat sync.
    func sync(side: BedSide, exportHeartRate: Bool) async {
        guard available else { return }
        busy = true; message = nil
        defer { busy = false }
        do {
            let client = try PodClient.configured()
            let start = Date().addingTimeInterval(-30 * 86400)
            let query = [URLQueryItem(name: "side", value: side.rawValue),
                URLQueryItem(name: "startTime", value: start.ISO8601Format()), URLQueryItem(name: "endTime", value: Date().ISO8601Format())]
            async let identityRequest: HealthExportRecords.Identity = client.get("settings")
            async let recordsRequest: [HealthExportRecords.Sleep] = client.healthExport(kind: "presence", query: query)
            let (identity, records) = try await (identityRequest, recordsRequest)
            let version = Int(Date().timeIntervalSince1970 * 1000)
            var samples = HealthSampleBuilder.presence(records, pod: identity.id, side: side, version: version)
            if exportHeartRate {
                let vitals: [HealthExportRecords.Vital] = try await client.healthExport(kind: "heart", query: query)
                samples += HealthSampleBuilder.heart(vitals, pod: identity.id, side: side, version: version)
            }
            let types: [HKSampleType] = exportHeartRate ? [sleepType, heartType] : [sleepType]
            guard types.allSatisfy({ store.authorizationStatus(for: $0) == .sharingAuthorized }) else {
                throw PodError.message("Allow writing the selected data types in Apple Health before syncing.")
            }
            // Save replacements first. Only then remove our obsolete samples in the same Pod/side/range.
            for offset in stride(from: 0, to: samples.count, by: 400) {
                try await store.save(Array(samples[offset..<min(offset + 400, samples.count)]))
            }
            let identifiers = Set(samples.compactMap { $0.metadata?[HKMetadataKeySyncIdentifier] as? String })
            let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [
                HKQuery.predicateForObjects(from: .default()),
                HKQuery.predicateForObjects(withMetadataKey: "FreeSleepPod", allowedValues: [identity.id]),
                HKQuery.predicateForObjects(withMetadataKey: "FreeSleepSide", allowedValues: [side.rawValue]),
                HKQuery.predicateForSamples(withStart: start, end: Date(), options: []),
            ])
            for type in types {
                let oldQuery = HKSampleQueryDescriptor(predicates: [.sample(type: type, predicate: predicate)], sortDescriptors: [], limit: HKObjectQueryNoLimit)
                let old = try await oldQuery.result(for: store)
                let removed = old.filter { sample in
                    guard let identifier = sample.metadata?[HKMetadataKeySyncIdentifier] as? String else { return false }
                    return !identifiers.contains(identifier)
                }
                if !removed.isEmpty { try await store.delete(removed) }
            }
            try await refreshComparison()
            message = "Synced \(samples.count) samples for your \(side.rawValue) side. Repeat syncs replace matching samples."
        } catch { message = error.localizedDescription }
    }

}
