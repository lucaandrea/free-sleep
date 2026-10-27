#include "controller.hpp"
#include "bed_scene.hpp"
#include "preferences.hpp"
#include <ctime>
#include "bsp/esp-bsp.h"
#include "bsp/display.h"
#include "lvgl.h"
#include <algorithm>
#include <cmath>
#include <cstdio>

namespace bedside {
enum class Page { temperature, stage, base, sensors, sensorDetails, bedroom, presets, alarms, settings, alarmOptions, appearance };
static Page page = Page::temperature;
static bool celsius = false, dimmed = false, alarmDirty = false, temperatureDirty = false;
static DisplayPreferences preferences;
static bool awaitingAlarmSave = false;
static int selectedSide = 0, selectedDay = 1, requestedTemperature = 80, head = 0, feet = 0;
static Alarm draft, originalAlarm;
static BedScene scene;
static std::vector<uint16_t> scenePixels;
static std::vector<float> sceneDepth;
static uint8_t sensorMask = 63;
static int speed = 50;
static size_t bedroomOffset = 0;
static std::array<lv_obj_t *, 3> bedroomLabels{};
static lv_obj_t *bedroomHeader = nullptr, *bedroomFooter = nullptr;
static lv_obj_t *sceneView = nullptr, *sceneCanvas = nullptr, *sceneStatus = nullptr;
static std::array<lv_obj_t *,6> thermalLabels{}, sensorButtons{};
static std::array<lv_obj_t *,2> sideLabels{};
static lv_obj_t *environmentLabel = nullptr, *mcuLabel = nullptr;
static const char *sensorNames[] = {"L OUTER", "L CENTER", "L INNER", "R OUTER", "R CENTER", "R INNER"};
static lv_point_t dragOrigin;
static float dragYaw = 0, dragPitch = 0;
static bool ignoreDrag = false;
static std::string lastMessage;
static uint32_t messageUntil = 0;
static lv_obj_t *content, *messageLabel, *readings, *valueLabel, *ownerLabel, *headLabel, *feetLabel;
static lv_obj_t *temperatureArc, *hourRoller, *minuteRoller, *enabledSwitch;
static lv_obj_t *powerButton, *applyButton, *moveButton, *stopButton, *connectButton, *dismissButton, *saveAlarmButton, *snoozeButton, *resumeButton;
static uint32_t lastInput = 0;
static const char *days[] = {"sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"};
static constexpr uint32_t background = 0x09090b, surface = 0x161618, accent = 0x94b4cd, foreground = 0xeeeeef, muted = 0x929298;
static void render();
static void refreshTemperature();
static void persistAppearance() {
    preferences.celsius = celsius;
    if (!saveDisplayPreferences(preferences)) setMessage("Display choice could not be saved");
}
static bool deviceFresh(const State &state) {
    return state.preview || (state.connected && nowMilliseconds() >= state.receivedAt && nowMilliseconds() - state.receivedAt <= statusLifetimeMs);
}

static lv_obj_t *label(const std::string &text, int horizontal, int vertical, int width, const lv_font_t *font = &lv_font_montserrat_20) {
    auto *object = lv_label_create(content);
    lv_label_set_text(object, text.c_str());
    lv_obj_set_pos(object, horizontal, vertical); lv_obj_set_width(object, width);
    lv_obj_set_style_text_align(object, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_style_text_font(object, font, 0);
    lv_obj_set_style_text_color(object, lv_color_hex(foreground), 0);
    lv_label_set_long_mode(object, LV_LABEL_LONG_DOT);
    const int lines = 1 + std::count(text.begin(), text.end(), '\n');
    lv_obj_set_height(object, lv_font_get_line_height(font) * lines + 2);
    return object;
}
static bool wake() {
    lastInput = lv_tick_get();
    if (!dimmed) return false;
    dimmed = false; bsp_display_brightness_set(55); return true;
}
static void action(lv_event_t *event) {
    if (wake()) return;
    const int identifier = static_cast<int>(reinterpret_cast<intptr_t>(lv_event_get_user_data(event)));
    Command command; command.side = selectedSide;
    switch (identifier) {
    case 1: selectedSide = 1 - selectedSide; alarmDirty = temperatureDirty = false; render(); return;
    case 2: case 3:
        requestedTemperature = stepTemperature(requestedTemperature, identifier == 2 ? -1 : 1, celsius, preferences.display);
        temperatureDirty = true; refreshTemperature(); return;
    case 4: command.action = Action::temperature; command.value = requestedTemperature; submit(command); return;
    case 5: command.action = Action::power; command.enabled = !snapshot().sides[selectedSide].powered; submit(command); return;
    case 6: {
        const auto base = snapshot().base;
        if (base.positionAvailable && !base.stale) {
            head = std::clamp(static_cast<int>(std::round(base.head)), 0, maximumHead);
            feet = std::clamp(static_cast<int>(std::round(base.feet)), 0, maximumFeet);
        }
        page = Page::base; render(); return;
    }
    case 7: page = Page::alarms; alarmDirty = false; render(); return;
    case 8: page = Page::settings; render(); return;
    case 9: page = Page::temperature; render(); return;
    case 10: command.action = Action::basePosition; command.value = head; command.feet = feet; command.speed = speed; submit(command); return;
    case 11: command.action = Action::baseStop; submit(command); return;
    case 12: command.action = Action::baseConnect; submit(command); return;
    case 13: selectedDay = (selectedDay + 1) % 7; alarmDirty = false; render(); return;
    case 14: {
        char time[6];
        std::snprintf(time, sizeof(time), "%02u:%02u", static_cast<unsigned>(lv_roller_get_selected(hourRoller)), static_cast<unsigned>(lv_roller_get_selected(minuteRoller)));
        draft.time = time; draft.enabled = lv_obj_has_state(enabledSwitch, LV_STATE_CHECKED);
        command.action = Action::alarmSave; command.alarm = draft; command.originalAlarm = originalAlarm;
        awaitingAlarmSave = submit(command); return;
    }
    case 15: command.action = Action::alarmDismiss; submit(command); return;
    case 16: command.action = Action::alarmSnooze; submit(command); return;
    case 17: command.action = Action::resume; submit(command); return;
    case 18: celsius = !celsius; persistAppearance(); render(); return;
    case 19: {
        char time[6];
        std::snprintf(time, sizeof(time), "%02u:%02u", static_cast<unsigned>(lv_roller_get_selected(hourRoller)), static_cast<unsigned>(lv_roller_get_selected(minuteRoller)));
        draft.time = time; draft.enabled = lv_obj_has_state(enabledSwitch, LV_STATE_CHECKED);
        page = Page::alarmOptions; alarmDirty = true; render(); return;
    }
    case 20: draft.intensity = draft.intensity >= 100 ? 10 : std::min(100, draft.intensity + 10); render(); return;
    case 21: draft.duration = draft.duration >= 180 ? 30 : draft.duration + 30; render(); return;
    case 22: draft.pattern = draft.pattern == "rise" ? "double" : "rise"; render(); return;
    case 23: draft.temperature = draft.temperature >= 110 ? 55 : draft.temperature + 1; render(); return;
    case 24: page = Page::alarms; render(); return;
    case 25: page = Page::stage; render(); return;
    case 26: scene.mattress = !scene.mattress; render(); return;
    case 27: page = Page::sensors; render(); return;
    case 28: page = Page::sensorDetails; render(); return;
    case 29: scene.yaw = -0.55f; scene.pitch = 0.65f; render(); return;
    case 30: sensorMask = sensorMask == 63 ? 0 : 63; render(); return;
    case 31: sensorMask = 7; render(); return;
    case 32: sensorMask = 56; render(); return;
    case 33: preferences.mattressView = !preferences.mattressView; persistAppearance(); render(); return;
    case 34: page = Page::appearance; render(); return;
    case 38: page = Page::bedroom; bedroomOffset = 0; render(); return;
    case 39: bedroomOffset = bedroomOffset >= 3 ? bedroomOffset - 3 : 0; render(); return;
    case 52:
        if (bedroomOffset + 3 < snapshot().bedroom.readings.size()) bedroomOffset += 3;
        render(); return;
    case 35: case 36: case 37:
        preferences.display = static_cast<TemperatureDisplay>(identifier - 35); persistAppearance(); render(); return;
    case 40: head = std::max(0, head - 1); render(); return;
    case 41: head = std::min(maximumHead, head + 1); render(); return;
    case 42: feet = std::max(0, feet - 1); render(); return;
    case 43: feet = std::min(maximumFeet, feet + 1); render(); return;
    case 44: page = Page::presets; render(); return;
    case 45: head = feet = 0; page = Page::base; render(); return;
    case 46: head = 1; feet = 5; page = Page::base; render(); return;
    case 47: head = 30; feet = 15; page = Page::base; render(); return;
    case 48: head = 40; feet = 0; page = Page::base; render(); return;
    case 49: speed = speed == 100 ? 50 : speed + 25; render(); return;
    case 50: page = Page::base; render(); return;
    case 51: {
        constexpr int windows[] = {0,10,15,20,30};
        int next=0; for(int index=0;index<5;++index) if(windows[index]==draft.wakeWindow) next=(index+1)%5;
        draft.wakeWindow=windows[next]; render(); return;
    }
    default:
        if (identifier >= 60 && identifier < 66) { sensorMask ^= 1 << (identifier - 60); render(); }
        return;
    }
    if (valueLabel) refreshTemperature();
}
static lv_obj_t *button(const std::string &title, int horizontal, int vertical, int width, int identifier, bool primary = false) {
    auto *object = lv_button_create(content);
    lv_obj_set_pos(object, horizontal, vertical); lv_obj_set_size(object, width, vertical >= 390 ? 42 : 44);
    lv_obj_set_style_radius(object, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_pad_all(object, 0, 0);
    lv_obj_set_style_border_width(object, primary ? 0 : 1, 0);
    lv_obj_set_style_border_color(object, lv_color_hex(0x303034), 0);
    lv_obj_set_style_bg_color(object, lv_color_hex(primary ? foreground : surface), 0);
    lv_obj_set_style_shadow_width(object, 0, 0);
    lv_obj_set_style_bg_color(object, lv_color_hex(primary ? 0x343438 : surface), LV_STATE_DISABLED);
    lv_obj_set_style_opa(object, LV_OPA_50, LV_STATE_DISABLED);
    auto *text = lv_label_create(object); lv_label_set_text(text, title.c_str()); lv_obj_center(text);
    lv_obj_set_style_text_font(text, &lv_font_montserrat_16, 0);
    lv_obj_set_style_text_color(text, lv_color_hex(primary ? background : foreground), 0);
    lv_obj_add_event_cb(object, action, LV_EVENT_CLICKED, reinterpret_cast<void *>(static_cast<intptr_t>(identifier)));
    return object;
}
static void presetButton(const std::string &title, const std::string &angles, int vertical, int identifier) {
    auto *object = button(title, 93, vertical, 280, identifier);
    lv_obj_align(lv_obj_get_child(object, 0), LV_ALIGN_LEFT_MID, 18, 0);
    auto *value = lv_label_create(object); lv_label_set_text(value, angles.c_str());
    lv_obj_set_style_text_font(value, &lv_font_montserrat_16, 0);
    lv_obj_set_style_text_color(value, lv_color_hex(muted), 0);
    lv_obj_align(value, LV_ALIGN_RIGHT_MID, -18, 0);
}
static lv_obj_t *roller(int horizontal, int count, int selection) {
    std::string options;
    for (int number = 0; number < count; ++number) {
        char digits[4]; std::snprintf(digits, sizeof(digits), "%02d", number);
        if (!options.empty()) options += '\n';
        options += digits;
    }
    auto *object = lv_roller_create(content); lv_roller_set_options(object, options.c_str(), LV_ROLLER_MODE_NORMAL);
    lv_roller_set_visible_row_count(object, 3); lv_obj_set_pos(object, horizontal, 150); lv_obj_set_width(object, 90);
    lv_obj_set_style_text_font(object, &lv_font_montserrat_24, 0);
    lv_obj_set_style_bg_color(object, lv_color_hex(surface), 0);
    lv_obj_set_style_border_width(object, 0, 0);
    lv_obj_set_style_text_color(object, lv_color_hex(foreground), 0);
    lv_obj_set_style_bg_color(object, lv_color_hex(accent), LV_PART_SELECTED);
    lv_obj_set_style_text_color(object, lv_color_hex(background), LV_PART_SELECTED);
    lv_roller_set_selected(object, selection, LV_ANIM_OFF);
    lv_obj_add_event_cb(object, [](lv_event_t *) { wake(); alarmDirty = true; }, LV_EVENT_VALUE_CHANGED, nullptr);
    return object;
}
static void loadDraft(const State &state) {
    draft = {}; draft.side = selectedSide; draft.day = days[selectedDay];
    for (const auto &alarm : state.alarms) if (alarm.side == selectedSide && alarm.day == draft.day) { draft = alarm; break; }
    originalAlarm = draft;
}

static void paintScene(bool interactive = false) {
    if(!sceneView) return;
    const int viewportWidth=lv_obj_get_width(sceneView),viewportHeight=lv_obj_get_height(sceneView);
    const int width=interactive?viewportWidth*2/3:viewportWidth,height=interactive?viewportHeight*2/3:viewportHeight;
    // Lower raster resolution only while dragging; settle at full panel detail on release.
    rasterizeBed(scene,width,height,scenePixels,sceneDepth);
    lv_canvas_set_buffer(sceneCanvas,scenePixels.data(),width,height,LV_COLOR_FORMAT_RGB565);
    lv_obj_set_size(sceneCanvas,width,height);
    lv_image_set_scale(sceneCanvas,viewportWidth*256/width);
    lv_obj_center(sceneCanvas);
    lv_obj_invalidate(sceneView);
}
static void dragScene(lv_event_t *event) {
    auto *input = lv_indev_active();
    if (!input) return;
    if (lv_event_get_code(event) == LV_EVENT_PRESSED) {
        ignoreDrag = wake(); lv_indev_get_point(input, &dragOrigin);
        dragYaw = scene.yaw; dragPitch = scene.pitch;
    } else if (!ignoreDrag && lv_event_get_code(event) == LV_EVENT_PRESSING) {
        wake(); lv_point_t point; lv_indev_get_point(input, &point);
        scene.yaw = dragYaw + (point.x - dragOrigin.x) * 0.012f;
        scene.pitch = std::clamp(dragPitch + (point.y - dragOrigin.y) * 0.006f, 0.30f, 1.20f);
        paintScene(true);
    } else if (!ignoreDrag && lv_event_get_code(event) == LV_EVENT_RELEASED) { paintScene(); }
}
static void bedViewport(int horizontal, int vertical, int width, int height, const State &state, bool editing) {
    scene.head = editing ? head : state.base.positionAvailable && !state.base.stale ? state.base.head : 0;
    scene.feet = editing ? feet : state.base.positionAvailable && !state.base.stale ? state.base.feet : 0;
    scene.sensorMask = page == Page::sensors ? sensorMask : 0;
    if (page == Page::temperature || page == Page::sensors) scene.mattress = true;
    for (int side = 0; side < 2; ++side) scene.sideColors[side] = editing || page == Page::sensors ? 0xa8aaae : activityColor(state.sides[side], deviceFresh(state));
    const bool available = state.preview || thermalFresh(state, nowMilliseconds(), std::time(nullptr));
    for (int sensor = 0; sensor < 6; ++sensor) scene.sensorColors[sensor] = available && (state.thermal.available & (1 << sensor)) ? thermalColor(state.thermal.zones[sensor]) : 0x62656a;
    sceneView = lv_obj_create(content); lv_obj_remove_style_all(sceneView);
    lv_obj_set_pos(sceneView, horizontal, vertical); lv_obj_set_size(sceneView, width, height);
    lv_obj_set_style_bg_color(sceneView, lv_color_hex(0x10111c), 0); lv_obj_set_style_bg_opa(sceneView, LV_OPA_COVER, 0);
    lv_obj_set_style_radius(sceneView, 24, 0); lv_obj_set_style_clip_corner(sceneView, true, 0);
    lv_obj_remove_flag(sceneView, LV_OBJ_FLAG_SCROLLABLE); lv_obj_add_flag(sceneView, LV_OBJ_FLAG_CLICKABLE);
    sceneCanvas = lv_canvas_create(sceneView); lv_obj_remove_style_all(sceneCanvas);
    lv_obj_remove_flag(sceneCanvas, LV_OBJ_FLAG_CLICKABLE);
    lv_image_set_antialias(sceneCanvas, true);
    lv_obj_update_layout(sceneView); paintScene();
    lv_obj_add_event_cb(sceneView, dragScene, LV_EVENT_PRESSED, nullptr);
    lv_obj_add_event_cb(sceneView, dragScene, LV_EVENT_PRESSING, nullptr);
    lv_obj_add_event_cb(sceneView, dragScene, LV_EVENT_RELEASED, nullptr);
}
static void title(const std::string &text) { label(text, 133, 34, 200, &lv_font_montserrat_20); }
static void back(int identifier = 9) { button("Back", 183, 397, 100, identifier); }
static void refreshBedroom(const State &state) {
    const auto &room = state.bedroom;
    const bool current = state.connected && bedroomFresh(room, nowMilliseconds());
    const char *heading = !room.loaded ? "SET UP IN THE APP" : !room.enabled ? "ROOM CONTEXT DISABLED" : current ? "DEVICE REPORTS" : "STALE OR UNAVAILABLE";
    lv_label_set_text(bedroomHeader, heading);
    if (bedroomOffset >= room.readings.size()) bedroomOffset = 0;
    for (size_t index = 0; index < bedroomLabels.size(); ++index) {
        const size_t position = bedroomOffset + index;
        std::string line;
        if (position < room.readings.size()) {
            const auto &reading = room.readings[position];
            const auto value = current ? bedroomValue(reading, room, nowMilliseconds(), celsius) : "--";
            const auto stateName = reading.status == "cached" ? "saved / not live" : value == "--" ? "unavailable" : "reported";
            line = reading.device + "\n" + reading.label + ": " + value + " / " + stateName;
        } else if (index == 0) line = "No bedroom devices connected\nUse Home in the web or iOS app";
        lv_label_set_text(bedroomLabels[index], line.c_str());
    }
    const std::string footer = room.readings.empty() ? "Routines stay on your Pod" : std::to_string(bedroomOffset + 1) + "-" + std::to_string(std::min(bedroomOffset + 3, room.readings.size())) + " of " + std::to_string(room.readings.size()) + " readings";
    lv_label_set_text(bedroomFooter, footer.c_str());
}
static std::string sensorReading(const State &state, int sensor) {
    if (!(state.thermal.available & (1 << sensor)) || (!state.preview && !thermalFresh(state, nowMilliseconds(), std::time(nullptr)))) return "--";
    char value[24]; std::snprintf(value, sizeof(value), "%.1f°", celsius ? (state.thermal.zones[sensor]-32)*5/9 : state.thermal.zones[sensor]);
    return value;
}
// Pages use the middle chord for content and a narrow footer inside the 450px safe circle.
static void render() {
    const auto state = snapshot();
    lv_obj_clean(content);
    thermalLabels.fill(nullptr); sensorButtons.fill(nullptr); sideLabels.fill(nullptr); environmentLabel = mcuLabel = nullptr;
    bedroomLabels.fill(nullptr); bedroomHeader = bedroomFooter = nullptr;
    temperatureArc = nullptr;
    valueLabel = readings = ownerLabel = headLabel = feetLabel = sceneView = sceneCanvas = sceneStatus = nullptr;
    powerButton = applyButton = moveButton = stopButton = connectButton = dismissButton = saveAlarmButton = snoozeButton = resumeButton = nullptr;
    const std::string side = selectedSide == 0 ? "Left side" : "Right side";
    if (page == Page::temperature) {
        title(state.preview ? "PREVIEW" : "TEMPERATURE");
        button(side + " >", 103, 65, 125, 1);
        button(preferences.mattressView ? "Dial view" : "Mattress view", 238, 65, 125, 33);
        if (!temperatureDirty && state.sides[selectedSide].targetAvailable)
            requestedTemperature = std::clamp(static_cast<int>(std::round(state.sides[selectedSide].target)), minimumTemperature, maximumTemperature);
        if (preferences.mattressView) {
            bedViewport(58, 116, 350, 143, state, false);
            valueLabel = label("", 133, 262, 200, &lv_font_montserrat_32);
            readings = label("", 83, 302, 300, &lv_font_montserrat_16);
            ownerLabel = label("", 83, 324, 300, &lv_font_montserrat_16);
            button("-", 85, 346, 48, 2); applyButton = button("Apply", 141, 346, 80, 4, true);
            button("+", 229, 346, 48, 3); powerButton = button("Power", 285, 346, 96, 5);
        } else {
            temperatureArc = lv_arc_create(content); lv_obj_set_size(temperatureArc, 264, 264); lv_obj_set_pos(temperatureArc, 101, 111);
            lv_arc_set_range(temperatureArc, preferences.display == TemperatureDisplay::eightSleep ? -10 : minimumTemperature,
                             preferences.display == TemperatureDisplay::eightSleep ? 10 : maximumTemperature);
            lv_arc_set_rotation(temperatureArc, 135); lv_arc_set_bg_angles(temperatureArc, 0, 270);
            lv_obj_set_style_arc_width(temperatureArc, 11, LV_PART_MAIN); lv_obj_set_style_arc_width(temperatureArc, 11, LV_PART_INDICATOR);
            lv_obj_set_style_arc_color(temperatureArc, lv_color_hex(0x242427), LV_PART_MAIN);
            lv_obj_set_style_bg_color(temperatureArc, lv_color_hex(foreground), LV_PART_KNOB);
            lv_obj_add_event_cb(temperatureArc, [](lv_event_t *event) {
                if (wake()) return;
                const int value = lv_arc_get_value(static_cast<lv_obj_t *>(lv_event_get_target(event)));
                requestedTemperature = preferences.display == TemperatureDisplay::eightSleep ? fahrenheitForLevel(value) : value;
                temperatureDirty = true; refreshTemperature();
            }, LV_EVENT_VALUE_CHANGED, nullptr);
            valueLabel = label("", 133, 164, 200, &lv_font_montserrat_48);
            readings = label("", 115, 222, 236, &lv_font_montserrat_16);
            button("-", 137, 259, 48, 2); button("+", 281, 259, 48, 3);
            applyButton = button("Apply", 195, 259, 76, 4, true);
            ownerLabel = label("", 108, 314, 250, &lv_font_montserrat_16);
            powerButton = button("Power", 168, 343, 130, 5);
        }
        button("Bed", 135, 391, 60, 25); button("Alarm", 203, 391, 60, 7); button("More", 271, 391, 60, 8);
        refreshTemperature();
    } else if (page == Page::stage) {
        title("YOUR BED");
        button(scene.mattress ? "Mattress on" : "Frame only", 103, 65, 125, 26);
        button("Reset view", 238, 65, 125, 29);
        bedViewport(58, 116, 350, 176, state, false);
        sceneStatus = label(state.preview ? "SAMPLE DATA / DRAG TO ROTATE" : "DRAG TO ROTATE", 83, 297, 300, &lv_font_montserrat_16);
        sideLabels[0] = label("", 83, 321, 150, &lv_font_montserrat_16);
        sideLabels[1] = label("", 233, 321, 150, &lv_font_montserrat_16);
        button("Position", 103, 346, 125, 6); button("Sensors", 238, 346, 125, 27);
        back();
    } else if (page == Page::base) {
        title("BED POSITION");
        button("Back", 103, 65, 80, 25); button(scene.mattress ? "Mattress" : "Frame", 193, 65, 80, 26); button("Presets", 283, 65, 80, 44);
        bedViewport(58, 116, 350, 176, state, true);
        headLabel = label("Head " + std::to_string(head) + "°", 93, 298, 130);
        feetLabel = label("Feet " + std::to_string(feet) + "°", 243, 298, 130);
        button("-", 100, 326, 50, 40); button("+", 166, 326, 50, 41);
        button("-", 250, 326, 50, 42); button("+", 316, 326, 50, 43);
        readings = label("Preview / both sides", 83, 369, 300, &lv_font_montserrat_16);
        moveButton = button("Move bed", 130, 391, 100, 10, true); stopButton = button("STOP", 236, 391, 100, 11);
        lv_obj_set_style_text_color(lv_obj_get_child(stopButton, 0), lv_color_hex(0xef8580), 0);
    } else if (page == Page::presets) {
        title("POSITION PRESETS");
        presetButton("Flat", "0° / 0°", 94, 45);
        presetButton("Sleep", "1° / 5°", 146, 46);
        presetButton("Relax", "30° / 15°", 198, 47);
        presetButton("Read", "40° / 0°", 250, 48);
        button("Speed " + std::to_string(speed) + "%", 133, 303, 200, 49);
        connectButton = button("Reconnect base", 143, 351, 180, 12);
        back(50);
    } else if (page == Page::sensors) {
        title("SENSOR LAYERS");
        button(sensorMask == 63 ? "None" : "All", 103, 65, 80, 30); button("Left", 193, 65, 80, 31); button("Right", 283, 65, 80, 32);
        bedViewport(58, 116, 350, 132, state, false);
        sceneStatus = label(state.preview ? "SAMPLE / TAP A ZONE" : "MEASURED / TAP A ZONE", 83, 253, 300, &lv_font_montserrat_16);
        for (int sensor = 0; sensor < 6; ++sensor) {
            auto *control = sensorButtons[sensor] = button(std::string(sensorNames[sensor])+"\n"+sensorReading(state,sensor), 83+(sensor%3)*102, 282+(sensor/3)*50, 96, 60+sensor);
            thermalLabels[sensor] = lv_obj_get_child(control, 0);
            lv_obj_set_style_text_align(thermalLabels[sensor], LV_TEXT_ALIGN_CENTER, 0);
            lv_obj_set_style_radius(control, 12, 0);
        }
        button("Back", 130, 391, 100, 25); button("Readings", 236, 391, 100, 28);
    } else if (page == Page::sensorDetails) {
        title("MEASUREMENTS");
        sceneStatus = label(state.preview ? "PREVIEW / SAMPLE DATA" : thermalFresh(state,nowMilliseconds(),std::time(nullptr)) ? "LIVE / °" + std::string(celsius?"C":"F") : "STALE OR UNAVAILABLE", 103, 75, 260, &lv_font_montserrat_16);
        for(int sensor=0;sensor<6;++sensor) {
            auto *reading=thermalLabels[sensor]=label(std::string(sensorNames[sensor])+"\n"+sensorReading(state,sensor),sensor<3?93:243,118+(sensor%3)*59,130,&lv_font_montserrat_20);
            const bool available=state.preview || thermalFresh(state,nowMilliseconds(),std::time(nullptr));
            lv_obj_set_style_text_color(reading,lv_color_hex(available && (state.thermal.available&(1<<sensor)) ? thermalColor(state.thermal.zones[sensor]) : muted),0);
        }
        const bool available=state.preview || thermalFresh(state,nowMilliseconds(),std::time(nullptr));
        environmentLabel = label("Room " + (available && state.thermal.ambientAvailable ? temperatureText(state.thermal.ambient,celsius) : "--")
            + " / RH " + (available && state.thermal.humidityAvailable ? std::to_string(static_cast<int>(state.thermal.humidity))+"%" : "--"),83,311,300,&lv_font_montserrat_16);
        mcuLabel = label("MCU " + (available && state.thermal.mcuAvailable ? temperatureText(state.thermal.mcu,celsius) : "--"),113,340,240,&lv_font_montserrat_16);
        button("Back", 130, 391, 100, 27); button("Bedroom", 236, 391, 100, 38);
    } else if (page == Page::bedroom) {
        title("BEDROOM");
        bedroomHeader = label("", 83, 84, 300, &lv_font_montserrat_16);
        for (size_t index = 0; index < bedroomLabels.size(); ++index) {
            bedroomLabels[index] = label("Device\nReading", 76, 132 + static_cast<int>(index) * 62, 314, &lv_font_montserrat_16);
        }
        bedroomFooter = label("", 93, 322, 280, &lv_font_montserrat_16);
        button("Previous", 103, 348, 125, 39); button("Next", 238, 348, 125, 52);
        back(28);
        refreshBedroom(state);
    } else if (page == Page::alarms) {
        title("WAKE ALARM");
        button(side, 103, 76, 125, 1); button(days[selectedDay], 238, 76, 125, 13);
        if (!alarmDirty) loadDraft(state);
        label(state.timezone, 83, 124, 300, &lv_font_montserrat_16);
        const int hour = draft.time.size() == 5 ? std::atoi(draft.time.substr(0, 2).c_str()) : 7;
        const int minute = draft.time.size() == 5 ? std::atoi(draft.time.substr(3, 2).c_str()) : 0;
        hourRoller = roller(132, 24, hour); minuteRoller = roller(244, 60, minute);
        label(":", 225, 184, 16, &lv_font_montserrat_24);
        enabledSwitch = lv_switch_create(content); lv_obj_set_pos(enabledSwitch, 258, 263);
        lv_obj_set_style_bg_color(enabledSwitch, lv_color_hex(0x47bd7d), static_cast<lv_style_selector_t>(LV_PART_INDICATOR) | static_cast<lv_style_selector_t>(LV_STATE_CHECKED));
        lv_obj_add_event_cb(enabledSwitch, [](lv_event_t *) { wake(); alarmDirty = true; }, LV_EVENT_VALUE_CHANGED, nullptr);
        if (draft.enabled) lv_obj_add_state(enabledSwitch, LV_STATE_CHECKED);
        label("Enabled", 120, 267, 120);
        saveAlarmButton = button("Save on Pod", 103, 303, 125, 14, true); button("Options", 238, 303, 125, 19);
        dismissButton = button("Dismiss", 103, 351, 125, 15); snoozeButton = button("Snooze 5m", 238, 351, 125, 16);
        back();
    } else if (page == Page::alarmOptions) {
        title("ALARM OPTIONS");
        button("Intensity " + std::to_string(draft.intensity) + "%", 103, 91, 260, 20);
        button("Duration " + std::to_string(draft.duration) + " seconds", 103, 141, 260, 21);
        button("Pattern " + draft.pattern, 103, 191, 260, 22);
        button("Wake target " + temperatureText(draft.temperature, celsius), 103, 241, 260, 23);
        button(draft.wakeWindow == 0 ? "Wake window off" : "Wake window " + std::to_string(draft.wakeWindow) + " min", 103, 291, 260, 51);
        label("Movement can wake you early.\nChanges save with the alarm.", 83, 347, 300, &lv_font_montserrat_16);
        back(24);
    } else if (page == Page::appearance) {
        title("DISPLAY");
        label("Show target as", 103, 87, 260, &lv_font_montserrat_16);
        for (int index = 0; index < 3; ++index) {
            const auto display = static_cast<TemperatureDisplay>(index);
            button(displayName(display), 103, 116+index*50, 260, 35+index, preferences.display == display);
        }
        button(celsius ? "Units: °C" : "Units: °F", 133, 274, 200, 18);
        label(preferences.display == TemperatureDisplay::offset ? "0 = 80°F / whole °F offset"
            : preferences.display == TemperatureDisplay::eightSleep ? "-10 to +10 / 0 = 82.5°F" : "Actual degrees in °F or °C", 73, 328, 320, &lv_font_montserrat_16);
        label("Sensor readings stay in degrees.", 83, 354, 300, &lv_font_montserrat_16);
        back(8);
    } else {
        title("SLEEPYPOD");
        ownerLabel = label(connectionSummary(state), 83, 96, 300, &lv_font_montserrat_16);
        resumeButton = button("Resume automatic temperature", 63, 146, 340, 17);
        button("Temperature display", 83, 202, 300, 34);
        connectButton = button("Reconnect base", 103, 258, 260, 12);
        label(state.preview ? "Set up Wi-Fi and your Pod key\nwith the USB provisioning tool.\nPreview cannot operate a bed."
              : !state.controllerConfigured ? "Add your Pod address and key\nwith the USB provisioning tool.\nLive controls are waiting."
              : "Manual temperature holds for 6h.\nYour Pod runs the routines\nwhen this remote is off.", 83, 319, 300, &lv_font_montserrat_16);
        back();
    }
}
static void refreshTemperature() {
    if (!valueLabel) return;
    const auto state = snapshot(); const auto &side = state.sides[selectedSide];
    const bool fresh = deviceFresh(state);
    if (fresh && side.targetAvailable && (!temperatureDirty || static_cast<int>(std::round(side.target)) == requestedTemperature)) {
        requestedTemperature = std::clamp(static_cast<int>(std::round(side.target)), minimumTemperature, maximumTemperature);
        temperatureDirty = false;
    }
    const auto color = activityColor(side, fresh);
    const bool targetAvailable = (fresh && side.targetAvailable) || temperatureDirty;
    lv_label_set_text(valueLabel, targetAvailable ? targetText(requestedTemperature, celsius, preferences.display).c_str() : "--");
    if (temperatureArc) {
        lv_arc_set_value(temperatureArc, preferences.display == TemperatureDisplay::eightSleep ? eightSleepLevel(requestedTemperature) : requestedTemperature);
        lv_obj_set_style_arc_color(temperatureArc, lv_color_hex(color), LV_PART_INDICATOR);
    }
    const std::string measured = fresh && side.measuredAvailable ? temperatureText(side.measured, celsius) : "--";
    lv_label_set_text(readings, ((targetAvailable ? temperatureText(requestedTemperature,celsius) : "No target")+" / bed "+measured).c_str());
    const std::string status = state.preview ? "SAMPLE / " : "";
    const std::string activity = !state.preview && !state.controllerConfigured
        ? (state.wifi ? "Pod setup needed" : "Joining Wi-Fi...") : status + activityName(temperatureActivity(side,fresh));
    lv_label_set_text(ownerLabel, (temperatureDirty ? "TARGET PREVIEW / APPLY" : activity).c_str());
    lv_obj_set_style_text_color(ownerLabel, lv_color_hex(temperatureDirty ? foreground : color), 0);
    lv_label_set_text(lv_obj_get_child(powerButton, 0), state.preview ? "Power" : side.powered ? "Turn off" : "Turn on");
}
static void updateEnabled(lv_obj_t *object, Action action, const State &state, bool enabled = false) {
    if (!object) return;
    Command command; command.action = action; command.side = selectedSide;
    command.enabled = enabled; command.createdAt = nowMilliseconds();
    if (maySend(command, state, command.createdAt)) lv_obj_remove_state(object, LV_STATE_DISABLED);
    else lv_obj_add_state(object, LV_STATE_DISABLED);
}
static void tick(lv_timer_t *) {
    const auto state = snapshot();
    const bool fresh = state.connected && nowMilliseconds() >= state.receivedAt && nowMilliseconds() - state.receivedAt <= statusLifetimeMs;
    if (state.message != lastMessage) {
        lastMessage = state.message; messageUntil = lv_tick_get() + 4000;
        lv_label_set_text(messageLabel, state.message.c_str());
        lv_obj_remove_flag(messageLabel, LV_OBJ_FLAG_HIDDEN);
    }
    if (static_cast<int32_t>(lv_tick_get() - messageUntil) > 0) lv_obj_add_flag(messageLabel, LV_OBJ_FLAG_HIDDEN);
    const auto &side = state.sides[selectedSide];
    updateEnabled(applyButton, Action::temperature, state);
    updateEnabled(powerButton, Action::power, state, !side.powered);
    updateEnabled(moveButton, Action::basePosition, state);
    updateEnabled(stopButton, Action::baseStop, state);
    updateEnabled(connectButton, Action::baseConnect, state);
    updateEnabled(dismissButton, Action::alarmDismiss, state);
    updateEnabled(saveAlarmButton, Action::alarmSave, state);
    updateEnabled(snoozeButton, Action::alarmSnooze, state);
    updateEnabled(resumeButton, Action::resume, state);
    // Only adopt the saved alarm once its exact fields are observed back from the server.
    if (awaitingAlarmSave && state.alarmsLoaded[selectedSide]) {
        for (const auto &alarm : state.alarms) {
            if (alarm.side == draft.side && alarm.day == draft.day && alarm.time == draft.time
                && alarm.enabled == draft.enabled && alarm.intensity == draft.intensity
                && alarm.duration == draft.duration && alarm.pattern == draft.pattern && alarm.temperature == draft.temperature && alarm.wakeWindow == draft.wakeWindow) {
                originalAlarm = draft = alarm; awaitingAlarmSave = false; alarmDirty = false; break;
            }
        }
    }
    if (page == Page::temperature) refreshTemperature();
    if (page == Page::settings && ownerLabel) lv_label_set_text(ownerLabel, connectionSummary(state).c_str());
    if (page == Page::bedroom) refreshBedroom(state);
    if (page == Page::base && readings) {
        const bool available = fresh && state.base.connected && !state.base.stale && state.base.positionAvailable
            && nowMilliseconds() >= state.baseReceivedAt && nowMilliseconds() - state.baseReceivedAt <= 10000;
        char text[100];
        if (available) std::snprintf(text, sizeof(text), "Live %.0f° / %.0f° / target above", state.base.head, state.base.feet);
        else std::snprintf(text, sizeof(text), state.preview ? "Preview only / both sides" : "Live position unavailable");
        lv_label_set_text(readings, text);
    }
    if (sceneView && page != Page::base) {
        const bool available = state.preview || thermalFresh(state, nowMilliseconds(), std::time(nullptr));
        bool changed = false;
        for (int sensor = 0; sensor < 6; ++sensor) {
            const uint32_t color = available && (state.thermal.available & (1<<sensor)) ? thermalColor(state.thermal.zones[sensor]) : 0x62656a;
            if (scene.sensorColors[sensor] != color) { scene.sensorColors[sensor] = color; changed = true; }
        }
        for (int index = 0; index < 2; ++index) {
            const uint32_t color = page == Page::sensors ? 0xa8aaae : activityColor(state.sides[index], deviceFresh(state));
            if (scene.sideColors[index] != color) { scene.sideColors[index] = color; changed = true; }
            if (sideLabels[index]) {
                lv_label_set_text(sideLabels[index], (std::string(index == 0 ? "L " : "R ")+activityName(temperatureActivity(state.sides[index], deviceFresh(state)))).c_str());
                lv_obj_set_style_text_color(sideLabels[index], lv_color_hex(color), 0);
            }
        }
        const bool baseFresh = state.preview || (fresh && !state.base.stale && state.base.positionAvailable && nowMilliseconds()>=state.baseReceivedAt && nowMilliseconds()-state.baseReceivedAt<=10000);
        const float reportedHead = baseFresh ? state.base.head : 0, reportedFeet = baseFresh ? state.base.feet : 0;
        if (scene.head != reportedHead || scene.feet != reportedFeet) { scene.head = reportedHead; scene.feet = reportedFeet; changed = true; }
        if (changed) paintScene();
    }
    if (page == Page::sensors) {
        const bool available = state.preview || thermalFresh(state, nowMilliseconds(), std::time(nullptr));
        lv_label_set_text(sceneStatus, state.preview ? "SAMPLE / TAP A ZONE" : available ? "LIVE / TAP A ZONE" : "STALE OR UNAVAILABLE");
        for (int sensor = 0; sensor < 6; ++sensor) {
            const bool selected = sensorMask & (1<<sensor);
            const uint32_t color = available && (state.thermal.available & (1<<sensor)) ? thermalColor(state.thermal.zones[sensor]) : muted;
            lv_label_set_text(thermalLabels[sensor], (std::string(sensorNames[sensor])+"\n"+sensorReading(state,sensor)).c_str());
            lv_obj_set_style_text_color(thermalLabels[sensor], lv_color_hex(selected ? color : muted), 0);
            lv_obj_set_style_border_color(sensorButtons[sensor], lv_color_hex(selected ? color : 0x303034), 0);
            lv_obj_set_style_border_width(sensorButtons[sensor], selected ? 2 : 1, 0);
            lv_obj_set_style_bg_color(sensorButtons[sensor], lv_color_hex(selected ? mixColors(surface, color, 0.18) : surface), 0);
        }
    }
    if (page == Page::sensorDetails) {
        const bool available=state.preview || thermalFresh(state,nowMilliseconds(),std::time(nullptr));
        const std::string heading=state.preview ? "PREVIEW / SAMPLE DATA" : available ? "LIVE / °"+std::string(celsius?"C":"F") : "STALE OR UNAVAILABLE";
        lv_label_set_text(sceneStatus,heading.c_str());
        for(int sensor=0;sensor<6;++sensor) {
            lv_label_set_text(thermalLabels[sensor],(std::string(sensorNames[sensor])+"\n"+sensorReading(state,sensor)).c_str());
            lv_obj_set_style_text_color(thermalLabels[sensor],lv_color_hex(available && (state.thermal.available&(1<<sensor)) ? thermalColor(state.thermal.zones[sensor]) : muted),0);
        }
        lv_label_set_text(environmentLabel,("Room "+(available && state.thermal.ambientAvailable?temperatureText(state.thermal.ambient,celsius):"--")
            +" / RH "+(available && state.thermal.humidityAvailable?std::to_string(static_cast<int>(state.thermal.humidity))+"%":"--")).c_str());
        lv_label_set_text(mcuLabel,("MCU "+(available && state.thermal.mcuAvailable?temperatureText(state.thermal.mcu,celsius):"--")).c_str());
    }
    if (lv_tick_get() - lastInput > 30000 && !dimmed) { dimmed = true; bsp_display_brightness_set(5); }
}
void startUI(bool useCelsius) {
    preferences = loadDisplayPreferences(useCelsius); celsius = preferences.celsius;
    // Allocate and warm the largest mesh buffers before the first interaction.
    const auto renderStart = nowMilliseconds();
    rasterizeBed(scene, 350, 196, scenePixels, sceneDepth);
    const auto fullRenderTime = nowMilliseconds()-renderStart;
    const auto interactiveStart = nowMilliseconds();
    rasterizeBed(scene, 233, 130, scenePixels, sceneDepth);
    std::printf("Bed renderer ready: full %lld ms / drag %lld ms\n", static_cast<long long>(fullRenderTime), static_cast<long long>(nowMilliseconds()-interactiveStart));
    bsp_display_lock(-1);
    auto *screen = lv_screen_active();
    lv_obj_set_style_bg_color(screen, lv_color_hex(background), 0);
    content = lv_obj_create(screen); lv_obj_remove_style_all(content); lv_obj_set_size(content, 466, 466);
    lv_obj_remove_flag(content, LV_OBJ_FLAG_SCROLLABLE);
    // Status is overlaid only when touched through the center; retained separately from page controls.
    messageLabel = lv_label_create(screen); lv_obj_set_pos(messageLabel, 83, 151); lv_obj_set_size(messageLabel, 300, 104);
    lv_obj_set_style_text_color(messageLabel, lv_color_hex(muted), 0);
    lv_obj_set_style_text_font(messageLabel, &lv_font_montserrat_16, 0);
    lv_obj_set_style_bg_color(messageLabel, lv_color_hex(surface), 0);
    lv_obj_set_style_bg_opa(messageLabel, LV_OPA_COVER, 0);
    lv_obj_set_style_pad_all(messageLabel, 14, 0);
    lv_obj_set_style_radius(messageLabel, 12, 0);
    lv_obj_set_style_text_align(messageLabel, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_long_mode(messageLabel, LV_LABEL_LONG_WRAP);
    lv_obj_add_flag(messageLabel, LV_OBJ_FLAG_HIDDEN);
    render();
    lv_timer_create(tick, 500, nullptr);
    bsp_display_unlock();
}
}
