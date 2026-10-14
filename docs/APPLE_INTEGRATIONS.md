# Apple integrations

Implemented and checked locally on 2026-10-13. The native app targets iOS 18 and newer. Signed-device Health permissions, real Home pairing and Siri execution remain acceptance checks on the owner's iPhone. The browser uses the same Pod API, but cannot directly access HealthKit, HomeKit permissions or App Intents.

## Personal Health setup

In native Settings, choose **My Health side**, optional Pod heart rate and whether to sync automatically. Choose Health permissions, then **Link my side to this Pod**. This saves the Pod's persistent ID together with the selected side. Browsing the other side elsewhere in the app does not change this selection. Changing servers to a different Pod stops sync until the user explicitly links their Health setup again.

**Sync the last 30 days** is available in Settings and as an App Intent. Presence is exported as `inBed`, not measured sleep or sleep stages. Optional heart rate is filtered to finite readings from 25–220 bpm. Each sample includes Pod and side provenance, a stable sync identifier and an increasing version. Pod HRV and breathing are not exported because equivalence to HealthKit's metric definitions has not been established.

Automatic sync is off until enabled. It runs on app activation and requests an iOS background refresh no earlier than one hour later. iOS chooses actual background execution; this is not an hourly guarantee. Background runs start only after a successful initial sync, retry no more often than every fifteen minutes, and overlap the previous successful range by two days to pick up corrections. Use a manual sync to reconcile older corrections in the thirty-day window. An unreachable Pod, locked Health database, disabled background refresh or expired execution time can prevent a run; the next successful run retries the range. Keep the app open for the initial backfill.

The app uses `BGAppRefreshTaskRequest` for pulling Pod records. It does not request HealthKit observer background delivery because a change to the iPhone's Health database is not the trigger for a Pod export.

## Reconciliation and privacy

The sync engine verifies the configured Pod identity before and after downloading the complete paginated export. Invalid cursors, duplicate IDs and damaged presence records stop the operation before Health writes. Server exports distinguish a valid empty record from corrupt source data. A sync without heart-rate export neither fetches nor reconciles heart-rate samples.

Replacement samples save in bounded batches before obsolete samples are deleted. Reconciliation is restricted to this app's source, matching Pod ID, selected side, selected data types and overlapping date window. Sync versions advance beyond existing samples even if the phone clock moves backwards. Cancellation or a failed save can leave completed batches in Health; the next sync finishes reconciliation. This is intentionally recoverable batch processing, not an atomic transaction. Cancellation cannot roll back a HealthKit save that already completed.

Manual, automatic and Shortcut syncs share one service and reject overlapping operations. Health values stay in memory on the phone. Saved preferences contain only Pod/side selection, sync options, attempt/success timestamps and a sample count; no Health readings or credentials are stored in those preferences. API credentials remain in Keychain.

The comparison card reads the past twenty-four hours from other Health sources, excluding Free Sleep's own exports. Overlapping sleep intervals are merged so two devices do not double-count the same time. Heart rate, SDNN HRV and respiration display their source and timestamp. An empty result is unknown, not zero and not proof of denied access: HealthKit intentionally keeps read authorization private. These comparisons are not uploaded to the Pod, web app or AI providers.

## Shortcuts and Siri

| Action | Parameters or output |
| --- | --- |
| Set bed temperature | Side, target 55–110°F |
| Get bed temperature | Side, reported current/target reading; returns Fahrenheit |
| Set bed power | Side, on/off |
| Set bed position | Whole-base preset |
| Set head and feet angles | Head 0–60°, feet 0–45°; both sides move together |
| Stop bed movement | Sends Stop independently of the ordinary action queue |
| Set adaptive comfort | Side, Off/Preview/Active; retains saved temperature limits |
| Set Away mode | Side, away/home |
| Prime the Pod | Starts a whole-Pod priming cycle |
| Dismiss bed alarm | Side |
| Get sleep routine summary | Side; returns presence summary text |
| Sync Apple Health | Saved personal Health setup; returns written/updated sample count |

Ten actions have discoverable App Shortcut phrases. All twelve App Intents are available to compose in Shortcuts. Health sync and the personal routine summary require local device authentication. Network errors are returned to Shortcuts, not reported as completed actions. A successful control response acknowledges the command, not physical movement or temperature convergence. Debug demo mode blocks system actions and Health access. Release builds ignore the demo launch argument.

## Apple Home

The Pod's optional local HAP bridge exposes two thermostats and named switches for base presets, Stop and priming. Pair it in Apple Home using the code shown in Settings after enabling the bridge; its identity and pairing data persist locally. The native app can list and run existing Home scenes after permission. Base movement needs an explicitly connected, hardware-qualified base. Replit is not a replacement for the local bridge or Apple's home hub. See [platform setup](PLATFORM_SETUP.md) for bridge environment variables, pairing and device acceptance.

## Sources and validation boundary

- [Apple background refresh requests](https://developer.apple.com/documentation/backgroundtasks/bgapprefreshtaskrequest) and [SwiftUI app refresh](https://developer.apple.com/documentation/swiftui/backgroundtask/apprefresh(_:)) define opportunistic scheduling and cancellation handling.
- [HealthKit sync identifiers](https://developer.apple.com/documentation/healthkit/hkmetadatakeysyncidentifier) and [sync versions](https://developer.apple.com/documentation/healthkit/hkmetadatakeysyncversion) support updating an app's earlier samples.
- [App Intent local authentication](https://developer.apple.com/documentation/appintents/intentauthenticationpolicy/requireslocaldeviceauthentication) requires unlocking for the personal Health actions.
- [HealthKit authorization](https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data) explains per-type access and the privacy boundary around read permission.

Automated tests exercise the sync engine using an injected in-memory Health store and Pod source. They do not grant HealthKit permission or alter anyone's Health database. Xcode builds and generates intent metadata. Simulator UI checks prove rendering; a signed-device run is still needed for actual permissions, background delivery, repeat HealthKit reconciliation and Siri behavior.
