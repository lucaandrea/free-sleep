#include "model.hpp"
#include "cJSON.h"
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <memory>

namespace bedside {
using Json = std::unique_ptr<cJSON, decltype(&cJSON_Delete)>;
static Json parse(const std::string &text) { return Json(cJSON_Parse(text.c_str()), cJSON_Delete); }
static const cJSON *field(const cJSON *object, const char *key) { return cJSON_GetObjectItemCaseSensitive(object, key); }
static bool boolean(const cJSON *object, const char *key) { return cJSON_IsTrue(field(object, key)); }
static std::string string(const cJSON *object, const char *key) {
    const auto *value = field(object, key);
    return cJSON_IsString(value) ? value->valuestring : "";
}
static double number(const cJSON *object, const char *key, double fallback = 0) {
    const auto *value = field(object, key);
    return cJSON_IsNumber(value) && std::isfinite(value->valuedouble) ? value->valuedouble : fallback;
}
const char *sideName(int side) { return side == 0 ? "left" : "right"; }

// Credentials are accepted only through USB and never printed or embedded in the image.
bool parseConfiguration(const std::string &json, Configuration &configuration) {
    auto document = parse(json);
    if (!cJSON_IsObject(document.get())) return false;
    Configuration candidate;
    candidate.ssid = string(document.get(), "ssid");
    candidate.password = string(document.get(), "password");
    candidate.endpoint = string(document.get(), "endpoint");
    candidate.token = string(document.get(), "token");
    candidate.allowLocalHttp = boolean(document.get(), "allowLocalHttp");
    candidate.celsius = boolean(document.get(), "celsius");
    while (!candidate.endpoint.empty() && candidate.endpoint.back() == '/') candidate.endpoint.pop_back();
    const bool secure = candidate.endpoint.rfind("https://", 0) == 0;
    const bool local = candidate.allowLocalHttp && candidate.endpoint.rfind("http://", 0) == 0;
    if ((!secure && !local) || candidate.endpoint.find_first_of("\r\n?#@ ") != std::string::npos
        || candidate.endpoint.size() > 240 || candidate.endpoint.size() < 9
        || candidate.ssid.empty() || candidate.ssid.size() > 32 || candidate.password.size() > 63
        || candidate.token.size() < 32 || candidate.token.size() > 512
        || candidate.token.find_first_of("\r\n") != std::string::npos) return false;
    const auto authority = candidate.endpoint.substr(secure ? 8 : 7);
    if (authority.empty() || authority.find('/') != std::string::npos) return false;
    if (local) {
        const auto host = authority.substr(0, authority.find(':'));
        int first = 0, second = 0, third = 0, fourth = 0;
        char trailing = 0;
        const bool ipv4 = std::sscanf(host.c_str(), "%d.%d.%d.%d%c", &first, &second, &third, &fourth, &trailing) == 4
            && first >= 0 && first <= 255 && second >= 0 && second <= 255 && third >= 0 && third <= 255 && fourth >= 0 && fourth <= 255;
        const bool privateAddress = ipv4 && (first == 10 || (first == 192 && second == 168) || (first == 172 && second >= 16 && second <= 31));
        const bool localName = host.size() > 6 && host.substr(host.size() - 6) == ".local";
        if (!privateAddress && !localName) return false;
    }
    configuration = candidate;
    return true;
}

bool parseDevice(const std::string &json, State &state, int64_t now) {
    auto document = parse(json);
    if (!cJSON_IsObject(document.get())) return false;
    const auto water = string(document.get(), "waterLevel");
    if ((water != "ok" && water != "low") || !cJSON_IsBool(field(document.get(), "isPriming"))) return false;
    std::array<SideStatus, 2> sides;
    for (int index = 0; index < 2; ++index) {
        const auto *source = field(document.get(), index == 0 ? "leftSide" : "rightSide");
        if (!cJSON_IsObject(source) || !cJSON_IsNumber(field(source, "heatingDuration"))) return false;
        auto &side = sides[index];
        side.valid = true;
        side.measuredAvailable = cJSON_IsNumber(field(source, "currentTemperature")) && std::isfinite(number(source, "currentTemperature", NAN));
        side.targetAvailable = cJSON_IsNumber(field(source, "targetTemperature")) && std::isfinite(number(source, "targetTemperature", NAN));
        side.measured = number(source, "currentTemperature");
        side.target = number(source, "targetTemperature");
        // A neutral temperature level can still be powered. Duration is authoritative.
        side.powered = number(source, "heatingDuration") > 0;
        side.vibrating = boolean(source, "isAlarmVibrating");
        const auto *control = field(field(document.get(), "temperatureControl"), sideName(index));
        side.owner = string(control, "source");
        side.blocked = string(control, "blocked");
        side.holdUntil = number(control, "holdUntil");
    }
    state.sides = sides;
    state.lowWater = string(document.get(), "waterLevel") == "low";
    state.priming = boolean(document.get(), "isPriming");
    state.connected = true;
    state.receivedAt = now;
    return true;
}

bool parseBase(const std::string &json, State &state, int64_t now) {
    auto document = parse(json);
    if (!cJSON_IsString(field(document.get(), "state")) || !cJSON_IsBool(field(document.get(), "stale"))) return false;
    BaseStatus base;
    base.available = string(document.get(), "state") != "unconfigured";
    base.connected = string(document.get(), "state") == "connected";
    base.stale = boolean(document.get(), "stale");
    base.busy = boolean(document.get(), "busy");
    const auto *position = field(field(document.get(), "position"), "left");
    base.positionAvailable = cJSON_IsNumber(field(position, "head")) && cJSON_IsNumber(field(position, "feet"))
        && std::isfinite(number(position, "head", NAN)) && std::isfinite(number(position, "feet", NAN));
    base.head = number(position, "head");
    base.feet = number(position, "feet");
    state.base = base;
    state.baseReceivedAt = now;
    return true;
}

// The REST timestamp is UTC ISO-8601. Receipt time alone cannot make an old sample fresh.
static int64_t utcSeconds(const std::string &timestamp) {
    int year=0,month=0,day=0,hour=0,minute=0,second=0,consumed=0;
    if (std::sscanf(timestamp.c_str(), "%d-%d-%dT%d:%d:%d%n", &year,&month,&day,&hour,&minute,&second,&consumed)!=6
        || year<2024 || year>2200 || month<1 || month>12 || hour<0 || hour>23 || minute<0 || minute>59 || second<0 || second>59) return 0;
    const bool leap=year%4==0 && (year%100!=0 || year%400==0);
    const int daysInMonth[]={31,leap?29:28,31,30,31,30,31,31,30,31,30,31};
    if(day<1 || day>daysInMonth[month-1]) return 0;
    size_t suffix=static_cast<size_t>(consumed);
    if(suffix<timestamp.size() && timestamp[suffix]=='.') {
        ++suffix; const auto start=suffix;
        while(suffix<timestamp.size() && timestamp[suffix]>='0' && timestamp[suffix]<='9') ++suffix;
        if(suffix==start) return 0;
    }
    if(timestamp.substr(suffix)!="Z") return 0;
    int64_t days=0;
    for(int previous=1970;previous<year;++previous) days+=previous%4==0 && (previous%100!=0 || previous%400==0)?366:365;
    for(int previous=1;previous<month;++previous) days+=daysInMonth[previous-1];
    return (days+day-1)*86400+hour*3600+minute*60+second;
}
bool parseThermal(const std::string &json, State &state, int64_t now) {
    auto document=parse(json);
    if(cJSON_IsNull(document.get())) { state.thermal={}; return true; }
    if(!cJSON_IsObject(document.get())) return false;
    ThermalStatus reading;
    reading.observedAt=utcSeconds(string(document.get(),"timestamp"));
    if(!reading.observedAt) return false;
    const char *keys[]={"leftOuterTemp","leftCenterTemp","leftInnerTemp","rightOuterTemp","rightCenterTemp","rightInnerTemp"};
    auto measurement=[&](const char *key,double &value,double minimum,double maximum) {
        const auto *item=field(document.get(),key);
        if(!cJSON_IsNumber(item) || !std::isfinite(item->valuedouble) || item->valuedouble<minimum || item->valuedouble>maximum) return false;
        value=item->valuedouble; return true;
    };
    for(int index=0;index<6;++index) if(measurement(keys[index],reading.zones[index],32,140)) reading.available|=1<<index;
    reading.ambientAvailable=measurement("ambientTemp",reading.ambient,-40,160);
    reading.mcuAvailable=measurement("mcuTemp",reading.mcu,-40,250);
    reading.humidityAvailable=measurement("humidity",reading.humidity,0,100);
    reading.receivedAt=now; state.thermal=reading; return true;
}
bool thermalFresh(const State &state,int64_t now,int64_t epochSeconds) {
    return !state.preview && state.connected && now>=state.thermal.receivedAt && now-state.thermal.receivedAt<=30000
        && state.thermal.observedAt>0 && epochSeconds>=state.thermal.observedAt && epochSeconds-state.thermal.observedAt<=30;
}

bool parseAlarms(const std::string &json, State &state, int side) {
    auto document = parse(json);
    const auto *alarms = field(document.get(), "alarm");
    if (!cJSON_IsArray(alarms) || cJSON_GetArraySize(alarms) > 100) return false;
    std::vector<Alarm> parsed;
    const cJSON *entry = nullptr;
    cJSON_ArrayForEach(entry, alarms) {
        if (!cJSON_IsNumber(field(entry, "id")) || string(entry, "side") != sideName(side)) return false;
        Alarm alarm;
        alarm.identifier = number(entry, "id", -1);
        alarm.side = side;
        alarm.day = string(entry, "dayOfWeek");
        alarm.time = string(entry, "time");
        alarm.pattern = string(entry, "vibrationPattern");
        alarm.intensity = number(entry, "vibrationIntensity", 50);
        alarm.duration = number(entry, "duration", 120);
        alarm.temperature = number(entry, "alarmTemperature", 80);
        alarm.wakeWindow = number(entry, "wakeWindow");
        alarm.enabled = boolean(entry, "enabled");
        parsed.push_back(alarm);
    }
    state.alarms.erase(std::remove_if(state.alarms.begin(), state.alarms.end(), [side](const Alarm &alarm) { return alarm.side == side; }), state.alarms.end());
    state.alarms.insert(state.alarms.end(), parsed.begin(), parsed.end());
    state.alarmsLoaded[side] = true;
    return true;
}
void parseSettings(const std::string &json, State &state) {
    auto document = parse(json);
    const auto timezone = string(field(document.get(), "device"), "timezone");
    if (!timezone.empty()) state.timezone = timezone;
}

static bool validTime(const std::string &value) {
    return value.size() == 5 && value[2] == ':' && value[0] >= '0' && value[0] <= '2'
        && value[1] >= '0' && value[1] <= '9' && value[3] >= '0' && value[3] <= '5'
        && value[4] >= '0' && value[4] <= '9' && (value[0] < '2' || value[1] <= '3');
}
bool buildRequest(const Command &command, Request &request) {
    if (command.side < 0 || command.side > 1) return false;
    request = {};
    Json document(cJSON_CreateObject(), cJSON_Delete);
    auto side = [&] { cJSON_AddStringToObject(document.get(), "side", sideName(command.side)); };
    switch (command.action) {
    case Action::temperature:
        if (command.value < minimumTemperature || command.value > maximumTemperature) return false;
        request.path = "/api/device/temperature"; side();
        cJSON_AddNumberToObject(document.get(), "temperature", command.value);
        cJSON_AddNumberToObject(document.get(), "holdMinutes", 360); break;
    case Action::power:
        request.path = "/api/device/power"; side(); cJSON_AddBoolToObject(document.get(), "powered", command.enabled); break;
    case Action::resume: request.path = "/api/device/temperature/resume"; side(); break;
    case Action::basePosition:
        if (command.value < 0 || command.value > maximumHead || command.feet < 0 || command.feet > maximumFeet || command.speed < 30 || command.speed > 100) return false;
        request.path = "/api/base/position";
        cJSON_AddNumberToObject(document.get(), "head", command.value);
        cJSON_AddNumberToObject(document.get(), "feet", command.feet);
        cJSON_AddNumberToObject(document.get(), "feedRate", command.speed);
        cJSON_AddItemToObject(document.get(), "sides", cJSON_CreateStringArray(std::array<const char *,2>{"left","right"}.data(), 2)); break;
    case Action::baseStop: request.path = "/api/base/stop"; break;
    case Action::baseConnect: request.path = "/api/base/reconnect"; break;
    case Action::alarmDismiss: request.path = "/api/device/alarm/clear"; side(); break;
    case Action::alarmSnooze:
        request.path = "/api/device/alarm/snooze"; side(); cJSON_AddNumberToObject(document.get(), "duration", 300); break;
    case Action::prime: request.path = "/api/device/prime"; break;
    case Action::alarmSave: {
        const auto &alarm = command.alarm;
        const std::array<int,5> wakeWindows = {0,10,15,20,30};
        const std::array<std::string, 7> days = {"sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"};
        if (!validTime(alarm.time) || std::find(days.begin(), days.end(), alarm.day) == days.end()
            || alarm.side != command.side || alarm.intensity < 1 || alarm.intensity > 100
            || std::find(wakeWindows.begin(),wakeWindows.end(),alarm.wakeWindow)==wakeWindows.end()
            || alarm.duration < 0 || alarm.duration > 180 || alarm.temperature < 55 || alarm.temperature > 110
            || (alarm.pattern != "rise" && alarm.pattern != "double")) return false;
        request.path = "/api/schedules/alarm";
        if (alarm.identifier >= 0) { request.method = "PATCH"; cJSON_AddNumberToObject(document.get(), "id", alarm.identifier); }
        else { side(); cJSON_AddStringToObject(document.get(), "dayOfWeek", alarm.day.c_str()); }
        cJSON_AddStringToObject(document.get(), "time", alarm.time.c_str());
        cJSON_AddBoolToObject(document.get(), "enabled", alarm.enabled);
        cJSON_AddNumberToObject(document.get(), "vibrationIntensity", alarm.intensity);
        cJSON_AddStringToObject(document.get(), "vibrationPattern", alarm.pattern.c_str());
        cJSON_AddNumberToObject(document.get(), "duration", alarm.duration);
        cJSON_AddNumberToObject(document.get(), "alarmTemperature", alarm.temperature);
        cJSON_AddNumberToObject(document.get(), "wakeWindow", alarm.wakeWindow);
        break;
    }
    }
    char *encoded = cJSON_PrintUnformatted(document.get());
    if (!encoded) return false;
    request.body = encoded;
    cJSON_free(encoded);
    return true;
}

// Commands expire on disconnect; Stop and alarm dismissal never depend on telemetry freshness.
bool maySend(const Command &command, const State &state, int64_t now) {
    if (state.preview) return false;
    if (command.side < 0 || command.side > 1) return false;
    if (!state.wifi || command.createdAt > now || now - command.createdAt > commandLifetimeMs) return false;
    if (command.action == Action::baseStop || command.action == Action::alarmDismiss) return true;
    if (!state.connected || now < state.receivedAt || now - state.receivedAt > statusLifetimeMs) return false;
    if (command.action == Action::basePosition)
        return state.base.connected && !state.base.stale && !state.base.busy && state.base.positionAvailable
            && now >= state.baseReceivedAt && now - state.baseReceivedAt <= 10000;
    if (command.action == Action::temperature || (command.action == Action::power && command.enabled))
        return !state.lowWater && !state.priming && state.sides[command.side].blocked != "safety";
    if (command.action == Action::alarmSnooze) return state.sides[command.side].vibrating;
    if (command.action == Action::alarmSave) return state.alarmsLoaded[command.side];
    return true;
}
std::string temperatureText(double fahrenheit, bool celsius) {
    char buffer[24];
    std::snprintf(buffer, sizeof(buffer), "%.0f°%s", celsius ? (fahrenheit - 32) * 5 / 9 : fahrenheit, celsius ? "C" : "F");
    return buffer;
}
}
