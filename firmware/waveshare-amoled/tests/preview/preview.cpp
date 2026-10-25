#include "controller.hpp"
#include "lvgl.h"
#include "bed_scene.hpp"
#include "preferences.hpp"
#include <cstdlib>
#include <sstream>
#include <ctime>
#include <cstdio>
#include <vector>
#include <string>
static std::vector<uint8_t> pixels(466 * 466 * 3);
namespace bedside {
static DisplayPreferences savedPreferences;
static std::string dynamicState;
DisplayPreferences loadDisplayPreferences(bool) { return savedPreferences; }
bool saveDisplayPreferences(const DisplayPreferences &preferences) { savedPreferences = preferences; return true; }
State snapshot() {
    State state;
    state.preview = true; state.receivedAt = 0;
    state.sides[0] = {true, true, false, 81, 68, true, true, "manual", "", 0};
    state.sides[1] = {true, true, false, 78, 88, true, true, "schedule", "", 0};
    state.message = "Preview · simulated data";
    state.base = {true, true, false, false, true, 10, 5};
    state.timezone = "America/Los_Angeles";
    state.thermal.zones = {67.6,73.3,78.9,91.7,84.8,80.4}; state.thermal.available = 63;
    state.thermal.ambient = 76.8; state.thermal.mcu = 91.9; state.thermal.humidity = 54;
    state.thermal.ambientAvailable = state.thermal.mcuAvailable = state.thermal.humidityAvailable = true;
    const char *mode = std::getenv("PREVIEW_STATE");
    if (mode && std::string(mode) != "demo") {
        state.preview = false; state.wifi = state.connected = true;
        state.thermal.observedAt = std::time(nullptr);
        if (std::string(mode) == "stale") state.thermal.observedAt -= 120;
        if (std::string(mode) == "missing") { state.thermal.available = 9; state.thermal.ambientAvailable = false; }
        if (std::string(mode) == "offline") state.connected = false;
        if (std::string(mode) == "device-stale") state.receivedAt = -20000;
        if (std::string(mode) == "off") state.sides[0].powered = state.sides[1].powered = false;
        if (std::string(mode) == "holding") { state.sides[0].measured = state.sides[0].target; state.sides[1].measured = state.sides[1].target; }
        if (std::string(mode) == "missing") { state.sides[0].measuredAvailable = false; state.sides[1].targetAvailable = false; }
    }
    state.alarmsLoaded[0] = state.alarmsLoaded[1] = true;
    if (dynamicState == "heating") { state.sides[0].target = 88; state.sides[0].measured = 70; }
    if (dynamicState == "cooling") { state.sides[0].target = 68; state.sides[0].measured = 88; }
    if (dynamicState == "settled") { state.sides[0].target = 68; state.sides[0].measured = 68; }
    if (dynamicState == "expired") { state.preview = false; state.connected = false; }
    return state;
}
bool submit(Command) { std::fprintf(stderr,"Unexpected mutation in preview renderer\n"); std::abort(); }
int64_t nowMilliseconds() { return 0; }
void setMessage(const std::string &) {}
}
static void flush(lv_display_t *display, const lv_area_t *area, uint8_t *buffer) {
    for (int vertical = area->y1; vertical <= area->y2; ++vertical) {
        for (int horizontal = area->x1; horizontal <= area->x2; ++horizontal) {
            const int target = (vertical * 466 + horizontal) * 3;
            pixels[target] = buffer[2]; pixels[target + 1] = buffer[1]; pixels[target + 2] = buffer[0]; buffer += 3;
        }
    }
    lv_display_flush_ready(display);
}
static bool clickText(lv_obj_t *parent, const std::string &text) {
    for (uint32_t index = 0; index < lv_obj_get_child_count(parent); ++index) {
        auto *child = lv_obj_get_child(parent, index);
        const std::string labelText = lv_obj_check_type(child, &lv_label_class) ? lv_label_get_text(child) : "";
        if (!labelText.empty() && (text == labelText || text == labelText.substr(0,labelText.find('\n')))) {
            if(lv_obj_has_state(parent, LV_STATE_DISABLED)) return false;
            lv_obj_send_event(parent, LV_EVENT_CLICKED, nullptr); return true;
        }
        if (clickText(child, text)) return true;
    }
    return false;
}
static bool containsText(lv_obj_t *parent, const std::string &text) {
    if (lv_obj_check_type(parent, &lv_label_class) && text == lv_label_get_text(parent)) return true;
    for (uint32_t index = 0; index < lv_obj_get_child_count(parent); ++index)
        if (containsText(lv_obj_get_child(parent, index), text)) return true;
    return false;
}
static lv_point_t pointer = {180,200};
static bool pressed = false;
static void readPointer(lv_indev_t *, lv_indev_data_t *data) { data->point=pointer; data->state=pressed?LV_INDEV_STATE_PRESSED:LV_INDEV_STATE_RELEASED; }
static void advance(int frames=4) { for(int frame=0;frame<frames;++frame) {lv_tick_inc(20);lv_timer_handler();} }
static void drag() {
    pointer={170,180};pressed=true;advance();
    for(int step=0;step<30;++step) {pointer.x=170+step*4;pointer.y=180+step;advance(1);}
    pressed=false;advance();
}
// Check actual LVGL top-level layout rectangles, not a separate mock of the UI.
static bool checkBounds() {
    auto *content=lv_obj_get_child(lv_screen_active(),0);lv_obj_update_layout(content);
    bool valid=true;
    for(uint32_t index=0;index<lv_obj_get_child_count(content);++index) {
        auto *object=lv_obj_get_child(content,index);if(lv_obj_has_flag(object,LV_OBJ_FLAG_HIDDEN))continue;
        lv_area_t bounds;lv_obj_get_coords(object,&bounds);
        auto checkText=[&](lv_obj_t *label) {
            if(!lv_obj_check_type(label,&lv_label_class)) return;
            lv_point_t measured;
            lv_text_get_size(&measured,lv_label_get_text(label),lv_obj_get_style_text_font(label,LV_PART_MAIN),0,0,LV_COORD_MAX,LV_TEXT_FLAG_EXPAND);
            if(measured.x>lv_obj_get_width(label)) {
                std::fprintf(stderr,"Truncated text: %s (%d > %d)\n",lv_label_get_text(label),measured.x,lv_obj_get_width(label));valid=false;
            }
        };
        checkText(object);
        if(lv_obj_check_type(object,&lv_button_class)) for(uint32_t child=0;child<lv_obj_get_child_count(object);++child) {
            auto *text=lv_obj_get_child(object,child);checkText(text);
            lv_area_t childBounds;lv_obj_get_coords(text,&childBounds);
            if(childBounds.x1<bounds.x1 || childBounds.x2>bounds.x2 || childBounds.y1<bounds.y1 || childBounds.y2>bounds.y2) {
                std::fprintf(stderr,"Button label exceeds its hit target\n");valid=false;
            }
        }
        if(!bedside::rectangleInsideCircle(bounds.x1,bounds.y1,lv_area_get_width(&bounds),lv_area_get_height(&bounds))) {
            const char *text=lv_obj_check_type(object,&lv_label_class)?lv_label_get_text(object):"Control";
            std::fprintf(stderr,"Outside circle: %s (%d,%d)-(%d,%d)\n",text,bounds.x1,bounds.y1,bounds.x2,bounds.y2);valid=false;
        }
    }
    return valid;
}
int main(int count, char **arguments) {
    lv_init();
    auto *display = lv_display_create(466, 466);
    lv_display_set_color_format(display, LV_COLOR_FORMAT_RGB888);
    std::vector<uint8_t> buffer(466 * 466 * 3);
    lv_display_set_buffers(display, buffer.data(), nullptr, buffer.size(), LV_DISPLAY_RENDER_MODE_FULL);
    lv_display_set_flush_cb(display, flush);
    auto *input=lv_indev_create();lv_indev_set_type(input,LV_INDEV_TYPE_POINTER);lv_indev_set_read_cb(input,readPointer);
    bedside::startUI(false);advance(30);
    std::istringstream path(count>1?arguments[1]:"Temp");std::string step;
    while(std::getline(path,step,'|')) {
        if(step=="Temp" || step=="Tonight") continue;
        if(step=="@drag") drag();
        else if (step.rfind("@state=",0)==0) bedside::dynamicState = step.substr(7);
        else if (step.rfind("@expect=",0)==0) {
            if (!containsText(lv_screen_active(),step.substr(8))) { std::fprintf(stderr,"Missing expected text: %s\n",step.c_str()); return 4; }
        }
        else if(!clickText(lv_screen_active(),step)) {std::fprintf(stderr,"Missing/enabled button: %s\n",step.c_str());return 2;}
        advance(30);if(!checkBounds())return 3;
    }
    advance(250);lv_refr_now(display);
    if(!checkBounds())return 3;
    auto *file = std::fopen(count > 2 ? arguments[2] : "/tmp/bedside-preview.ppm", "wb");
    if (!file) return 1;
    std::fprintf(file, "P6\n466 466\n255\n");
    std::fwrite(pixels.data(), 1, pixels.size(), file); std::fclose(file);
}
