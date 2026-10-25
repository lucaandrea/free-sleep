#include "controller.hpp"
#include "bsp/esp-bsp.h"
#include "bsp/display.h"
#include "nvs_flash.h"
#include "nvs.h"
#include "lvgl.h"
#include "esp_system.h"
#include <cstdio>

// Provisioning is deliberately local to USB; no unauthenticated Wi-Fi setup service is opened.
static bool loadConfiguration(bedside::Configuration &configuration) {
    nvs_handle_t handle;
    if (nvs_open("bedside", NVS_READONLY, &handle) != ESP_OK) return false;
    size_t length = 0;
    const auto result = nvs_get_str(handle, "connection", nullptr, &length);
    if (result != ESP_OK || length > 2048 || length <= 1) { nvs_close(handle); return false; }
    std::string saved(length, '\0');
    const bool valid = nvs_get_str(handle, "connection", saved.data(), &length) == ESP_OK
        && bedside::parseConfiguration(saved, configuration);
    nvs_close(handle);
    return valid;
}
static void provision(void *) {
    std::string input;
    while (true) {
        const int character = std::getchar();
        if (character == EOF) { vTaskDelay(pdMS_TO_TICKS(20)); continue; }
        if (character == '\n' || character == '\r') {
            bedside::Configuration settings;
            if (bedside::parseConfiguration(input, settings)) {
                nvs_handle_t handle;
                if (nvs_open("bedside", NVS_READWRITE, &handle) == ESP_OK) {
                    const bool stored = nvs_set_str(handle, "connection", input.c_str()) == ESP_OK && nvs_commit(handle) == ESP_OK;
                    nvs_close(handle);
                    if (stored) { std::puts("Configuration saved. Restarting."); esp_restart(); }
                }
            }
            std::puts("Invalid configuration. Supply ssid, password, endpoint and token via the provisioning tool.");
            input.clear();
        } else if (input.size() < 2048) input.push_back(static_cast<char>(character));
        else input.clear();
    }
}
extern "C" void app_main() {
    ESP_ERROR_CHECK(nvs_flash_init());
    bsp_display_start();
    bsp_display_brightness_set(55);
    xTaskCreate(provision, "usb_provision", 6144, nullptr, 3, nullptr);
    bedside::Configuration configuration;
    if (loadConfiguration(configuration)) {
        bedside::startController(configuration);
        bedside::startUI(configuration.celsius);
    } else {
        bedside::startPreview();
        bedside::startUI(false);
        std::puts("Preview ready. Configure Wi-Fi and Pod over USB; bed commands are disabled.");
    }
}
