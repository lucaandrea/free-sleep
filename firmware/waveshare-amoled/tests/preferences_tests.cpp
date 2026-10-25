#include "preferences.hpp"
#include "nvs.h"
#include <cassert>
#include <map>
#include <string>

static std::map<std::string, uint8_t> committed, pending;
static bool failCommit = false;
esp_err_t nvs_open(const char *name, int mode, nvs_handle_t *handle) {
    assert(std::string(name) == "bedside_ui"); // UI writes must never open the connection namespace.
    if (mode == NVS_READONLY && committed.empty()) return -1;
    pending = committed; *handle = 1; return ESP_OK;
}
esp_err_t nvs_get_u8(nvs_handle_t, const char *key, uint8_t *value) {
    if (!committed.count(key)) return -1;
    *value = committed.at(key); return ESP_OK;
}
esp_err_t nvs_set_u8(nvs_handle_t, const char *key, uint8_t value) { pending[key] = value; return ESP_OK; }
esp_err_t nvs_commit(nvs_handle_t) {
    if (failCommit) return -1;
    committed = pending; return ESP_OK;
}
void nvs_close(nvs_handle_t) { pending.clear(); }
int main() {
    using namespace bedside;
    assert(loadDisplayPreferences(true).celsius);
    assert(loadDisplayPreferences(false).display == TemperatureDisplay::degrees);
    for (auto display : {TemperatureDisplay::degrees, TemperatureDisplay::offset, TemperatureDisplay::eightSleep}) {
        DisplayPreferences preferences; preferences.display = display; preferences.celsius = true; preferences.mattressView = true;
        assert(saveDisplayPreferences(preferences));
        const auto restored = loadDisplayPreferences(false);
        assert(restored.display == display && restored.celsius && restored.mattressView);
    }
    failCommit = true;
    assert(!saveDisplayPreferences({}));
    assert(loadDisplayPreferences(false).display == TemperatureDisplay::eightSleep);
    committed = {{"display", 200}, {"celsius", 200}, {"mattress", 200}};
    const auto recovered = loadDisplayPreferences(false);
    assert(recovered.display == TemperatureDisplay::degrees && !recovered.celsius && !recovered.mattressView);
}
