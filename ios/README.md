# Native Free Sleep

SwiftUI, iOS 18+, Xcode 27 used for validation. Generate the checked-in project using `xcodegen generate`. Main navigation, colors, cards and content follow the responsive web app; HealthKit, HomeKit and Shortcuts use native frameworks.

Release signing uses Luca Andrea Collins's team `9FNNQ6J269` and the `Free Sleep App Store 2026` distribution profile. Debug signing remains automatic. The project and `ExportOptions.plist` contain identifiers only; install the matching certificate/private key and profile through your Apple account. See [TestFlight release](../docs/TESTFLIGHT_RELEASE.md) for the archive/export procedure and verified release status.

Shared colors, typography and dimensions are generated from `design/tokens.json`. After changing those values, run `node scripts/generate-design.mjs` from the repository root, then `xcodegen generate` here if files were added. Generated Swift and color assets are committed, so Xcode builds do not require Node. See [design alignment](../docs/DESIGN_PARITY.md) for the shared components and remaining screen differences.

See [platform setup](../docs/PLATFORM_SETUP.md) for signing and connection, and [Apple integrations](../docs/APPLE_INTEGRATIONS.md) for personal Health setup, automatic sync, privacy, Shortcuts and device acceptance checks. Launch a Debug build with `--demo` for labelled sample data and simulated controls. Release builds ignore that argument. Debug demo mode blocks Health access and system actions; live Shortcuts use the saved authenticated API connection.

Tonight includes the same next-alarm card and one-time change, skip and restore controls as the web app. Dates and times use the Pod timezone; native clock input stays independent of the phone timezone. See [alarm behavior](../docs/ALARMS.md) for date boundaries and the four alarm actions available in Shortcuts.

Routines shares its layout and sample week with the web app. Drafts survive screen/day/side changes within the running app and retain their original server values for conflict checks. Saving copies complete routines to selected days; an existing draft on a destination must be saved or reset first. Update the server and gateway with the client: saving uses the new `POST /api/schedules/routine` contract. See [routine editing and API](../docs/ROUTINES.md).

Sleep includes the same episode browser and vital charts as the web app, with the shared `sleep-demo.json` fixture. Short episodes, gaps and original readings are preserved. Detail requests are cancelled when their view context changes, and responses must match the selected side and episode. See [recorded episodes](../docs/EPISODES.md) for filtering and API limits.

The coverage card shows the server's period counts and date states. Older servers remain readable and display an update instruction when coverage is absent. Native demo calculations are tested against seven shared server-generated sparse/calendar cases; live calculations remain on the server. See [analytics coverage](../docs/DATA_QUALITY.md).

Coach displays calculated observations with expandable dates, contributing counts and methods, matching the web app. Model suggestions are labelled separately for review. Older servers remain readable but need an update to supply the calculation details. Demo receipts are compared with the shared server fixtures; no real model is called. See [Coach evidence](../docs/COACH_EVIDENCE.md).

Tests cover connection validation, analytics decoding, Health sample provenance, cancellation and partial failure, Pod/side isolation, reconciliation versions, automatic sync windows, preservation of schedule fields and alarm date/time contracts. HealthKit permissions, actual background refresh, Apple Home pairing and Siri behavior still need a signed iPhone.

All sixteen App Intents include parameter summaries. Request tests invoke the fifteen API-backed actions with isolated URLSession transports, covering side selection, exact payloads, returned values and errors without saved credentials or network access. Adaptive-comfort Shortcuts need the server and gateway's `POST /api/comfort/mode` route, which changes the mode while preserving the latest limits. There is no fallback to the old read-and-rewrite behavior.

Device settings and System health now match the web’s common controls and section order. Preference saves compare the original fields to current server state and retain unrelated changes; install the updated server/gateway with `GET/POST /api/settings/preferences`. Shared demo preferences and health come from `device-demo.json`. Advanced maintenance and logs remain in the local web app. See [device preferences](../docs/DEVICE_PREFERENCES.md).

## Personal AI and Autopilot

Coach → Open personal intelligence supports direct OpenAI, Gemini and Anthropic API keys, Apple Foundation Models, and an Ollama server. See [setup, SDK provenance, Health history and research](../docs/NATIVE_INTELLIGENCE.md). Sensor-aware Autopilot settings are shared with the web app; the overnight controller runs on the Pod.
