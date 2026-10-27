#pragma once
#include <cstdint>
#include <string>
#include <vector>

namespace bedside {
struct BedroomReading {
    std::string id, device, label, metric, status;
    double value = 0;
    bool available = false;
    int64_t remainingMs = 0;
};
struct BedroomContext {
    bool loaded = false, enabled = false;
    int64_t receivedAt = 0;
    std::string name = "Bedroom";
    std::vector<BedroomReading> readings;
};
bool parseBedroom(const std::string &json, BedroomContext &context, int64_t now);
bool bedroomFresh(const BedroomContext &context, int64_t now);
std::string bedroomValue(const BedroomReading &reading, const BedroomContext &context, int64_t now, bool celsius);
}
