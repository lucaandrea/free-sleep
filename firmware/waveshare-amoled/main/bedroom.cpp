#include "bedroom.hpp"
#include "model.hpp"
#include "cJSON.h"
#include <cmath>
#include <cstdio>
#include <memory>
#include <set>

namespace bedside {
static const cJSON *field(const cJSON *object, const char *key) { return cJSON_GetObjectItemCaseSensitive(object, key); }
static std::string text(const cJSON *object, const char *key) {
    const auto *value = field(object, key);
    return cJSON_IsString(value) ? value->valuestring : "";
}
static bool clock(const cJSON *value, double &result) {
    if (!cJSON_IsNumber(value) || !std::isfinite(value->valuedouble) || value->valuedouble < 1
        || value->valuedouble > 8000000000000.0 || std::floor(value->valuedouble) != value->valuedouble) return false;
    result = value->valuedouble; return true;
}
static bool validReading(const std::string &metric, double value) {
    if (!std::isfinite(value)) return false;
    if (metric == "temperature") return value >= -40 && value <= 140;
    if (metric == "humidity" || metric == "fanSpeed" || metric == "filterLife") return value >= 0 && value <= 100;
    if (metric == "pm25") return value >= 0 && value <= 2000;
    if (metric == "co2") return value >= 0 && value <= 10000;
    if (metric == "airQuality") return value >= 1 && value <= 5 && value == std::floor(value);
    if (metric == "power") return value == 0 || value == 1;
    return false;
}
static std::string canonicalUnit(const std::string &metric) {
    if (metric == "temperature") return "°F";
    if (metric == "pm25") return "µg/m³";
    if (metric == "co2") return "ppm";
    if (metric == "power") return "on/off";
    if (metric == "airQuality") return "category";
    return "%";
}

// Receipts use monotonic time. A controller/remote wall-clock difference cannot extend a sensor lease.
bool parseBedroom(const std::string &json, BedroomContext &context, int64_t now) {
    if (json.size() > 65536 || now < 0) return false;
    std::unique_ptr<cJSON, decltype(&cJSON_Delete)> document(cJSON_ParseWithLengthOpts(json.c_str(), json.size() + 1, nullptr, true), cJSON_Delete);
    const auto *root = document.get(), *config = field(root, "config"), *rows = field(root, "observations");
    double generated = 0;
    const auto *version = field(root, "apiVersion");
    if (!cJSON_IsObject(root) || !cJSON_IsNumber(version) || version->valuedouble != 1
        || !clock(field(root, "generatedAt"), generated) || !cJSON_IsObject(config)
        || !cJSON_IsBool(field(config, "enabled")) || !cJSON_IsArray(rows) || cJSON_GetArraySize(rows) > 40) return false;
    BedroomContext candidate;
    candidate.loaded = true; candidate.receivedAt = now;
    candidate.enabled = cJSON_IsTrue(field(config, "enabled")); candidate.name = text(config, "roomName");
    if (candidate.name.empty() || candidate.name.size() > 240) return false;
    std::set<std::string> identifiers;
    for (const auto *row = rows->child; row; row = row->next) {
        const auto *source = field(row, "source");
        BedroomReading reading;
        reading.id = text(source, "id"); reading.device = text(source, "deviceName"); reading.label = text(source, "label");
        reading.metric = text(source, "metric"); reading.status = text(row, "status");
        const auto *sourceEnabled = field(source, "enabled"), *age = field(source, "maxAgeSeconds"), *value = field(row, "value");
        const std::set<std::string> states = {"disabled", "waiting", "unavailable", "stale", "cached", "fresh"};
        const std::set<std::string> metrics = {"temperature", "humidity", "pm25", "co2", "airQuality", "power", "fanSpeed", "filterLife"};
        if (reading.id.empty() || reading.id.size() > 120 || !identifiers.insert(reading.id).second
            || reading.device.empty() || reading.device.size() > 320 || reading.label.empty() || reading.label.size() > 320
            || !states.count(reading.status) || !metrics.count(reading.metric) || !cJSON_IsBool(sourceEnabled) || !cJSON_IsNumber(age)
            || age->valuedouble < 30 || age->valuedouble > 900 || std::floor(age->valuedouble) != age->valuedouble
            || text(row, "unit") != canonicalUnit(reading.metric)) return false;
        if (reading.status == "fresh") {
            double expires = 0, observed = 0, measured = 0;
            const auto basis = text(row, "timeBasis");
            if (!candidate.enabled || !cJSON_IsTrue(sourceEnabled) || !cJSON_IsNumber(value)
                || !validReading(reading.metric, value->valuedouble) || !clock(field(row, "expiresAt"), expires)
                || expires <= generated || expires - generated > age->valuedouble * 1000
                || !clock(field(row, "observedAt"), observed) || observed > generated
                || (basis != "measurement" && basis != "device_read" && basis != "integration_report")
                || (basis == "measurement" && (!clock(field(row, "measuredAt"), measured) || measured > observed))) return false;
            const double reference = basis == "measurement" ? measured : observed;
            if (expires > reference + age->valuedouble * 1000) return false;
            reading.available = true; reading.value = value->valuedouble;
            reading.remainingMs = static_cast<int64_t>(expires - generated);
        }
        candidate.readings.push_back(reading);
    }
    context = std::move(candidate); return true;
}

bool bedroomFresh(const BedroomContext &context, int64_t now) {
    return context.loaded && context.enabled && now >= context.receivedAt && now - context.receivedAt < statusLifetimeMs;
}
std::string bedroomValue(const BedroomReading &reading, const BedroomContext &context, int64_t now, bool celsius) {
    if (!bedroomFresh(context, now) || !reading.available || now - context.receivedAt >= reading.remainingMs) return "--";
    if (reading.metric == "temperature") return temperatureText(reading.value, celsius);
    if (reading.metric == "power") return reading.value == 1 ? "On" : "Off";
    if (reading.metric == "airQuality") {
        const char *categories[] = {"Unknown", "Excellent", "Good", "Fair", "Inferior", "Poor"};
        return categories[static_cast<int>(reading.value)];
    }
    char value[32]; std::snprintf(value, sizeof(value), "%.0f", reading.value);
    return std::string(value) + (reading.metric == "pm25" ? " ug/m3" : reading.metric == "co2" ? " ppm" : "%");
}
}
