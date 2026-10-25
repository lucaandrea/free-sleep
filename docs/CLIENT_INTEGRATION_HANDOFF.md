# Unified client contract and implementation status

Updated 2026-10-25. This is a coordination note, not a declaration that the Pod has migrated.

## Revisions and ownership

- Core: `../sleepypod-core`, branch `lucas-assistant/unified-sleep`, revision `9ff9cd3` (offline migration and explicit overnight shutdowns; Preview feature `6b51f04`, validation/loading fixes `70e96a0`, signal validity `5767b40`, and demo unavailability `a016342`) (stable v3.4.0 baseline plus reviewed integration changes). Migration follow-up draft PR: https://github.com/lucaandrea/sleepypod-core/pull/2. Foundation PR #1 was merged into Core main at `3c3dccd`.
- Free Sleep native foundation: branch `lucas-assistant/unified-sleepypod`, with the five-destination interface at `6dd26c5`. Draft PR: https://github.com/lucaandrea/free-sleep/pull/5.
- The physical Pod still runs customized Free Sleep. Core is tested locally and has NOT replaced that controller. The home-host/Core work does not change client signing or App Store distribution.
- Current Core validation: the personal comfort Preview passed 564 targeted tests, followed by 14 UI/runtime regression tests after browser review (one additional test). TypeScript, full ESLint and both Drizzle checks passed. The complete Preview push gate passed 3,124 tests; the final signal-validity/demo follow-up passed 2,745 related tests in 97 files, plus TypeScript/full ESLint/both Drizzle checks. Its focused runs passed 226 automation tests and 90 demo/contract/runtime tests. Earlier capability gates passed 1,249 and 435 tests. These are software checks, not hardware qualification.
- Production Preview build passed. Isolated loopback checks verified owner authentication, status, Preview configuration, rejected active mode (412), rejected future check-ins (400), OpenAPI and separate Preview/active capabilities. Desktop and 390px browser checks verified the panel and synthetic check-ins. The local CI-mode server correctly showed no evaluated night and a stopped Preview runtime. The demo transport now returns an explicit live-Pod requirement and rejects comfort writes; 90 demo/contract/runtime tests passed. No real hardware or owner key was used.

## Implemented Core transport

Use the controller origin plus `/api` for REST, or `/api/trpc` for tRPC. The authenticated `/api/openapi.json` is authoritative for exact request/response schemas; upstream `protect: false` metadata does **not** bypass this fork's route-level authentication.

Native and embedded clients send `Authorization: Bearer <owner connection key>` on every protected request and WebSocket upgrade. Keep keys in Keychain or the device's appropriate protected storage, never a URL. Native clients do not need the browser login-cookie exchange. Do not follow redirects carrying Authorization to another origin.

`GET /api/auth/session` returns `{configured: boolean, authenticated: boolean}` without requiring credentials. Missing server key closes protected endpoints with 503; invalid/missing credentials return 401. Browser login is `POST /api/auth/session` with `{token}` and matching Origin; logout is DELETE on the same path. Browser cookies expire after 12 hours.

The raw sensor WebSocket currently listens on port 3001. Its Bearer handshake is authenticated; browser sessions also enforce the configured hostname. Private HTTPS proxying must retain the original Host/Origin. See Core's `docs/OWNER_ACCESS.md`.

The Lenovo's private HTTPS service now reaches **Home Assistant**, with verified TLS, an authenticated API boundary and authenticated WebSocket handshake. It is **not a Core origin**. Core still has no deployed private origin or provisioned physical-device owner key. Keep native and bedside clients visibly unconfigured/offline until a qualified Core deployment supplies those values through protected local provisioning. Do not use the Home Assistant URL or credentials for Pod control. No public relay is available.

| Capability | Implemented Core REST route | Important behavior |
| --- | --- | --- |
| Pod status | `GET /api/device/status` | Use reported state and freshness; do not interpret response success as physical proof. |
| Temperature owner | `GET /api/device/temperature/control` | Per-side source, requestId, targetTemperature, holdUntil, blocked. |
| Set temperature | `POST /api/device/temperature` | `{side, temperature, duration?, holdMinutes?}`; Fahrenheit, 55–110 hardware range. Manual control through sole authority. |
| Power | `POST /api/device/power` | `{side, powered, temperature?}`. Do not silently retry an uncertain actuator outcome. |
| Resume schedule | `POST /api/device/temperature/resume` | Consult OpenAPI for exact input. |
| Base discovery | `GET /api/base/availability`, `GET /api/base/status` | `configured` is not qualification. Respect stale/null position and connection state. |
| Base movement | `POST /api/base/position` | `{head, feet, feedRate?, sides?}`. Head 0–60°, feet 0–45°, feedRate 30–100. Whole-bed only; default both sides. Free Sleep's `speed` field is not Core's `feedRate`. |
| Base preset/Stop | `POST /api/base/preset`, `POST /api/base/stop` | Presets `flat`, `sleep`, `relax`, `read`; keep Stop prominent. Actual bed movement/Stop is unqualified. |
| Base reconnect | `POST /api/base/reconnect` | Free Sleep uses a different `/base/connect` route. |
| Alarm vibration | `POST /api/device/alarm`, `/device/alarm/clear`, `/device/alarm/snooze` | Software routes exist; Pod 4 routing/pattern/intensity/duration remain unqualified. No music capability claim. |
| Rules | `/api/automations`, `/automations/status`, `/automations/kill-switch`, `/automations/dry-run` | Rules engine with separate consent; the personal learner currently produces Preview observations only. Missing settings default disabled. |

