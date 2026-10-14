# Validation evidence

Initial validation: 2026-10-13. Follow-up evidence is dated below. Branch: `lucas-assistant/free-sleep-platform`.

## Automated source checks

- Server TypeScript compilation and generated output: passed. Sentry debug IDs injected locally; no source-map upload.
- Server ESLint: zero errors, 21 pre-existing warnings in legacy files.
- Server tests: 29 passed. Coverage includes protocol checksum/calibration fixtures, fragmented/corrupt telemetry, stale-state rejection, Stop cancelling pending feet motion, disconnect behavior, presence interval union, missing records, outlier filtering, timezone/wake dates, sparse calendar weeks, all four mocked provider contracts, token boundaries, journal concurrent writes and habit sample thresholds. Two Health export tests distinguish valid empty corrections from corrupt source records. Eleven adaptive-comfort tests cover overnight/DST timing, learning limits/consumed dates, preview, presence freshness, alarms/away mode, manual pause/restart, command expiry/shutdown, failures and corrupt storage.
- Gateway tests: 5 passed. Coverage includes token/allowlist enforcement, offline behavior, bounded request/response bodies, query/body forwarding with separate local credentials, disconnect without replay, and cancellation on timeout.
- Web TypeScript and ESLint: passed, zero errors and 9 pre-existing warnings. Hosted and demo builds passed. Heavy screens load separately; Vite still warns about a large shared bundle.
- Native iOS: Xcode 27 build and 14 Swift Testing tests passed on an isolated iOS 27 iPhone simulator. Tests cover connection boundaries, null analytics, HealthKit in-bed samples/overlap merging/stable side-scoped identifiers, invalid heart-rate filtering and preservation of schedule fields. Nine further Health tests cover changing Pod identity, damaged/duplicate exports, partner and type isolation, save failure, cancellation before deletion, clock rollback, write denial, automatic sync windows and merging sleep from multiple sources. These use injected stores and do not access the Health database. Minimum deployment target is iOS 18; iOS 18 runtime testing has not been performed.
- Xcode generated App Intents/Shortcuts metadata. This proves build-time discovery, not actual Siri execution.
- Python presence-heartbeat test: passed, including unchanged readings and failed-report retry limits. Python syntax checks passed for both touched stream files.
- Web demo transport test: passed. A configured external Pod address and an unhandled route both stay inside the in-process mock adapter; authorization headers are not forwarded. Normal demo API calls no longer rely on a service worker staying active.
- Shared design generation: all 15 generated TypeScript, Swift and adaptive-color outputs match `design/tokens.json`. Web build scripts now reject stale design outputs.

## Runtime checks

Browser demo and native simulator use labelled synthetic records. The compiled web demo was checked at 1440 px and 393 px: base preview versus explicit movement, reported simulated position, Stop, temperature apply, journal save, coaching result, routine navigation and dark mode. Its console reported no errors in the final check. The native simulator rendered Tonight, Sleep and Coach, including a simulated coaching result. Screenshots are in [screenshots](screenshots). These demonstrate rendering and simulated controls only. No owner's sleep or HealthKit data was used for model calls or screenshots.

The adaptive-comfort follow-up was checked in the built server using an isolated temporary data directory and local development mode: default Off, saved Preview, invalid-limit rejection, initially unknown presence, and empty-presence rejection all passed. No hardware connection was opened. Desktop and 393 px web previews saved Preview mode and displayed the activity entry; the native simulator saved Preview and rendered the same settings. The new captures are `comfort-web.png`, `comfort-web-phone.png`, `comfort-card.png` and `comfort-ios.png`. The web demo stayed functional after the service-worker-dependent transport was replaced for API requests.

The Health follow-up rendered the independent personal side selector, heart-rate and automatic-sync switches, and permission/link/sync controls in the isolated iPhone simulator. Demo Health actions stayed disabled. `health-ios-mirror.png` captures the native card in the browser mirror. No Health permissions were granted and no real Health samples were read or written. Background scheduling and twelve App Intents compiled; only a signed-device run can establish actual background and Siri behavior.

The shared-design follow-up passed web typecheck/lint, demo and hosted builds, the demo transport test, the native build and all fourteen native tests again. The 402 px web preview and iPhone simulator rendered the shared day/night palettes. Native temperature preview/apply, base preset preview/apply/Stop and navigation were exercised with simulated state. The custom native temperature slider exposed an adjustable Slider with its label, current value and 44-point interaction frame in the accessibility inspector. At the largest accessibility text size, navigation adapts to a readable menu; selecting Sleep from it worked. Text size and appearance were restored after the check. Captures: `parity-web-phone.png`, `parity-web-dark.png`, `parity-ios-tonight.png`, `parity-ios-dark.png`, `parity-ios-base.png` and `parity-ios-large-text.png`. These show the current builds, not complete visual parity; remaining screen differences are listed in [design alignment](DESIGN_PARITY.md).

## Alarm follow-up — 2026-10-14

