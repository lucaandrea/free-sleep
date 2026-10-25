#pragma once
#include <cstdint>
using nvs_handle_t = unsigned;
using esp_err_t = int;
constexpr esp_err_t ESP_OK = 0;
constexpr int NVS_READONLY = 0, NVS_READWRITE = 1;
esp_err_t nvs_open(const char *name, int mode, nvs_handle_t *handle);
esp_err_t nvs_get_u8(nvs_handle_t handle, const char *key, uint8_t *value);
esp_err_t nvs_set_u8(nvs_handle_t handle, const char *key, uint8_t value);
esp_err_t nvs_commit(nvs_handle_t handle);
void nvs_close(nvs_handle_t handle);
