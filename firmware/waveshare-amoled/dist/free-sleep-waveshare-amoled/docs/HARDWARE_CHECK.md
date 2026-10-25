# Waveshare update — Thermal UI 0.4.0

Date: 2026-10-25. Updated the same connected board under the owner’s authorization. The owner’s successful screen/touch check for 0.3.0 is preserved in `history/sleepypod-ui-0.3.0-2026-10-25.md`.

## Observed on the connected board

- USB `/dev/cu.usbmodem101` matches the previously authorized ESP32-S3 revision 0.2 board. It has 8 MB octal PSRAM and 32 MB physical flash; this build retains the vendor’s 16 MB image address space.
- Firmware **0.4.0**, application **1,656,832 bytes**, SHA-256 **dc9d6747bfd42033ec3c45b2550c9e52571787dd5c8e9a6de47a42dc5ca98803**.
- A fresh private backup of the first 2 MiB covers every programmed sector. The partition table is identical to the board’s prior layout.
- Bootloader `0x0`, partition table `0x8000`, application `0x10000`: **all three image hashes verified**. No erase-flash or NVS write was requested.
- NVS `0x9000–0xefff` was reread after the update and is **byte-for-byte identical** to the backup. Future display-choice changes intentionally write only to the separate `bedside_ui` namespace.
- Boot logs report 0.4.0, successful display startup, CST9217 identification at **466 × 466**, and Preview ready. No panic occurred during the 12-second captured interval.
- Renderer warm-up reported **117 ms full detail / 39 ms drag resolution**. These are mesh/raster timings, not end-to-end display frame rates.
- The board remains unconfigured **Preview**. Cooling/heating and sensor values are labeled sample data; no network connection or bed commands were issued.
- The owner tested More → Temperature display, the Temperature mattress view and Bed → Sensors, and confirmed: “Yes, everything fits and works.” This verifies the new controls’ physical fit and touch response; live Pod operations remain unverified.

## Verification and limits

Two host test suites pass: conversion/state/command/mesh checks and display-preference persistence/error checks. **1,728** mesh configurations and **99** actual production-LVGL route/state captures pass bounds/text checks. Dynamic fixture checks cover heating, cooling, holding and unavailable transitions, and target edits surviving view changes. See [UI verification](UI_VERIFICATION.md).

Compatible Core deployment and Wi-Fi/origin/key provisioning are still required for live measurements and controls. Physical temperature changes, base movement/Stop, alarm vibration/snooze, network authentication and overnight operation remain unqualified. HTTP acknowledgement is not proof of physical motion.

## Recovery and local evidence

Private pre-update backup (contains NVS; keep private):

`~/Library/Application Support/FreeSleep/firmware-backups/waveshare-before-thermal-ui-0.4.0-2026-10-25.bin`

Original and earlier 0.3.0 backups remain retained in that private directory. Restore only to this same identified board with owner authorization and ESP-IDF activated:

```sh
python -m esptool --chip esp32s3 --port /dev/cu.usbmodem101 write_flash \
  0x0 "$HOME/Library/Application Support/FreeSleep/firmware-backups/waveshare-before-thermal-ui-0.4.0-2026-10-25.bin"
```

Logs: `/tmp/waveshare-04-model-verification.log`, `/tmp/waveshare-04-ui-verification.log`, `/tmp/waveshare-04-build.log`, `/tmp/waveshare-04-flash.log`, `/tmp/waveshare-04-boot.log`, `/tmp/waveshare-04-nvs-read.log`.
