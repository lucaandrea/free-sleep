# Waveshare live setup — 0.4.1

2026-10-25. Updated the same authorized ESP32-S3 revision 0.2 board, with 32 MB physical flash and 8 MB PSRAM. The earlier thermal UI/touch acceptance is preserved in [the 0.4.0 record](history/thermal-ui-0.4.0-2026-10-25.md).

## Physical evidence

- Installed application: **0.4.1**, **1,660,384 bytes**, SHA-256 `cc6e043782c4971b17414a869c406f8a14cd72a8a6682755848591b7e1042a3f`.
- A new private 2 MiB pre-update backup was verified against the installed 0.4.0 app hash. The partition table is unchanged.
- The initial bootloader, partition and application writes all verified their hashes. The final UI refinement rewrote only the application at `0x10000`, with its hash verified.
- The owner's supplied Wi-Fi credentials were provisioned over USB without being printed or stored in the repository. The device acknowledged the save and restarted.
- Read-only USB diagnostics report `preview=false`, `wifi=true`, `controllerConfigured=false`, `connected=false`. The board joined Wi-Fi again after the final firmware update and reset.
- The entire 24 KiB NVS partition is byte-identical before and after that final update. Display preferences and the newly saved Wi-Fi settings were preserved.
- The real Core LAN origin/key remains pending the coordinated controller deployment. No real temperature/base/alarm command was sent. Wi-Fi readiness is not evidence of live Pod control.

## Local validation

Both host suites pass. The production LVGL renderer passes **122 route/state captures** inside the 450 px safe circle, including Wi-Fi-only and joining states. New configuration tests cover explicit two-stage setup, malformed partial configuration, full configuration round-trips, and rejection of commands before controller configuration.

The three images in `previews/live-setup-0.4.1/` are host-rendered fixtures, not photographs. Unknown targets and sensors show unavailable values; the More screen distinguishes joining, Wi-Fi ready, controller offline and connected states.

Logs: `/tmp/waveshare-041-build-final.log`, `/tmp/waveshare-041-flash-final.log`, `/tmp/waveshare-041-ui-check-final2.log`. Private firmware/NVS backups are in `~/Library/Application Support/FreeSleep/firmware-backups/`; they contain configuration and must stay private.

Live authentication, telemetry freshness, actual temperature changes, base movement/Stop, alarms and overnight operation remain unqualified until the compatible controller is connected and those operations are checked.
