#pragma once
#include <array>
#include <cstdint>
#include <string>
#include <vector>
#include "bedroom.hpp"

namespace bedside {
constexpr int minimumTemperature = 55;
constexpr int maximumTemperature = 110;
constexpr int maximumHead = 60;
constexpr int maximumFeet = 45;
constexpr int64_t commandLifetimeMs = 5000;
constexpr int64_t statusLifetimeMs = 15000;
constexpr int64_t thermalReceiptLifetimeMs = 30000;
// Core stores bed temperatures every 60 seconds; allow the next poll and ingestion delay.
constexpr int64_t thermalSampleLifetimeSeconds = 90;

struct Configuration {
    std::string ssid, password, endpoint, token;
    bool allowLocalHttp = false;
    bool celsius = false;
    bool networkOnly = false;
    bool hasController() const { return !endpoint.empty() && !token.empty(); }
};
struct SideStatus {
    bool valid = false, powered = false, vibrating = false;
    double measured = 0, target = 0;
    bool measuredAvailable = false, targetAvailable = false;
    std::string owner, blocked;
    double holdUntil = 0;
};
struct BaseStatus {
    bool available = false, connected = false, stale = true, busy = false;
    bool positionAvailable = false;
    double head = 0, feet = 0;
};
struct ThermalStatus {
    std::array<double, 6> zones{};
    uint8_t available = 0;
    double ambient = 0, mcu = 0, humidity = 0;
    bool ambientAvailable = false, mcuAvailable = false, humidityAvailable = false;
    int64_t observedAt = 0, receivedAt = 0;
};
struct Alarm {
    int identifier = -1, side = 0;
    std::string day, time = "07:00", pattern = "rise";
    int intensity = 50, duration = 120, temperature = 80, wakeWindow = 0;
    bool enabled = false;
};
struct State {
    bool preview = false;
    bool controllerConfigured = false;
    bool wifi = false, connected = false, priming = false, lowWater = false;
    bool alarmsLoaded[2] = {false, false};
    int64_t receivedAt = 0, baseReceivedAt = 0;
    uint32_t revision = 0;
    std::array<SideStatus, 2> sides;
    BaseStatus base;
    ThermalStatus thermal;
    BedroomContext bedroom;
    std::vector<Alarm> alarms;
    std::string timezone = "Pod local time", message = "Connect USB to provision Wi-Fi and Pod";
};
enum class Action { temperature, power, resume, basePosition, baseStop, baseConnect, alarmSave, alarmDismiss, alarmSnooze, prime };
struct Command {
    Action action = Action::temperature;
    int side = 0, value = 0, feet = 0, speed = 50;
    bool enabled = false;
    int64_t createdAt = 0;
    Alarm alarm;
    Alarm originalAlarm;
};
struct Request { std::string path, method = "POST", body; };

bool parseConfiguration(const std::string &json, Configuration &configuration);
std::string serializeConfiguration(const Configuration &configuration);
std::string connectionSummary(const State &state);
std::string diagnostics(const State &state, int64_t now, int64_t epochSeconds);
bool parseDevice(const std::string &json, State &state, int64_t now);
bool parseThermal(const std::string &json, State &state, int64_t now);
bool thermalFresh(const State &state, int64_t now, int64_t epochSeconds);
bool parseBase(const std::string &json, State &state, int64_t now);
bool parseAlarms(const std::string &json, State &state, int side);
void parseSettings(const std::string &json, State &state);
bool buildRequest(const Command &command, Request &request);
bool maySend(const Command &command, const State &state, int64_t now);
const char *sideName(int side);
std::string temperatureText(double fahrenheit, bool celsius);
}