- Server compilation and all 41 tests passed. Twelve alarm tests cover overnight/afternoon/week boundaries, real recurrence-rule previews, DST gaps and repeated hours, absolute expiry, original vibration profiles, stale edits and restores (including equal-expiry revisions), serialized concurrent settings writes, failed writes and real HTTP persistence/legacy compatibility. HTTP tests mount only the routers against temporary storage; they do not start a scheduler or connect to hardware.
- Server lint: zero errors, the same 21 legacy warnings. Generated server output is updated with local Sentry debug IDs; no source maps were uploaded.
- Web typecheck and lint passed with the same nine legacy warnings. Demo and hosted builds passed; Vite still reports large shared chunks. All 15 shared design outputs match their source. The demo transport isolation test passed.
- All five gateway tests passed, including the new alarm route allowlist and outbound alarm JSON forwarding. The force/test-alarm route stays excluded.
- Native build and all 18 Swift Testing tests passed on the isolated iOS 27 simulator. Four alarm tests cover Pod timezone formatting, 24-hour values, encoded occurrence/revision identities, Shortcuts input validation, side isolation, stale restores with equal expiry and demo DST/expiry rejection. Xcode generated metadata for sixteen App Intents. iOS 18 runtime testing and signed-device Siri execution remain unverified.
- The 402 px web demo and native simulator completed change, skip and restore flows. Both display the alarm date and Pod timezone; the native editor uses the system time picker. A final web check exercised the revision-bearing restore request. Final captures: `alarm-web-changed.jpg`, `alarm-web-restored.jpg`, `alarm-ios-editor.jpg`, `alarm-ios-changed.jpg`, and `alarm-ios-restored.jpg` in [screenshots](screenshots). These are labelled simulated states.

No owner Pod, live vibration, Health database or provider account was used for this follow-up. Alarm changes do not move scheduled power-off; the selected side still must be on when the alarm fires. See [alarm behavior and API](ALARMS.md).

## Routines follow-up — 2026-10-14

- Server compilation and all 45 tests passed. Four new routine tests cover overnight/afternoon offsets, active-window boundaries, disabling an invalid legacy window, Monday–Friday copying, full adjustment deletion, false flags, side/weekend isolation, all-or-nothing conflicts and concurrent HTTP writes. The route test also invokes actual scheduled callbacks with injected fake senders to check disabled/away/timezone/start changes, deleted adjustments and edited alarm profiles. Temporary storage is removed after the tests; hardware executors are not called.
- Server lint remains at zero errors and 21 legacy warnings. Generated JavaScript/source maps include local Sentry debug IDs; nothing was uploaded.
- Web typecheck, demo and hosted builds passed. Web lint has zero errors and eight legacy warnings after the obsolete routine components were removed. Vite still reports large shared chunks. All 15 design outputs match the shared source, and the demo transport isolation test passed.
- All five gateway tests passed, including strict method/path allowlisting and request-body forwarding for `POST /api/schedules/routine`.
- Native build and all 22 Swift Testing tests passed on the isolated iOS 27 simulator. Four new tests cover the shared week, timing and chart order, invalid/duplicate copy targets, incomplete-week rejection, draft baselines surviving refresh, side/day isolation and demo saves updating Tonight's next alarm. The final UI reset adjustment was followed by another successful native build.
- In the 402 px web demo, switching day/side/screen retained drafts. Copying Monday–Friday applied the selected temperature and removed adjustment while preserving Sunday and the right side. Duplicate adjustment input produced feedback. Reload saved restored the saved values and cleared both the draft and the editor's error. The final build saved a 61-second alarm to Monday–Friday and displayed the five-day success message.
- The iPhone simulator rendered the same routine groups and overnight chart from the shared fixture. A simulated 61-second weekday save displayed the same five-day success message. Duplicate adjustment feedback and reset were also exercised. The native time picker, confirmation sheet and system accessibility presentation remain native.

Captures in [screenshots](screenshots): `routines-web-phone.jpg`, `routines-web-saved.jpg`, `routines-ios-top.jpg` and `routines-ios-saved.jpg`. They show labelled demo state. The screenshots establish layout and simulated behavior, not complete visual identity or physical schedule execution. See [routine behavior and API](ROUTINES.md).

No owner Pod, live vibration, Health database, cloud model or Replit deployment was used in this follow-up. Cross-day overlap detection, iOS 18 runtime testing and physical overnight qualification remain open.

## Remaining device and service checks

- Stock Pod access, firmware compatibility, installation/recovery, D-Bus permissions, BLE service discovery and real motion/Stop/calibration.
- Continuous temperature/biometric operation on the owner's embedded Pod, especially through network loss and reboot.
- Real provider responses, account/model access, latency, cost and coaching quality. Adapter tests use mocked responses.
- Signed iPhone installation, HealthKit read/write authorization, repeat sync with real Health data, Apple Home pairing/persistence/scenes and Siri execution while locked/offline.
- Replit deployment, external HTTPS, actual outbound tunnel and remote operation. A service definition and configuration are supplied, not installed.
- Proprietary sleep stages, snoring/apnea/readiness models and sleep-stage-driven thermal Autopilot. Those features are not implemented or claimed. The new feedback-based adaptive controller requires actual Pod and overnight qualification.

No physical-device, live-deployment, clinical, or subscription-equivalence claim follows from these checks.
