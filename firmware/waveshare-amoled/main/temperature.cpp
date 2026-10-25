#include "temperature.hpp"
#include <algorithm>
#include <cmath>

namespace bedside {
// Match Sleepypod's whole-Fahrenheit setpoints and JavaScript half-up rounding.
static int roundHalfUp(double value) { return static_cast<int>(std::floor(value + 0.5)); }
int eightSleepLevel(double fahrenheit) {
    return std::clamp(roundHalfUp((fahrenheit - 82.5) / 2.75), -10, 10);
}
int fahrenheitForLevel(int level) { return roundHalfUp(82.5 + std::clamp(level, -10, 10) * 2.75); }
int stepTemperature(int fahrenheit, int direction, bool celsius, TemperatureDisplay display) {
    if (display == TemperatureDisplay::eightSleep) return fahrenheitForLevel(eightSleepLevel(fahrenheit) + direction);
    return std::clamp(roundHalfUp(fahrenheit + direction * (celsius ? 1.8 : 1.0)), minimumTemperature, maximumTemperature);
}
std::string targetText(double fahrenheit, bool celsius, TemperatureDisplay display) {
    if (!std::isfinite(fahrenheit)) return "--";
    if (display == TemperatureDisplay::degrees) return temperatureText(fahrenheit, celsius);
    const int value = display == TemperatureDisplay::offset ? roundHalfUp(fahrenheit) - 80 : eightSleepLevel(fahrenheit);
    return (value > 0 ? "+" : "") + std::to_string(value);
}
const char *displayName(TemperatureDisplay display) {
    switch (display) {
    case TemperatureDisplay::offset: return "Offset";
    case TemperatureDisplay::eightSleep: return "Eight Sleep";
    default: return "Degrees";
    }
}
TemperatureActivity temperatureActivity(const SideStatus &side, bool fresh) {
    if (!fresh || !side.valid) return TemperatureActivity::unavailable;
    if (!side.powered) return TemperatureActivity::off;
    if (!side.targetAvailable || !side.measuredAvailable || !std::isfinite(side.target) || !std::isfinite(side.measured)) return TemperatureActivity::unavailable;
    const double difference = side.target - side.measured;
    return difference < -0.5 ? TemperatureActivity::cooling : difference > 0.5 ? TemperatureActivity::heating : TemperatureActivity::holding;
}
const char *activityName(TemperatureActivity activity) {
    switch (activity) {
    case TemperatureActivity::off: return "OFF";
    case TemperatureActivity::holding: return "HOLDING";
    case TemperatureActivity::cooling: return "COOLING";
    case TemperatureActivity::heating: return "HEATING";
    default: return "UNAVAILABLE";
    }
}
uint32_t mixColors(uint32_t first, uint32_t second, double progress) {
    progress = std::clamp(progress, 0.0, 1.0);
    uint32_t color = 0;
    for (int shift : {16, 8, 0}) color |= static_cast<uint32_t>(std::lround(((first >> shift) & 255) * (1-progress) + ((second >> shift) & 255) * progress)) << shift;
    return color;
}
uint32_t activityColor(const SideStatus &side, bool fresh) {
    const auto activity = temperatureActivity(side, fresh);
    // A larger reported gap to target is more saturated; missing/off data never looks active.
    const double strength = std::clamp((std::abs(side.target - side.measured) - 0.5) / 11.5, 0.0, 1.0);
    if (activity == TemperatureActivity::cooling) return mixColors(0x9fcff4, 0x2371ec, strength);
    if (activity == TemperatureActivity::heating) return mixColors(0xf3b0af, 0xe43d4c, strength);
    return activity == TemperatureActivity::holding ? 0xa8aaae : 0x62656a;
}
}