MCP and raw actuator passthrough remain disabled by default. Embedded controls must use the narrow supported routes, not `/device/execute`.

## Legacy Free Sleep comfort contract: compatibility pending

Core implements a persisted Preview service and a separate v1 API, described below. Active personal comfort and the legacy response adapter remain unavailable. `TemperatureController.replacePolicy` admits isolated, expiring proposals under the existing side lock, but no active producer or durable actuator acknowledgment store is connected yet.

The compatibility implementation should preserve these existing Free Sleep contracts:

```ts
type Side = 'left' | 'right';
type ComfortConfig = {
  mode: 'off' | 'preview' | 'active';
  minimumF: number; maximumF: number;
  sensorAware?: boolean; followBedtime?: boolean;
};
// GET comfort?side=left
type ComfortStatus = {
  config: ComfortConfig;
  offsetF: number;
  pausedUntil: number | null; // epoch milliseconds
  feedbackThrough: string | null; // local calendar date YYYY-MM-DD
  decision: { reason: string; baselineF: number | null; proposedF: number | null; eligible: boolean };
  history: { at: number; message: string; targetF: number | null }[];
  signals?: AutopilotSignals; // authoritative definition: server/src/autopilot/signals.ts
  phaseShiftMinutes?: number;
};
// POST comfort: {side, config, reset?} -> ComfortStatus
// POST comfort/mode: {side, mode} -> HTTP 204
```

Defaults: Off, 70–95°F, at most 1°F per correction, 30-minute interval, bounded ±3°F learned offset, persisted six-hour pause after manual changes. Preview records proposals without issuing controls. Missing/stale/future sensors, low/unknown water, unoccupied bed, priming, vibration, base movement and alarm windows withhold correction. The global Autopilot setting must gate future active control as well as its own rules; the separate Preview service cannot issue controls. Heart rate alone is not a reason to autonomously change posture.

## Core personal comfort Preview: implemented

