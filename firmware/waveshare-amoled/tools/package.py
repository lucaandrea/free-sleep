#!/usr/bin/env python3
"""Package the built board images and explicit flash offsets, without NVS or secrets."""
import hashlib
import json
import pathlib
import shutil
import zipfile

root = pathlib.Path(__file__).resolve().parent.parent
build = root / "build"
arguments = json.loads((build / "flasher_args.json").read_text())
output = root / "dist/free-sleep-waveshare-amoled"
output.mkdir(parents=True, exist_ok=True)
packaged = []


def include(source, relative):
    """Copy an explicit release input; never include unrelated staging files."""
    destination = output / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    packaged.append(destination)
    return destination


images = []
for offset, relative in arguments["flash_files"].items():
    source = build / relative
    destination = include(source, source.name)
    images.append({"offset": offset, "file": destination.name,
                   "sha256": hashlib.sha256(destination.read_bytes()).hexdigest()})
description = json.loads((build / "project_description.json").read_text())
manifest = {"version": description["project_version"], "board": "Waveshare ESP32-S3-Touch-AMOLED-1.75", "idf": "5.5.5",
            "bsp": "3.0.1", "lvgl": "9.4.0", "hardwareVerified": False,
            "flashSettings": arguments["flash_settings"], "images": images}
(output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
packaged.append(output / "manifest.json")
settings = arguments["write_flash_args"]
flash = " ".join(settings + [value for image in images for value in (image["offset"], image["file"])])
(output / "FLASH.txt").write_text("Verify the board and USB port first. Bed controls require attended hardware verification.\n"
    "Run from this extracted directory with ESP-IDF 5.5.5 activated:\n\n"
    "python -m esptool --chip esp32s3 --port YOUR_PORT write_flash " + flash + "\n\n"
    "Do not erase flash on an update; NVS contains your connection settings.\n")
packaged.append(output / "FLASH.txt")
readme = include(root / "README.md", "README.md")
readme.write_text(readme.read_text().replace("../../docs/CLIENT_INTEGRATION_HANDOFF.md", "docs/CLIENT_INTEGRATION_HANDOFF.md"))
include(root / "tools/provision.py", "tools/provision.py")
include(root / "docs/HARDWARE_CHECK.md", "docs/HARDWARE_CHECK.md")
include(root / "docs/UI_VERIFICATION.md", "docs/UI_VERIFICATION.md")
include(root / "docs/previews/overview.png", "docs/previews/overview.png")
include(root.parents[1] / "docs/CLIENT_INTEGRATION_HANDOFF.md", "docs/CLIENT_INTEGRATION_HANDOFF.md")
include(root.parents[1] / "LICENSE.md", "LICENSE.md")

# Retain notices from the exact SDK and component sources used by this build.
description = json.loads((build / "project_description.json").read_text())
sdk = pathlib.Path(description["idf_path"])
include(sdk / "LICENSE", "licenses/esp-idf/LICENSE")
notice_names = ("LICENSE", "LICENCE", "NOTICE", "COPYING", "COPYRIGHT", "OFL")
for directory in description["build_component_paths"]:
    if not directory:
        continue
    component = pathlib.Path(directory)
    for source in sorted(component.rglob("*")):
        if source.is_file() and source.name.upper().startswith(notice_names):
            include(source, pathlib.Path("licenses") / component.name / source.relative_to(component))
with zipfile.ZipFile(output.with_suffix(".zip"), "w", zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(packaged):
        archive.write(file, output.name + "/" + str(file.relative_to(output)))
print(output.with_suffix(".zip"))
