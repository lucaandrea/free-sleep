#include "preferences.hpp"
#include "nvs.h"

namespace bedside {
DisplayPreferences loadDisplayPreferences(bool defaultCelsius) {
    DisplayPreferences preferences; preferences.celsius = defaultCelsius;
    nvs_handle_t handle;
    if (nvs_open("bedside_ui", NVS_READONLY, &handle) != ESP_OK) return preferences;
    uint8_t value = 0;
    if (nvs_get_u8(handle, "display", &value) == ESP_OK && value <= 2) preferences.display = static_cast<TemperatureDisplay>(value);
    if (nvs_get_u8(handle, "celsius", &value) == ESP_OK && value <= 1) preferences.celsius = value;
    if (nvs_get_u8(handle, "mattress", &value) == ESP_OK && value <= 1) preferences.mattressView = value;
    nvs_close(handle);
    return preferences;
}
bool saveDisplayPreferences(const DisplayPreferences &preferences) {
    // UI choices live separately from connection credentials and never reconfigure the Pod.
    nvs_handle_t handle;
    if (nvs_open("bedside_ui", NVS_READWRITE, &handle) != ESP_OK) return false;
    const bool saved = nvs_set_u8(handle, "display", static_cast<uint8_t>(preferences.display)) == ESP_OK
        && nvs_set_u8(handle, "celsius", preferences.celsius) == ESP_OK
        && nvs_set_u8(handle, "mattress", preferences.mattressView) == ESP_OK
        && nvs_commit(handle) == ESP_OK;
    nvs_close(handle);
    return saved;
}
}