Core now exposes `GET /api/v1/comfort?side=left`,
`POST /api/v1/comfort/configure` and `POST /api/v1/comfort/feedback`.
These are new typed Core contracts, **not** the legacy Free Sleep response shape
above. Status returns nullable `state`, `decision`, `evaluatedAt`, a `fault`,
recent `history`, the service `runtime`, `generatedAt`, `timezone`, `deviceDate`
and explicit unavailable activation/adapter flags. Times use epoch milliseconds.
Canonical details: [Personal comfort Preview](https://github.com/lucaandrea/sleepypod-core/blob/a016342/docs/PERSONAL_COMFORT_PREVIEW.md).

Preview defaults Off, reads fresh Pod/calibrated presence and actual schedule
events, learns from local-date check-ins, and journals proposals without issuing
hardware commands. Manual temperature/power/resume/gesture/HomeKit/priming intent
now persists the six-hour pause. Configuration changes preserve that pause and
consumed-feedback cursors. `active`, `sensorAware: true` and
`followBedtime: true` are rejected pending the remaining adapters/qualification.
The existing core rules engine has separate configuration and behavior.

`features.personalComfortPreview` is implemented and reports whether its
service is running. `features.personalComfort` remains unavailable for active
control. Do not treat Preview eligibility or a configuration acknowledgment as
physical control, an observed sleep night, or evidence of sleep improvement.
No client-facing Core origin has been deployed yet.

## General automation signal validity

Core's rules engine now requires healthy DAC reports under fifteen seconds old,
non-future finite biometric/environmental readings, and fresh capacitance
sample and receipt timestamps. Historical windows cannot keep a rule active
when its current source disappears. Live policy requests withdraw when an
action or trigger input becomes unavailable, even between trigger times.
Explicit one-shot holds retain their bounded expiry. These changes do not
qualify the physical signals or connect room sensors. See Core's
[signal-validity contract](https://github.com/lucaandrea/sleepypod-core/blob/a016342/docs/AUTOMATION_SIGNAL_VALIDITY.md).

## Compatibility API: proposed, NOT implemented

Use **`/api/native/v1/`** for legacy response shapes, matching the client integration proposal. This prefix is chosen for coordination but its handlers are still unimplemented. Do not replace Core's `/api/settings`, `/api/schedules` or other existing routes with incompatible Free Sleep shapes. Add an explicit API-prefix option to the legacy native client rather than guessing server type or constructing a second `/api` segment.

Required legacy route families, as used by `ios/FreeSleep`:

- `settings`, `settings/preferences`, `deviceStatus`, `serverStatus`.
- `base`, `base/connect`, `base/position`, `base/preset`, `base/stop`.
- `schedules`, `schedules/routine` with compare-original concurrency protection; `alarm`, `alarm/next`, `alarm/override`.
- `comfort`, `comfort/mode`, `journal`.
- `analytics`, `analytics/episodes/{id}`, Health export/source identity routes.
- `ai/providers`, `ai/coach`, `ai/usage`, `ai/usage/limit`, `integrations/homekit`.

The client-side Apple Health, local-model, cloud consent/Keychain and HomeKit/Shortcuts features remain independently reusable. Their server-dependent screens must not show synthetic success when compatibility is unavailable. Inspect the actual Swift call sites and server schemas before mapping less common paths; the list above is not an implemented OpenAPI document.

## Capability negotiation: v1 implemented

**`GET /api/v1/capabilities`** is authenticated and implemented, also available as tRPC `capabilities.get({})` and in generated OpenAPI. The canonical schema and semantics are in Core's [contract](https://github.com/lucaandrea/sleepypod-core/blob/a016342/src/capabilities/contract.ts) and [client documentation](https://github.com/lucaandrea/sleepypod-core/blob/a016342/docs/CLIENT_CAPABILITIES.md).

- `apiVersion: 1`; `controller` identifies `sleepypod-core`, upstream baseline and nullable build revision.
- `endpoints.nativeCompatibility` is a nullable API path, currently **null**. Do not call `/api/native/v1/` yet.
- Each feature has `implemented`, `runtime` (`ready`, `not_ready`, `unknown`), `reason` and `physicalVerification` (`unverified`, `not_applicable`). Runtime readiness is preliminary technical evidence, not permission or physical qualification.
- `observations.device` and `.base` carry `freshness`, `observedAt` and `expiresAt` as UTC ISO timestamps. Device reports expire after 15 seconds; base reports after 10 seconds. Future/malformed data never becomes fresh. Do not reuse a response after expiry or disconnection.
- `baseScope` is `whole_bed`. `features.baseStop` remains separate from `baseMovement`; keep Stop visible even with stale positions or uncertain movement.
- `personalComfortPreview` is implemented; its readiness describes the observation service only. `personalComfort`, `nativeCompatibility`, `homeContext` and `musicVibration` currently have `implemented: false`. MQTT connection does not imply room-context integration.
- `controlSemantics` explicitly reports acceptance without physical verification; `durableCommandReceipts` and `commandExpiry` are booleans currently **false**. Do not retry an uncertain actuator request or replay it after reconnect.

The endpoint observes existing state without starting DAC, Bluetooth or MQTT. Versioned measurement/control envelopes with durable deduplication, expiry and unknown-outcome reconciliation remain separate pending work. No client-facing Core origin or real owner key has been provisioned on the physical Pod. A Wi-Fi device without Tailscale also needs a separately qualified LAN connection; the Lenovo's private Home Assistant URL is not a substitute.

Base automation, configurable vibration/music and active personal comfort remain gated on their own qualification and seven actual Preview nights. Acknowledgment is never evidence that the bed physically moved or vibrated.

## Offline migration and overnight schedule contract

Revision `9ff9cd3` passed 14 importer tests, 398 focused tests and the full
3,832-test related push gate (182 files), TypeScript, full ESLint, both Drizzle
checks and an isolated production build. The new follow-up PR is #2; merged
foundation PR #1 does not include this importer.

The Core importer now stages `free-sleep-migration/1` backups into a new review
candidate. It does not deploy a controller or create a Core origin/key. The
real saved backup passed an offline rehearsal; all 14 power and 14 alarm rows
remained disabled. Both legacy baselines are pending physical qualification.

Core power responses now include `offDayOffset` (`0` for the same calendar
weekday, `1` for the following weekday). Creates default to `0`; individual and
batch partial updates preserve the stored value. Imported overnight Free Sleep
rows use `1`. Temperature and alarm rows remain **calendar-day events**, so an
01:00 Sunday phase belongs to Saturday's overnight Free Sleep routine but is
stored under Sunday in Core. Clients must preserve this distinction and the
explicit shutdown offset. Existing curve delete/recreate workflows still need
qualification for imported routines before cutover.

The importer retains original biometric metrics and full journal/learning files
under `legacy/`; it does not mix old five-minute averages into Core's live metric
history or claim they are Preview nights. Core's alarm temperature warm-up/hold
also differs from Free Sleep and requires explicit migration review. Candidate
reports always say `readyForCutover: false`. See [Core migration](https://github.com/lucaandrea/sleepypod-core/blob/9ff9cd3/docs/FREE_SLEEP_MIGRATION.md) for
the complete translation and remaining gates.
