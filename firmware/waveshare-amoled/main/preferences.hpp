#pragma once
#include "temperature.hpp"

namespace bedside {
struct DisplayPreferences {
    TemperatureDisplay display = TemperatureDisplay::degrees;
    bool celsius = false;
    bool mattressView = false;
};
DisplayPreferences loadDisplayPreferences(bool defaultCelsius);
bool saveDisplayPreferences(const DisplayPreferences &preferences);
}
