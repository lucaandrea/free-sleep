#!/usr/bin/env python3
"""Provision the remote over USB without storing or logging credentials."""
import argparse
import getpass
import json
import time
import serial

parser = argparse.ArgumentParser()
parser.add_argument("port", help="USB serial device, for example /dev/cu.usbmodem...")
arguments = parser.parse_args()
settings = {
    "ssid": input("Wi-Fi network: ").strip(),
    "password": getpass.getpass("Wi-Fi password: "),
    "endpoint": input("Pod origin, for example https://pod.example: ").strip(),
    "token": getpass.getpass("Owner connection key: ").strip(),
    "celsius": input("Display Celsius? [y/N]: ").lower() == "y",
}
settings["allowLocalHttp"] = settings["endpoint"].startswith("http://") and input(
    "Use plaintext HTTP on your trusted local network? [y/N]: "
).lower() == "y"
with serial.Serial(arguments.port, 115200, timeout=1) as connection:
    connection.write((json.dumps(settings) + "\n").encode())
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        line = connection.readline().decode(errors="replace")
        if "Configuration saved" in line:
            print("Configuration saved. The remote is restarting.")
            break
    else:
        raise SystemExit("No save acknowledgement. Check the USB connection and configuration.")
