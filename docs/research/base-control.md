# Pod 4 Ultra adjustable base

Research date: 2026-10-13. No physical movement has been tested for this change.

The main branch's DAC command table controls water temperature and vibration. The adjustable base uses a separate TriMix Bluetooth connection. The primary protocol source is [Free Sleep beta at a35972d](https://github.com/throwaway31265/free-sleep/blob/a35972d839a68a1a7a78c57085edf7a5a4be314d/server/src/8sleep/trimixBaseControl.ts), licensed under this repository's MIT license. Calibration values are retained from that source; no sleepypod implementation code is included.

- Stock setup stores `Address` and `SplitBase` in `/persistent/AdjustableBaseConfiguration.json`. Preserve this file before migration and keep it private. BlueZ pairing also must survive migration.
- Discover the configured device through BlueZ's ObjectManager. Notify characteristic UUID is FFE1; write characteristic is FFE3. Do not hardcode hci0 or firmware handles.
- Head range is 0–60 degrees, feet 0–45, speed 30–100. Both bed sides move together. SplitBase configuration is reported but does not imply independent motor control.
- Commands use an additive 16-bit little-endian checksum. Head motor selector is 6; feet is 5. Stop packet is `ffffffff0500000000d700d804`.
- Head calibration has discontinuities and feet calibration is nonmonotonic. These upstream values require physical verification; linear interpolation is not justified.
- Position notifications contain left/right feet/head ticks. They establish a reported pose, not proof of calibrated degrees or a physical stop.

[BlueZ's GATT API](https://github.com/bluez/bluez/blob/master/doc/org.bluez.GattCharacteristic.rst) supports acknowledged `WriteValue` requests. That is preferable to accepting a write into bluetoothctl stdin as success. This implementation bounds calls, discovers UUIDs, rejects stale/missing telemetry, serializes writes and cancels pending movement when Stop arrives. Connection errors do not replay movement.

[sleepypod's investigation](https://github.com/sleepypod/core/blob/main/docs/research/free-sleep-adjustable-base.md) helped locate the original beta history. Its [base guide](https://sleepypod.github.io/core/base/) explicitly distinguishes simulator verification from hardware verification. The same distinction applies here.

## Qualification before relying on this controller

Keep the stock controller available. Back up configuration and pairing. Start with read-only discovery and verify both reported angles against the current pose. Test a small head change, Stop, then a small feet change and Stop while physically attending the base with clear space. Check disconnection, stale telemetry, reconnect and stop during the inter-command delay. Validate presets only after angle calibration is confirmed. Do not add autonomous base motion or snoring mitigation until those tests pass.
