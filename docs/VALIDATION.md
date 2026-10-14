# Validation evidence

Validation date: 2026-10-13. Branch: `lucas-assistant/free-sleep-platform`.

## Automated source checks

- Server TypeScript compilation and generated output: passed. Sentry debug IDs injected locally; no source-map upload.
- Server ESLint: zero errors, 21 pre-existing warnings in legacy files.
- Server tests: 27 passed. Coverage includes protocol checksum/calibration fixtures, fragmented/corrupt telemetry, stale-state rejection, Stop cancelling pending feet motion, disconnect behavior, presence interval union, missing records, outlier filtering, timezone/wake dates, sparse calendar weeks, all four mocked provider contracts, token boundaries, journal concurrent writes and habit sample thresholds. Eleven adaptive-comfort tests cover overnight/DST timing, learning limits/consumed dates, preview, presence freshness, alarms/away mode, manual pause/restart, command expiry/shutdown, failures and corrupt storage.
- Gateway tests: 5 passed. Coverage includes token/allowlist enforcement, offline behavior, bounded request/response bodies, query/body forwarding with separate local credentials, disconnect without replay, and cancellation on timeout.
- Web TypeScript and ESLint: passed, zero errors and 9 pre-existing warnings. Hosted and demo builds passed. Heavy screens load separately; Vite still warns about a large shared bundle.
- Native iOS: Xcode 27 build and 5 Swift Testing tests passed on an isolated iOS 27 iPhone simulator. Tests cover connection boundaries, null analytics, HealthKit in-bed samples/overlap merging/stable side-scoped identifiers, invalid heart-rate filtering and preservation of schedule fields. Minimum deployment target is iOS 18; iOS 18 runtime testing has not been performed.
- Xcode generated App Intents/Shortcuts metadata. This proves build-time discovery, not actual Siri execution.
- Python presence-heartbeat test: passed, including unchanged readings and failed-report retry limits. Python syntax checks passed for both touched stream files.
- Web demo transport test: passed. A configured external Pod address and an unhandled route both stay inside the in-process mock adapter; authorization headers are not forwarded. Normal demo API calls no longer rely on a service worker staying active.

## Runtime checks

Browser demo and native simulator use labelled synthetic records. The compiled web demo was checked at 1440 px and 393 px: base preview versus explicit movement, reported simulated position, Stop, temperature apply, journal save, coaching result, routine navigation and dark mode. Its console reported no errors in the final check. The native simulator rendered Tonight, Sleep and Coach, including a simulated coaching result. Screenshots are in [screenshots](screenshots). These demonstrate rendering and simulated controls only. No owner's sleep or HealthKit data was used for model calls or screenshots.

The adaptive-comfort follow-up was checked in the built server using an isolated temporary data directory and local development mode: default Off, saved Preview, invalid-limit rejection, initially unknown presence, and empty-presence rejection all passed. No hardware connection was opened. Desktop and 393 px web previews saved Preview mode and displayed the activity entry; the native simulator saved Preview and rendered the same settings. The new captures are `comfort-web.png`, `comfort-web-phone.png`, `comfort-card.png` and `comfort-ios.png`. The web demo stayed functional after the service-worker-dependent transport was replaced for API requests.

## Not yet verified

- Stock Pod access, firmware compatibility, installation/recovery, D-Bus permissions, BLE service discovery and real motion/Stop/calibration.
- Continuous temperature/biometric operation on the owner's embedded Pod, especially through network loss and reboot.
- Real provider responses, account/model access, latency, cost and coaching quality. Adapter tests use mocked responses.
- Signed iPhone installation, HealthKit read/write authorization, repeat sync with real Health data, Apple Home pairing/persistence/scenes and Siri execution while locked/offline.
- Replit deployment, external HTTPS, actual outbound tunnel and remote operation. A service definition and configuration are supplied, not installed.
- Proprietary sleep stages, snoring/apnea/readiness models and sleep-stage-driven thermal Autopilot. Those features are not implemented or claimed. The new feedback-based adaptive controller requires actual Pod and overnight qualification.

No physical-device, live-deployment, clinical, or subscription-equivalence claim follows from these checks.
