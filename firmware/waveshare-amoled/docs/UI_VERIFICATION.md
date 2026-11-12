# Sleepypod round UI — 0.4.0

## 0.6.0 personal remote

The 0.6.0 source adds a separate own-device credential and pins the installation,
household, account and sleeper identities. It reads only personal session, bed and
next-wake endpoints. Before temperature or power changes it rechecks the current
scope; explicit Stop may use a still-current scope, which Core independently
revalidates. Requests expire after five seconds and are never retried on reconnect.

The account chooses the controlled zones. The solo view shows both measurements
and visibly different targets; it requires a new target selection before Apply
can collapse differing targets to one value. Assigned accounts show only their
own side. Unassigned, revoked, stale and low-water conditions withdraw relevant
controls. Personal Alarm reads the next effective wake and offers vibration Stop;
it does not expose owner schedule, base or maintenance routes.

Four host contract suites and eight Python pairing cases pass. The production
LVGL renderer passes **151 route/state captures**, including the earlier owner
flows and 24 personal cases covering solo, assigned, unassigned, offline,
low-water and 80-character names. All labels and control rectangles fit the
450-pixel safe circle. Visual inspection corrected clipped explanatory text,
long-name wrapping and the misleading single target when solo side targets differ.
The C++ design detector reports no findings; that is not a hardware test.

The ESP-IDF 5.5.5 target build is separately required after the final source
revision. Flashing, real credential enrollment, touch interaction, assignment
changes and actual bed behavior remain physical acceptance checks. These host
fixtures are synthetic and contain no personal Health data.

The 466 × 466 display uses an inset **450-pixel circular safe area**. Primary content sits on the wider middle chords; navigation at the bottom is deliberately narrow. The actual LVGL layout, including button-label extents and untruncated labels, is checked by the offscreen test driver.

## Screens and interaction

- Temperature: Sleepypod’s dark dial with an 11-pixel ring (previously 5), left/right selector, explicit Apply, power and measured state. Switch to Mattress view without losing an edited target; drag the bed to rotate. Colors use reported state, so an unsubmitted target cannot masquerade as physical heating/cooling.
- Bed: drag horizontally to orbit and vertically to tilt; Reset view restores the camera. Mattress on/frame only changes presentation. Position and Sensors open dedicated pages.
- Position: the model previews requested head/feet angles. One-degree steppers, presets and speed selection do not move hardware. Move bed submits the whole-bed target; Stop uses the independent urgent queue. Reported position is distinct from requested angles.
- Sensor layers: bed preview plus six numeric color tiles, with all, none, left, right or any individual combination. A selected tile has a colored outline and tinted background; tapping it immediately changes the corresponding strip on the bed. Readings shows measurements plus ambient temperature, MCU temperature and humidity. Raw readings always stay in degrees.
- Alarms: side/day, time, enabled state, vibration intensity/pattern/duration, wake temperature and wake window (off, 10, 15, 20 or 30 minutes). Save on Pod is explicit. Dismiss and five-minute snooze remain available when appropriate.
- More → Temperature display: Degrees, Offset, Eight Sleep and a separate °F/°C units choice. Preferences are stored in the `bedside_ui` NVS namespace, separately from connection credentials. Resume automatic temperature, reconnect and connection context remain available.

## Display semantics

