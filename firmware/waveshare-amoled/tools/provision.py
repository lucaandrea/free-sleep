#!/usr/bin/env python3
"""Provision the remote over USB without storing or logging credentials."""
import argparse
import getpass
import json
import time
import serial
from personal_pairing import pair_remote

parser = argparse.ArgumentParser()
parser.add_argument("port", help="USB serial device, for example /dev/cu.usbmodem...")
mode = parser.add_mutually_exclusive_group()
mode.add_argument("--wifi-only", action="store_true", help="Set Wi-Fi now, preserving an existing Pod connection")
mode.add_argument("--status", action="store_true", help="Read connection flags without changing anything")
mode.add_argument("--personal", action="store_true", help="Pair a separate device using your own-device invitation")
arguments = parser.parse_args()
if not arguments.status:
    settings = {
        "ssid": input("Wi-Fi network: ").strip(),
        "password": getpass.getpass("Wi-Fi password: "),
        "networkOnly": arguments.wifi_only,
    }
    if not arguments.wifi_only:
        settings.update({
            "endpoint": input("Pod origin, for example https://pod.example: ").strip(),
            "celsius": input("Display Celsius? [y/N]: ").lower() == "y",
        })
        settings["allowLocalHttp"] = settings["endpoint"].startswith("http://") and input(
            "Use plaintext HTTP on your trusted local network? [y/N]: "
        ).lower() == "y"
        if arguments.personal:
            print("In your personal account, create an invitation for another device belonging to you.")
            try:
                settings.update(pair_remote(settings["endpoint"], getpass.getpass("Own-device invitation: ").strip(),
                    input("Your existing profile name: ").strip(), settings["allowLocalHttp"]))
            except ValueError as error:
                raise SystemExit(str(error)) from None
        else:
            settings["token"] = getpass.getpass("Owner connection key: ").strip()
with serial.Serial(arguments.port, 115200, timeout=1) as connection:
    connection.write(b"STATUS\n" if arguments.status else (json.dumps(settings) + "\n").encode())
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        line = connection.readline().decode(errors="replace")
        if arguments.status and line.startswith("STATUS "):
            status = json.loads(line.removeprefix("STATUS "))
            print(json.dumps({key: value for key, value in status.items() if isinstance(value, bool)}, indent=2))
            break
        if "Configuration saved" in line:
            print("Configuration saved. The remote is restarting.")
            break
    else:
        raise SystemExit("No acknowledgement. Check the USB connection, firmware version and configuration.")
