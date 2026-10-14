# Native Free Sleep

SwiftUI, iOS 18+, Xcode 27 used for validation. Generate the checked-in project using `xcodegen generate`. Main navigation, colors, cards and content follow the responsive web app; HealthKit, HomeKit and Shortcuts use native frameworks.

Shared colors, typography and dimensions are generated from `design/tokens.json`. After changing those values, run `node scripts/generate-design.mjs` from the repository root, then `xcodegen generate` here if files were added. Generated Swift and color assets are committed, so Xcode builds do not require Node. See [design alignment](../docs/DESIGN_PARITY.md) for the shared components and remaining screen differences.

See [platform setup](../docs/PLATFORM_SETUP.md) for signing and connection, and [Apple integrations](../docs/APPLE_INTEGRATIONS.md) for personal Health setup, automatic sync, privacy, Shortcuts and device acceptance checks. Launch a Debug build with `--demo` for labelled sample data and simulated controls. Release builds ignore that argument. Debug demo mode blocks Health access and system actions; live Shortcuts use the saved authenticated API connection.

Tonight includes the same next-alarm card and one-time change, skip and restore controls as the web app. Dates and times use the Pod timezone; native clock input stays independent of the phone timezone. See [alarm behavior](../docs/ALARMS.md) for date boundaries and the four alarm actions available in Shortcuts.

Routines shares its layout and sample week with the web app. Drafts survive screen/day/side changes within the running app and retain their original server values for conflict checks. Saving copies complete routines to selected days; an existing draft on a destination must be saved or reset first. Update the server and gateway with the client: saving uses the new `POST /api/schedules/routine` contract. See [routine editing and API](../docs/ROUTINES.md).

Tests cover connection validation, analytics decoding, Health sample provenance, cancellation and partial failure, Pod/side isolation, reconciliation versions, automatic sync windows, preservation of schedule fields and alarm date/time contracts. HealthKit permissions, actual background refresh, Apple Home pairing and Siri behavior still need a signed iPhone.
