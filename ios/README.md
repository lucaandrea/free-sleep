# Native Free Sleep

SwiftUI, iOS 18+, Xcode 27 used for validation. Generate the checked-in project using `xcodegen generate`. Main navigation, colors, cards and content follow the responsive web app; HealthKit, HomeKit and Shortcuts use native frameworks.

See [platform setup](../docs/PLATFORM_SETUP.md) for signing and connection, and [Apple integrations](../docs/APPLE_INTEGRATIONS.md) for personal Health setup, automatic sync, privacy, Shortcuts and device acceptance checks. Launch a Debug build with `--demo` for labelled sample data and simulated controls. Release builds ignore that argument. Debug demo mode blocks Health access and system actions; live Shortcuts use the saved authenticated API connection.

Tests cover connection validation, analytics decoding, Health sample provenance, cancellation and partial failure, Pod/side isolation, reconciliation versions, automatic sync windows and preservation of schedule fields. HealthKit permissions, actual background refresh, Apple Home pairing and Siri behavior still need a signed iPhone.
