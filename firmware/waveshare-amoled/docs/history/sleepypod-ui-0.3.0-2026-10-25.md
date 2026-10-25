# Waveshare update — Sleepypod UI 0.3.0

Date: 2026-10-25. The owner authorized the connected board update. The initial flash and earlier touch confirmation are preserved in `history/initial-board-check-2026-10-25.md`.

## Observed on the connected board

- USB `/dev/cu.usbmodem101` identifies the same ESP32-S3 revision 0.2 and MAC as the earlier authorized board. It has embedded 8 MB octal PSRAM and 32 MB physical flash; the vendor configuration uses a 16 MB image address space.
- Final firmware **0.3.0**, application image **1,604,720 bytes**, SHA-256 **c95e1d3f410b46c336e122ca76c21fa46b2e70b6f1026d0fe11835b62cf853bf**.
- A fresh private backup of the first 2 MiB was made before this update. Every programmed sector is covered. The partition table is identical to the previous image.
- ESP-IDF programmed the bootloader at `0x0`, application at `0x10000` and partition table at `0x8000`. **All three image hashes verified.** No erase-flash or NVS write was issued.
- NVS bytes `0x9000` through `0xefff` were reread after the final flash and match the backup **byte-for-byte**.
- Boot logs confirm app version 0.3.0, PSRAM initialization, CO5300 display creation, CST9217 identification, resolution **466 × 466**, IRQ touch registration and LVGL task startup. No boot panic was observed in the captured startup interval.
- The renderer’s on-device initialization benchmark reported **119 ms at full detail** and **38 ms at drag resolution**. These are mesh/raster timings, not a measured end-to-end touch/display frame rate. Full detail is restored when dragging ends.
- The unconfigured board reports **Preview ready**. Preview does not open a Wi-Fi connection or issue actuator requests. No credentials are embedded in the image.
- The owner confirmed the redesigned UI looks good, stays inside the circular screen and responds to touch after checking Bed rotation, mattress visibility, Position and Sensors.

## Tests and limits

Model tests, 1,728 camera/articulation configurations and 36 real-LVGL offscreen route/state captures passed. The circular bounds and text-fit checks are documented in [UI verification](UI_VERIFICATION.md). Captures are synthetic fixtures, not physical screen photos.

The compatible Core controller and Wi-Fi/origin/key must be configured before live data and controls work. The other coordinated chat owns that migration. Actual temperature control, physical head/feet movement and Stop, alarm vibration/snooze, Wi-Fi/TLS/authentication and overnight operation remain unqualified. Accepted HTTP requests are never presented as proof of physical movement.

The BSP logs its generic I2C pull-up warning before successful touch identification. The 32 MB/16 MB message reflects the deliberately smaller image address space. Touch currently uses single-point pointer events: drag rotation is supported; pinch gestures are not claimed.

## Recovery and evidence

Private pre-update backup (contains NVS; keep private):

`~/Library/Application Support/FreeSleep/firmware-backups/waveshare-before-sleepypod-ui-2026-10-25.bin`

The earlier original-image backup is also retained:

`~/Library/Application Support/FreeSleep/firmware-backups/waveshare-before-free-sleep-first-2MiB-2026-10-25.bin`

Restore only to the same identified board, with the owner’s authorization and ESP-IDF activated:

```sh
python -m esptool --chip esp32s3 --port /dev/cu.usbmodem101 write_flash \
  0x0 "$HOME/Library/Application Support/FreeSleep/firmware-backups/waveshare-before-sleepypod-ui-2026-10-25.bin"
```

Local evidence: `/tmp/waveshare-model-verification.log`, `/tmp/waveshare-ui-verification.log`, `/tmp/waveshare-sleepypod-build.log`, `/tmp/waveshare-sleepypod-flash-final.log`, `/tmp/waveshare-sleepypod-boot-final.log`, and `/tmp/waveshare-ui-nvs-read-final.log`.
