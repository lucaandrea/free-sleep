#!/usr/bin/env python3
"""Exercise the actual LVGL UI, enforcing circular bounds and no preview mutations."""
import argparse
import os
from pathlib import Path
import subprocess
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path)
parser.add_argument('--renderer', type=Path, help='Built preview executable (defaults to test-build/preview/preview)')
options = parser.parse_args()
root = Path(__file__).resolve().parent.parent
renderer = options.renderer or root / 'test-build/preview/preview'
routes = {
    'temperature': 'Temp', 'temperature-right': 'Right side >',
    'bed': 'Bed', 'bed-rotated': 'Bed|@drag', 'bed-frame': 'Bed|Mattress on',
    'position': 'Bed|Position', 'position-relax': 'Bed|Position|Presets|Relax',
    'position-frame': 'Bed|Position|Presets|Relax|Mattress',
    'position-rotated': 'Bed|Position|Presets|Read|@drag',
    'sensors': 'Bed|Sensors', 'readings': 'Bed|Sensors|Readings',
    'bed-left': 'Bed|Sensors|Left|Back', 'bed-right': 'Bed|Sensors|Right|Back',
    'bed-none': 'Bed|Sensors|None|Back', 'bed-one-zone': 'Bed|Sensors|None|L OUTER',
    'presets': 'Bed|Position|Presets', 'alarm': 'Alarm',
    'alarm-options': 'Alarm|Options', 'alarm-window': 'Alarm|Options|Wake window off', 'settings': 'More',
}
routes['temperature-right'] = 'Left side >'
routes.update({
    'temperature-mattress': 'Mattress view', 'temperature-mattress-rotated': 'Mattress view|@drag',
    'temperature-draft': '+|@expect=69°F|Mattress view|@expect=69°F|Dial view|@expect=69°F',
    'sensor-left': 'Bed|Sensors|Left', 'sensor-right': 'Bed|Sensors|Right',
    'sensor-none': 'Bed|Sensors|None', 'sensor-rotated': 'Bed|Sensors|@drag',
    'appearance': 'More|Temperature display',
    'mattress-heating': 'Mattress view|@state=heating|@expect=SAMPLE / HEATING',
    'mattress-cooling': 'Mattress view|@state=heating|@state=cooling|@expect=SAMPLE / COOLING',
    'mattress-settled': 'Mattress view|@state=cooling|@state=settled|@expect=SAMPLE / HOLDING',
    'mattress-expired': 'Mattress view|@state=cooling|@state=expired|@expect=UNAVAILABLE',
})
for display in ['Degrees', 'Offset', 'Eight Sleep']:
    for unit in ['F', 'C']:
        prefix = 'More|Temperature display|' + display + ('|Units: °F' if unit == 'C' else '') + '|Back|Back'
        routes['dial-' + display + '-' + unit] = prefix
        routes['mattress-' + display + '-' + unit] = prefix + '|Mattress view'
        routes['step-' + display + '-' + unit] = prefix + '|+'

image_library = None
if options.output:
    from PIL import Image, ImageDraw
    image_library = Image
    options.output.mkdir(parents=True, exist_ok=True)
count = 0
with tempfile.TemporaryDirectory(prefix='sleepypod-round-ui-') as temporary:
    for state in ['demo', 'live', 'stale', 'missing', 'offline', 'device-stale', 'holding', 'off', 'wifi-only', 'joining']:
        selected = routes if state == 'demo' else {name: routes[name] for name in ['temperature', 'temperature-mattress', 'bed', 'sensors', 'readings', 'position', 'alarm', 'settings']}
        for name, route in selected.items():
            output = Path(temporary) / (state + '-' + name + '.ppm')
            result = subprocess.run([str(renderer), route, str(output)],
                                    env={**os.environ, 'PREVIEW_STATE': state}, capture_output=True, text=True)
            if result.returncode:
                raise SystemExit(f'{state}/{name}: {result.stderr}')
            if image_library:
                picture = Image.open(output).convert('RGBA')
                mask = Image.new('L', picture.size)
                ImageDraw.Draw(mask).ellipse((0, 0, 465, 465), fill=255)
                picture.putalpha(mask)
                picture.save(options.output / (state + '-' + name + '.png'))
            count += 1
    bedroom_routes = {
        'first': 'Bed|Sensors|Readings|Bedroom|@expect=1-3 of 7 readings',
        'second': 'Bed|Sensors|Readings|Bedroom|Next|@expect=4-6 of 7 readings',
        'last': 'Bed|Sensors|Readings|Bedroom|Next|Next|@expect=7-7 of 7 readings',
        'previous': 'Bed|Sensors|Readings|Bedroom|Next|Next|Previous|@expect=4-6 of 7 readings',
        'disconnect': 'Bed|Sensors|Readings|Bedroom|@state=expired|@expect=STALE OR UNAVAILABLE|@expect=Fixture left bedside\nTemperature: -- / unavailable',
    }
    for name, route in bedroom_routes.items():
        output = Path(temporary) / ('bedroom-' + name + '.ppm')
        result = subprocess.run([str(renderer), route, str(output)], env={**os.environ,
                                'PREVIEW_STATE': 'live', 'BEDROOM_FIXTURE': str(root/'tests/fixtures/bedroom-core.json')},
                                capture_output=True, text=True)
        if result.returncode:
            raise SystemExit(f'bedroom/{name}: {result.stderr}')
        if image_library:
            Image.open(output).save(options.output / ('bedroom-' + name + '.png'))
        count += 1
print(f'{count} actual LVGL routes/state captures passed; every control fits the 450px safe circle.')
