#pragma once
#include "model.hpp"

namespace bedside {
enum class TemperatureDisplay : uint8_t { degrees, offset, eightSleep };
enum class TemperatureActivity { unavailable, off, holding, cooling, heating };
int eightSleepLevel(double fahrenheit);
int fahrenheitForLevel(int level);
int stepTemperature(int fahrenheit, int direction, bool celsius, TemperatureDisplay display);
std::string targetText(double fahrenheit, bool celsius, TemperatureDisplay display);
const char *displayName(TemperatureDisplay display);
TemperatureActivity temperatureActivity(const SideStatus &side, bool fresh);
const char *activityName(TemperatureActivity activity);
uint32_t activityColor(const SideStatus &side, bool fresh);
uint32_t mixColors(uint32_t first, uint32_t second, double progress);
}
