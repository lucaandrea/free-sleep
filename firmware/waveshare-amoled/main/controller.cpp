#include "controller.hpp"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"
#include "esp_crt_bundle.h"
#include "esp_event.h"
#include "esp_http_client.h"
#include "esp_netif.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include <cstring>
#include <algorithm>
#include "esp_netif_sntp.h"
#include <deque>

namespace bedside {
static Configuration configuration;
static State current;
static SemaphoreHandle_t stateLock;
static std::deque<Command> commands, urgentCommands;
int64_t nowMilliseconds() { return esp_timer_get_time() / 1000; }
State snapshot() {
    xSemaphoreTake(stateLock, portMAX_DELAY);
    State result = current;
    xSemaphoreGive(stateLock);
    return result;
}
void setMessage(const std::string &message) {
    xSemaphoreTake(stateLock, portMAX_DELAY);
    current.message = message; ++current.revision;
    xSemaphoreGive(stateLock);
}
bool submit(Command command) {
    if (snapshot().preview) { setMessage("Preview only - connect your Pod to control it"); return false; }
    Request request;
    if (!buildRequest(command, request)) { setMessage("Check the requested values"); return false; }
    command.createdAt = nowMilliseconds();
    xSemaphoreTake(stateLock, portMAX_DELAY);
    const bool urgent = command.action == Action::baseStop || command.action == Action::alarmDismiss;
    auto &queue = urgent ? urgentCommands : commands;
    bool accepted = maySend(command, current, command.createdAt) && queue.empty();
    if (accepted) {
        if (command.action == Action::baseStop) {
            commands.erase(std::remove_if(commands.begin(), commands.end(), [](const Command &pending) {
                return pending.action == Action::basePosition;
            }), commands.end());
        }
        queue.push_back(command);
        current.message = urgent ? "Sending stop request..." : "Sending request...";
    } else current.message = "Unavailable, stale, or another action is pending";
    ++current.revision;
    xSemaphoreGive(stateLock);
    return accepted;
}

struct ResponseBuffer { std::string data; bool oversized = false; };
static esp_err_t receiveData(esp_http_client_event_t *event) {
    if (event->event_id != HTTP_EVENT_ON_DATA) return ESP_OK;
    auto *buffer = static_cast<ResponseBuffer *>(event->user_data);
    if (buffer->data.size() + event->data_len > 65536) { buffer->oversized = true; return ESP_FAIL; }
    buffer->data.append(static_cast<const char *>(event->data), event->data_len);
    return ESP_OK;
}

// Redirects are disabled so bearer credentials never follow an unexpected destination.
static bool transport(const Request &request, std::string &body, int &status) {
    const std::string url = configuration.endpoint + request.path;
    ResponseBuffer buffer;
    esp_http_client_config_t options = {};
    options.url = url.c_str();
    options.timeout_ms = 2500;
    options.disable_auto_redirect = true;
    options.crt_bundle_attach = esp_crt_bundle_attach;
    options.event_handler = receiveData;
    options.user_data = &buffer;
    options.buffer_size = 2048;
    esp_http_client_handle_t client = esp_http_client_init(&options);
    if (!client) return false;
    const std::string authorization = "Bearer " + configuration.token;
    esp_http_client_set_header(client, "Authorization", authorization.c_str());
    esp_http_client_set_header(client, "Accept", "application/json");
    if (request.method != "GET") {
        esp_http_client_set_method(client, request.method == "PATCH" ? HTTP_METHOD_PATCH : HTTP_METHOD_POST);
        esp_http_client_set_header(client, "Content-Type", "application/json");
        esp_http_client_set_post_field(client, request.body.c_str(), request.body.size());
    }
    const auto result = esp_http_client_perform(client);
    status = esp_http_client_get_status_code(client);
    body = std::move(buffer.data);
    esp_http_client_cleanup(client);
    return result == ESP_OK && !buffer.oversized && status >= 200 && status < 300;
}
static bool get(const std::string &path, std::string &body, int &status) {
    return transport({path, "GET", ""}, body, status);
}

static void execute(const Command &command) {
    if (!maySend(command, snapshot(), nowMilliseconds())) { setMessage("Request expired or control unavailable"); return; }
    Request request;
    if (!buildRequest(command, request)) return;
    std::string response;
    int status = 0;
    // Refresh the selected alarm before writing: do not silently recreate or overwrite a changed row.
    if (command.action == Action::alarmSave) {
        State latest;
        if (!get(std::string("/api/schedules?side=") + sideName(command.side) + "&unit=F", response, status)
            || !parseAlarms(response, latest, command.side)) { setMessage("Could not recheck the alarm"); return; }
        auto matching = [&](const Alarm &alarm) { return alarm.side == command.side && alarm.day == command.alarm.day; };
        const auto live = std::find_if(latest.alarms.begin(), latest.alarms.end(), matching);
        const auto &original = command.originalAlarm;
        const bool missing = live == latest.alarms.end();
        if ((command.alarm.identifier < 0 && !missing) || (command.alarm.identifier >= 0
            && (missing || live->identifier != command.alarm.identifier
                || live->time != original.time || live->enabled != original.enabled
                || live->intensity != original.intensity || live->pattern != original.pattern
                || live->duration != original.duration || live->temperature != original.temperature || live->wakeWindow != original.wakeWindow))) {
            setMessage("Alarm changed elsewhere. Reload before saving."); return;
        }
        if (!maySend(command, snapshot(), nowMilliseconds())) { setMessage("Request expired; review and save again"); return; }
    }
    const bool success = transport(request, response, status);
    if (success) setMessage(command.action == Action::alarmSave ? "Alarm saved on the Pod" : "Request accepted - checking reported state");
    else if (status == 401 || status == 403) setMessage("Connection key rejected - provision again over USB");
    else if (status == 0) setMessage("No acknowledgement - check state before retrying");
    else setMessage("Controller rejected request (HTTP " + std::to_string(status) + ")");
}
static bool takeCommand(bool urgent, Command &command) {
    xSemaphoreTake(stateLock, portMAX_DELAY);
    auto &queue = urgent ? urgentCommands : commands;
    const bool found = !queue.empty();
    if (found) { command = queue.front(); queue.pop_front(); }
    xSemaphoreGive(stateLock);
    return found;
}
static void urgentWorker(void *) {
    while (true) {
        Command command;
        if (takeCommand(true, command)) execute(command);
        vTaskDelay(pdMS_TO_TICKS(25));
    }
}
static void publish(State &state) {
    xSemaphoreTake(stateLock, portMAX_DELAY);
    state.wifi = current.wifi;
    state.message = current.message;
    state.revision = current.revision + 1;
    current = state;
    xSemaphoreGive(stateLock);
}
static void worker(void *) {
    int64_t nextPoll = 0, nextSchedules = 0, nextThermal = 0;
    while (true) {
        Command command;
        if (takeCommand(false, command)) { execute(command); nextPoll = 0; if (command.action == Action::alarmSave) nextSchedules = 0; }
        State state = snapshot();
        if (state.wifi && nowMilliseconds() >= nextPoll) {
            std::string response;
            int status = 0;
            if (!get("/api/device/status?unit=F", response, status) || !parseDevice(response, state, nowMilliseconds())) {
                state.connected = false;
                setMessage(status == 401 || status == 403 ? "Connection key rejected" : "Pod offline - controls paused");
            }
            publish(state);
            if (state.connected) {
                if (!get("/api/base/status", response, status) || !parseBase(response, state, nowMilliseconds())) state.base = {};
                publish(state);
                if (nowMilliseconds() >= nextThermal) {
                    if (!get("/api/environment/bed-temp/latest?unit=F", response, status) || !parseThermal(response, state, nowMilliseconds())) state.thermal = {};
                    publish(state);
                    nextThermal = nowMilliseconds() + 10000;
                }
                if (nowMilliseconds() >= nextSchedules) {
                    for (int side = 0; side < 2; ++side) {
                        if (!get(std::string("/api/schedules?side=") + sideName(side) + "&unit=F", response, status)
                            || !parseAlarms(response, state, side)) state.alarmsLoaded[side] = false;
                    }
                    if (get("/api/settings", response, status)) parseSettings(response, state);
                    publish(state);
                    nextSchedules = nowMilliseconds() + 30000;
                }
            }
            nextPoll = nowMilliseconds() + 3000;
        }
        vTaskDelay(pdMS_TO_TICKS(50));
    }
}
static void wifiEvent(void *, esp_event_base_t base, int32_t event, void *) {
    if (base == WIFI_EVENT && event == WIFI_EVENT_STA_START) esp_wifi_connect();
    if (base == WIFI_EVENT && event == WIFI_EVENT_STA_DISCONNECTED) {
        xSemaphoreTake(stateLock, portMAX_DELAY);
        current.wifi = false; current.connected = false; commands.clear(); urgentCommands.clear();
        current.message = "Wi-Fi disconnected - reconnecting"; ++current.revision;
        xSemaphoreGive(stateLock);
        esp_wifi_connect();
    }
    if (base == IP_EVENT && event == IP_EVENT_STA_GOT_IP) {
        xSemaphoreTake(stateLock, portMAX_DELAY);
        current.wifi = true;
        current.message = current.controllerConfigured ? "Connecting to your Pod..." : "Wi-Fi ready - add your Pod over USB";
        ++current.revision;
        xSemaphoreGive(stateLock);
    }
}
void startController(const Configuration &settings) {
    configuration = settings;
    stateLock = xSemaphoreCreateMutex();
    current.controllerConfigured = settings.hasController();
    current.message = "Joining Wi-Fi...";
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();
    wifi_init_config_t init = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&init));
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, wifiEvent, nullptr));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, wifiEvent, nullptr));
    wifi_config_t wifi = {};
    std::memcpy(wifi.sta.ssid, configuration.ssid.data(), configuration.ssid.size());
    std::memcpy(wifi.sta.password, configuration.password.data(), configuration.password.size());
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi));
    ESP_ERROR_CHECK(esp_wifi_start());
    esp_sntp_config_t timeConfiguration = ESP_NETIF_SNTP_DEFAULT_CONFIG("pool.ntp.org");
    esp_netif_sntp_init(&timeConfiguration);
    if (settings.hasController()) {
        xTaskCreate(worker, "pod_network", 12288, nullptr, 4, nullptr);
        xTaskCreate(urgentWorker, "pod_stop", 8192, nullptr, 6, nullptr);
    }
}

// The unconfigured board can show its controls without opening a network or issuing commands.
void startPreview() {
    stateLock = xSemaphoreCreateMutex();
    current.preview = true;
    current.sides[0] = {true, true, false, 81, 68, true, true, "preview", "", 0};
    current.sides[1] = {true, true, false, 78, 88, true, true, "preview", "", 0};
    current.thermal.zones = {67.6, 73.3, 78.9, 91.7, 84.8, 80.4};
    current.thermal.available = 63;
    current.thermal.ambient = 76.8; current.thermal.mcu = 91.9; current.thermal.humidity = 54;
    current.thermal.ambientAvailable = current.thermal.mcuAvailable = current.thermal.humidityAvailable = true;
    current.message = "Preview only - connect USB to set up your Pod";
}
}
