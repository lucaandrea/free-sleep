# Native Free Sleep

SwiftUI, iOS 18+, Xcode 27 used for validation. Generate the checked-in project using `xcodegen generate`. Main navigation, colors, cards and content follow the responsive web app; HealthKit, HomeKit and Shortcuts use native frameworks.

See [platform setup](../docs/PLATFORM_SETUP.md) for signing, connection, privacy, export semantics and device acceptance checks. Launch a Debug build with `--demo` for labelled sample data and simulated controls. Release builds ignore that argument. Shortcuts always use the saved real API connection; UI demo mode does not redirect them.

Tests cover connection validation, analytics decoding, HealthKit sample provenance/deduplication, and preservation of schedule fields. HealthKit permissions, Apple Home pairing and Siri behavior still need a signed iPhone.