Checked against [Sleepypod Appearance](https://sleepypod.vercel.app/en/settings) and the local Core sources `src/components/TempControl/TempControl.tsx` and `src/components/TempScreen/nightPhases.ts` on 2026-10-25:

- Degrees uses °F or °C. Offset is the signed whole-Fahrenheit difference from 80°F, regardless of the degree-unit selection.
- Eight Sleep uses −10…+10 with 0 = 82.5°F and 2.75°F per level. Canonical whole-Fahrenheit commands use the same half-up rounding as Sleepypod: level 0 requests 83°F. This display scale is distinct from the firmware’s −100…+100 hardware levels.
- Plus/minus changes one Eight Sleep level in that mode, otherwise one display degree (rounded back to whole °F). The level dial selects discrete levels. Changing display mode alone never changes or submits the target.
- Both target and measured degree values remain visible below the main number. Explicit Apply remains required.

## Rendering and truthful data

`bed_scene.cpp` contains the platform-independent articulated mesh, camera projection, thermal color scale and bounded renderer. A software depth buffer correctly resolves overlap between the raised panels, pillows and frame. Chamfered panel edges and neutral surfaces follow the supplied Sleepypod reference. The LVGL canvas caches RGB565 pixels and redraws when the camera, requested angle or readings change. Back faces are culled. Dragging uses a smaller raster for responsiveness, then restores full detail on release.

On Temperature and Bed, each mattress side uses the reported target-minus-measured gap: cooling is pale blue to deep blue; heating is pale red to deep red. Saturation increases over a 0.5–12°F gap and softens as the reported temperature approaches the target. Holding is neutral; powered-off, missing and stale side telemetry is gray. Demo uses labeled sample cooling/heating sides.

On Sensor Layers, the six colors represent **outer, center and inner across each bed side**, repeated along the length. They are schematic regions, not head-to-foot measurements. The fixed measured-temperature scale is 64.4–96.8°F, with blue, pale blue, neutral (80°F), pale red and red stops. Hidden zones have a neutral surface; missing or stale selected zones are gray.

The existing Core route `GET /api/environment/bed-temp/latest?unit=F` provides readings. Core persists these samples every 60 seconds. Firmware 0.4.2 accepts a valid UTC observation timestamp up to 90 seconds old, allowing the next poll and ingestion delay, while still requiring a receipt within 30 seconds and a connected controller. An unsynchronized clock cannot make readings appear live. HTTP success alone cannot refresh an old database sample. Demo readings are explicitly marked SAMPLE DATA and cannot issue commands.

## Reproducible checks

Activate ESP-IDF 5.5.5, then:

```sh
cmake -S tests -B test-build
cmake --build test-build
ctest --test-dir test-build --output-on-failure
cmake -S tests/preview -B test-build/preview
cmake --build test-build/preview
python3 tools/verify_ui.py
# Optional PNG exports require Pillow:
python3 tools/verify_ui.py --output docs/previews/sleepypod-0.4.0
```

- Preference storage tests cover restart-style restoration, corrupt stored values, commit failure and isolation from the connection namespace.
- Model tests cover Sleepypod level/offset conversions and boundaries, display-degree stepping, activity colors/freshness, plus existing command/authentication/expiry behavior, timestamp validation, stale/future/missing sensor values, wake-window validation and speed/whole-bed request fields.
- The mesh is checked across **1,728** combinations of yaw, pitch, head/feet limits and mattress visibility. All projected points remain inside the viewport.
- **99 actual LVGL route/state captures pass**, including all three display modes in both unit choices and both temperature views, draft preservation, live heating → cooling → holding → unavailable transitions, per-region filters, rotated/articulated views, alarms, stale/partially missing/offline/off states. Controls fit the circle and their labels fit their hit targets. The renderer aborts if these UI traversals attempt a mutation.
- Images in `previews/sleepypod-0.4.0/` are offscreen renders of production LVGL code using synthetic fixtures. They are not photographs of the physical screen or evidence of actual Pod readings.

Physical flashing, boot evidence and the owner’s touch check are recorded separately in HARDWARE_CHECK.md. Network/control qualification depends on the compatible Core deployment.

## 0.4.1 connection states

Both host suites pass and 122 production LVGL route/state captures fit the 450 px safe circle. Wi-Fi-only setup removes sample data and shows unavailable targets, while More shows Pod setup needed. Joining, controller-offline and connected states are distinct. Bed actions remain disabled until a controller is configured. Read-only USB status contains only connection/freshness booleans. Physical Wi-Fi/restart evidence and the pending controller connection are recorded in `HARDWARE_CHECK.md`.

## 0.5.0 bedroom context

Open **Bed → Sensors → Readings → Bedroom** to see individual bedroom measurements. The controller's authenticated `/api/v1/home/bedroom` response supplies the device inventory; the remote does not invent HomePod or Govee sensors. Three readings fit each page, with Previous/Next navigation. Values follow the selected temperature units. Cached, unavailable, expired and disconnected observations show `--`.

The parser bounds the response and source count, checks metric units and values, rejects missing/future clocks and leases that exceed their source lifetime, and uses monotonic receipt age. Room values expire after 15 seconds without a successful response or sooner when their source lease ends. This screen cannot issue device or temperature commands. Firmware 0.5.0 also retains the pending 0.4.2 fix for Core's 60-second thermal-sample cadence described above.

Three host suites pass, including the shared synthetic Core bedroom fixture. All **127 production LVGL route/state captures** pass the circle and text bounds checks, including pagination and loss of connection. Run with an alternate build directory using `python3 tools/verify_ui.py --renderer /path/to/preview`. The ESP-IDF build and host renders do not establish physical flashing or sensor accuracy; those checks remain in the hardware qualification record.
