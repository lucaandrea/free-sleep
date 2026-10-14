# Web and native design alignment

The visual direction combines the user's three reference projects: warm cream surfaces, orange accents, quiet borders and compact workspace navigation. The native app remains SwiftUI. It does not embed the web application.

## Shared source

`design/tokens.json` owns the day/night palettes, typography sizes, page and sidebar dimensions, card geometry and control sizes. Run from the repository root:

```sh
node scripts/generate-design.mjs
node scripts/generate-design.mjs --check
```

The generator writes the TypeScript token module, Swift constants and thirteen adaptive color assets. Edit the source JSON, not generated outputs. `--check` compares every output byte and fails if either platform is stale. No runtime dependency or network service is involved.

The web theme and native design components consume these values. Both use system fonts. On iOS, custom sizes use `ScaledMetric` so accessibility text sizes still work; layouts may stack at larger sizes. The native slider uses the same track and thumb geometry as the web and exposes a real Slider through Apple's [accessibility representation](https://developer.apple.com/documentation/swiftui/view/accessibilityrepresentation(representation:)). Touch edits still change a preview; the explicit action button applies it.

## Current alignment

- Cream/white surfaces and warm dark palette, including primary-button contrast and status colors.
- Matching content width, desktop sidebar threshold, mobile navigation height, card radius and insets.
- Matching side-selector height, button shapes, status badges, heading sizes and secondary text colors.
- Temperature card, selected base presets, head/feet sliders and the bed illustration's geometry.
- Sleep metrics and the presence chart's twelve-hour scale, missing-value markers and horizontal overflow.
- Recorded-episode selection, short-episode browsing, presence intervals, heart-rate/HRV/breathing charts and paginated original readings. Both clients consume the same detail response and generated sleep-demo fixture. See [recorded episodes](EPISODES.md).
- Record correction and deletion from the episode browser: side/timezone context, original-window conflict checks, validation, confirmation and refreshed charts. The legacy web editor uses the same controls.
- Native navigation from “Explore sleep” and the same Coach result wording for sample data.
- Next-alarm card, timezone/date labels and one-time change, skip and restore actions. iOS uses a native time picker and sheet.
- Routines: Monday–Sunday selector, overnight temperature timeline, power/adjustment/alarm groups, outlined fields, numeric alarm controls and weekday/weekend copying. Both use the same demo week in `shared/fixtures/routines-demo.json` and keep drafts per Pod, side and day. See [routine behavior](ROUTINES.md).
- Journal: labelled outlined fields, habit checkboxes, notes, save/reset actions and dates in the Pod timezone. Drafts stay in memory by Pod, side and wake date. Coach uses the same 7/30/90-day choice, provider field, question, per-request sharing control and result provenance. Sample coaching is generated from the shared sleep fixture. See [journal and Coach behavior](JOURNAL_COACH.md).
- Settings: connection fields, Test/Save actions, separate Appearance section, Home bridge status/refresh and consistent section order/copy. Device settings now shares the timezone, units, side names, Away mode and daily-care form, including save/reset/reload. System health shares service cards and manual/automatic refresh. Native Health permissions and Home scenes remain platform capabilities. See [connection setup](CONNECTIONS.md) and [device preferences](DEVICE_PREFERENCES.md).

This is not a claim that every screen is visually identical. OS chrome, permission sheets and native accessibility text layout differ. The following product differences remain explicit work:

| Screen | Remaining alignment |
| --- | --- |
| Tonight | Notification presentation; alarm editors retain native sheet/picker chrome |
| Sleep | Record editors retain OS date/time picker and sheet/dialog chrome |
| Coach | OS menu picker chrome and accessibility text layout |
| Routines | Native time/menu picker chrome and confirmation presentation; accessibility text sizes use an adaptive day picker |
| Settings | Advanced maintenance, LEDs, services and logs remain web-only; Health permissions, Home scenes and system pickers remain native |

Use the same side, data, appearance, viewport width and text-size setting when comparing. Initial device preferences and service health come from the same fixture. Remaining demo device-status banners and scheduled-alarm notifications must not be removed merely to make captures match.

## Verification

The generator check, web typecheck/lint, hosted/demo builds and native build cover source compatibility. Browser and simulator captures cover rendering and simulated interactions. These checks do not establish physical Pod operation, Home pairing, signed-device permissions or real sleep data accuracy. See [validation evidence](VALIDATION.md) for the checks actually run.
