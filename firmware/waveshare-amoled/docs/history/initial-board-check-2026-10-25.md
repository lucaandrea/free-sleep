# Board check — 2026-10-25

The user connected the Waveshare board and authorized flashing in this chat.

## Observed

- USB port `/dev/cu.usbmodem101`, Espressif USB Serial/JTAG VID/PID `303A:1001`.
- ESP32-S3 revision 0.2, embedded 8 MB octal PSRAM; physical GD flash reported 32 MB. The image uses a 16 MB address space and fits in its first 2 MB. The remaining flash is not used or erased.
- Backed up bytes `0x000000` through `0x1fffff` before changing the board. This covers every sector replaced by the bootloader, partition table and application, plus the NVS region. No full-chip erase was issued.
- Final application image SHA-256: `cf0860e0d91f391876904c1ea85af6785bb4176ae3b666f519524dab4a71d67b` (also recorded in the packaged manifest).
- ESP-IDF 5.5.5 image programmed at `0x0` (bootloader), `0x8000` (partition table), `0x10000` (application); esptool verified each written image's hash.
- Boot: PSRAM memory test OK; CO5300 display created; CST9217 check code `0x204ECACA`, chip `0x9217`, resolution 466 × 466; LVGL touch registered in IRQ mode and LVGL task started. No boot panic was observed.
- Unconfigured firmware enters Preview. No Wi-Fi credentials or Pod key were embedded, no actuator request was sent, and no Pod migration occurred.
- The owner confirmed that the screen and touch navigation work: the temperature dial is visible, Base/Alarm can be opened, and Back returns successfully.

## Still to verify

Wi-Fi/TLS/authentication, temperature changes on both sides, head/feet movement and Stop, alarm vibration/snooze/timezone behavior, and overnight operation have not been qualified. The physical Pod still runs the old Free Sleep controller; this remote requires the authenticated Core API.

The boot log contains the BSP's generic I2C pull-up warning, followed by successful touch identification. If touch is unreliable in attended testing, investigate that warning rather than treating initialization as proof of working touch. The 32 MB/16 MB warning describes the deliberately smaller image address space.

## Local recovery

The private backup is outside Git at:

`~/Library/Application Support/FreeSleep/firmware-backups/waveshare-before-free-sleep-first-2MiB-2026-10-25.bin`

Restore only to this same board, with the owner's authorization, using ESP-IDF's esptool and the verified serial port:

```sh
python -m esptool --chip esp32s3 --port /dev/cu.usbmodem101 \
  write_flash 0x0 "$HOME/Library/Application Support/FreeSleep/firmware-backups/waveshare-before-free-sleep-first-2MiB-2026-10-25.bin"
```

This restores the overwritten region; the backup is not a full 32 MB flash image. Keep it private because original NVS contents may contain credentials. Local boot and flash logs are under `/tmp/free-sleep-board-*-final.log` for this session.
