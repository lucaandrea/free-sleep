#include "model.hpp"
#include "cJSON.h"
#include <algorithm>
#include <cmath>
#include <memory>

namespace bedside {
namespace {
using Json = std::unique_ptr<cJSON, decltype(&cJSON_Delete)>;
Json parse(const std::string &text) {
    return Json(cJSON_ParseWithLengthOpts(text.c_str(), text.size() + 1, nullptr, true), cJSON_Delete);
}
const cJSON *field(const cJSON *object, const char *key) { return cJSON_GetObjectItemCaseSensitive(object, key); }
std::string text(const cJSON *object, const char *key) {
    const auto *value = field(object, key);
    return cJSON_IsString(value) && value->valuestring ? value->valuestring : "";
}
bool integer(const cJSON *value, int64_t &result, int64_t minimum = 1) {
    if (!cJSON_IsNumber(value) || !std::isfinite(value->valuedouble) || value->valuedouble < minimum
        || value->valuedouble > 9007199254740991.0 || std::floor(value->valuedouble) != value->valuedouble) return false;
    result = static_cast<int64_t>(value->valuedouble); return true;
}
bool identifier(const std::string &value) {
    if (value.size() != 36) return false;
    for (size_t index = 0; index < value.size(); ++index) {
        if (index == 8 || index == 13 || index == 18 || index == 23) { if (value[index] != '-') return false; }
        else if (!((value[index] >= '0' && value[index] <= '9') || (value[index] >= 'a' && value[index] <= 'f'))) return false;
    }
    return true;
}
bool scopeFrom(const cJSON *object, PersonalScope &scope) {
    scope.podId = text(object, "podId"); scope.householdId = text(object, "householdId");
    scope.sleeperId = text(object, "sleeperId"); scope.configurationRevision = text(object, "configurationRevision");
    return identifier(scope.podId) && identifier(scope.householdId) && identifier(scope.sleeperId)
        && integer(field(object, "sessionRevision"), scope.sessionRevision)
        && integer(field(object, "assignmentRevision"), scope.assignmentRevision)
        && scope.configurationRevision.size() == 64
        && scope.configurationRevision.find_first_not_of("0123456789abcdef") == std::string::npos;
}
bool scopeMatchesIdentity(const PersonalScope &scope, const Configuration &configuration) {
    return scope.podId == configuration.identity.podId && scope.householdId == configuration.identity.householdId
        && scope.sleeperId == configuration.identity.sleeperId;
}
int sideIndex(const std::string &side) { return side == "left" ? 0 : side == "right" ? 1 : -1; }
bool zonesFrom(const cJSON *array, uint8_t &mask) {
    if (!cJSON_IsArray(array) || cJSON_GetArraySize(array) > 2) return false;
    mask = 0;
    const cJSON *entry = nullptr;
    cJSON_ArrayForEach(entry, array) {
        if (!cJSON_IsString(entry)) return false;
        const int side = sideIndex(entry->valuestring);
        if (side < 0 || (mask & (1 << side))) return false;
        mask |= 1 << side;
    }
    return true;
}
bool optionalTemperature(const cJSON *object, const char *key, double &result, bool &available) {
    const auto *value = field(object, key);
    available = cJSON_IsNumber(value) && std::isfinite(value->valuedouble)
        && value->valuedouble >= 32 && value->valuedouble <= 140;
    if (available) result = value->valuedouble;
    return available || cJSON_IsNull(value);
}
uint8_t actionZones(const Command &command, const State &state) {
    if (command.action == Action::temperature) return state.personal.temperatureZones;
    if (command.action == Action::power) return state.personal.powerZones;
    if (command.action == Action::alarmDismiss) return state.personal.vibrationZones;
    return 0;
}
void encodeScope(cJSON *document, const PersonalScope &scope) {
    auto *value = cJSON_AddObjectToObject(document, "scope");
    cJSON_AddStringToObject(value, "podId", scope.podId.c_str());
    cJSON_AddStringToObject(value, "householdId", scope.householdId.c_str());
    cJSON_AddStringToObject(value, "sleeperId", scope.sleeperId.c_str());
    cJSON_AddStringToObject(value, "configurationRevision", scope.configurationRevision.c_str());
    cJSON_AddNumberToObject(value, "sessionRevision", static_cast<double>(scope.sessionRevision));
    cJSON_AddNumberToObject(value, "assignmentRevision", static_cast<double>(scope.assignmentRevision));
}
}

bool validPersonalIdentity(const PersonalIdentity &identity) {
    return identifier(identity.podId) && identifier(identity.householdId)
        && identifier(identity.accountId) && identifier(identity.sleeperId);
}
bool samePersonalScope(const PersonalScope &first, const PersonalScope &second) {
    return first.podId == second.podId && first.householdId == second.householdId && first.sleeperId == second.sleeperId
        && first.sessionRevision == second.sessionRevision && first.assignmentRevision == second.assignmentRevision
        && first.configurationRevision == second.configurationRevision;
}

// The provisioned account and installation are immutable; a server response cannot switch them.
bool parsePersonalSession(const std::string &json, const Configuration &configuration, State &state, int64_t now) {
    auto document = parse(json);
    const auto *source = document.get();
    if (!configuration.personal || !validPersonalIdentity(configuration.identity)
        || !cJSON_IsNumber(field(source, "apiVersion")) || field(source, "apiVersion")->valuedouble != 1
        || text(source, "podId") != configuration.identity.podId
        || text(source, "householdId") != configuration.identity.householdId
        || text(source, "accountId") != configuration.identity.accountId
        || text(source, "selfSleeperId") != configuration.identity.sleeperId
        || text(source, "membership") != "active") return false;
    auto personal = state.personal;
    if (!integer(field(source, "sessionRevision"), personal.scope.sessionRevision)
        || !integer(field(source, "assignmentRevision"), personal.scope.assignmentRevision)) return false;
    const auto *self = field(source, "self");
    personal.name = text(self, "displayName"); personal.assignment = text(self, "assignment");
    if (personal.name.empty() || personal.name.size() > 320 || personal.name.find_first_of("\r\n") != std::string::npos
        || (personal.assignment != "solo" && personal.assignment != "left" && personal.assignment != "right"
            && personal.assignment != "unassigned")) return false;
    personal.scope.podId = configuration.identity.podId;
    personal.scope.householdId = configuration.identity.householdId;
    personal.scope.sleeperId = configuration.identity.sleeperId;
    personal.controlsAllowed = cJSON_IsTrue(field(field(source, "capabilities"), "personalControls"));
    if (!samePersonalScope(personal.scope, state.personal.scope)) {
        personal.wake = "Next wake unavailable"; personal.wakeReceivedAt = -1;
    }
    personal.authenticated = true; personal.ready = false; personal.sessionReceivedAt = now;
    state.personal = personal; state.personalMode = true;
    return true;
}

// Only the authenticated person's zones are displayed. Old or future sensor clocks never become live readings.
bool parsePersonalBed(const std::string &json, const Configuration &configuration, State &state,
                      int64_t now, int64_t epochMs) {
    auto document = parse(json);
    const auto *source = document.get();
    PersonalScope scope;
    if (!state.personal.authenticated || !scopeFrom(field(source, "scope"), scope)
        || !scopeMatchesIdentity(scope, configuration)
        || scope.sessionRevision != state.personal.scope.sessionRevision
        || scope.assignmentRevision != state.personal.scope.assignmentRevision
        || text(source, "physicalVerification") != "unverified"
        || !cJSON_IsNumber(field(source, "version")) || field(source, "version")->valuedouble != 1) return false;
    const auto availability = text(source, "availability");
    if (availability != "ready" && availability != "unassigned" && availability != "configuration_changed"
        && availability != "runtime_disabled") return false;
    auto personal = state.personal;
    if (!samePersonalScope(personal.scope, scope)) {
        personal.wake = "Next wake unavailable"; personal.wakeReceivedAt = -1;
    }
    personal.scope = scope; personal.ready = availability == "ready";
    const auto *routing = field(source, "routing");
    if (!zonesFrom(field(routing, "temperature"), personal.temperatureZones)
        || !zonesFrom(field(routing, "power"), personal.powerZones)
        || !zonesFrom(field(routing, "vibrationCancellation"), personal.vibrationZones)) return false;
    personal.routineSide = sideIndex(text(routing, "routines"));
    uint8_t allowed = state.personal.assignment == "solo" ? 3 : state.personal.assignment == "left" ? 1
        : state.personal.assignment == "right" ? 2 : 0;
    if ((personal.temperatureZones | personal.powerZones | personal.vibrationZones) & ~allowed) return false;
    if (personal.routineSide >= 0 && !(allowed & (1 << personal.routineSide))) return false;
    const auto *observation = field(source, "observation");
    const auto observationState = text(observation, "state");
    if ((observationState != "fresh" && observationState != "unavailable")
        || (!cJSON_IsBool(field(observation, "priming")) && !cJSON_IsNull(field(observation, "priming")))) return false;
    const auto water = text(observation, "water");
    if (water != "ok" && water != "low" && water != "unknown") return false;
    personal.observationAt = 0;
    if (!integer(field(observation, "observedAt"), personal.observationAt)
        && !cJSON_IsNull(field(observation, "observedAt"))) return false;
    personal.observationFresh = observationState == "fresh" && personal.observationAt > 0
        && epochMs >= personal.observationAt && epochMs - personal.observationAt <= statusLifetimeMs;
    personal.observationExpiresAt = personal.observationFresh ? now + statusLifetimeMs - (epochMs - personal.observationAt) : 0;
    const auto *zones = field(source, "zones");
    if (!cJSON_IsArray(zones) || cJSON_GetArraySize(zones) > 2) return false;
    std::array<SideStatus, 2> readings{};
    uint8_t seen = 0;
    const cJSON *zone = nullptr;
    cJSON_ArrayForEach(zone, zones) {
        const int index = sideIndex(text(zone, "side"));
        if (index < 0 || !(allowed & (1 << index)) || (seen & (1 << index))) return false;
        seen |= 1 << index;
        auto &reading = readings[index]; reading.valid = true;
        if (!optionalTemperature(zone, "measuredTemperatureF", reading.measured, reading.measuredAvailable)
            || !optionalTemperature(zone, "reportedTargetF", reading.target, reading.targetAvailable)) return false;
        const auto *powered = field(zone, "reportedPowered");
        if (!cJSON_IsBool(powered) && !cJSON_IsNull(powered)) return false;
        reading.powered = cJSON_IsTrue(powered);
        if (!personal.observationFresh) reading.measuredAvailable = reading.targetAvailable = reading.powered = false;
    }
    if (personal.ready && ((personal.temperatureZones | personal.powerZones | personal.vibrationZones) & ~seen)) return false;
    state.personal = personal; state.sides = readings; state.connected = true; state.receivedAt = now;
    state.lowWater = water != "ok"; state.priming = !cJSON_IsFalse(field(observation, "priming"));
    state.base = {}; state.thermal = {}; state.bedroom = {}; state.alarms.clear();
    state.alarmsLoaded[0] = state.alarmsLoaded[1] = false;
    return true;
}

bool parsePersonalWake(const std::string &json, State &state, int64_t now, int64_t epochMs) {
    auto document = parse(json);
    const auto *source = document.get();
    PersonalScope scope; int64_t observedAt = 0;
    if (state.personal.routineSide < 0 || !cJSON_IsNumber(field(source, "version")) || field(source, "version")->valuedouble != 1
        || !scopeFrom(field(source, "scope"), scope) || !samePersonalScope(scope, state.personal.scope)
        || !integer(field(source, "observedAt"), observedAt) || observedAt > epochMs
        || epochMs - observedAt > statusLifetimeMs || text(source, "effect") != "read_only"
        || sideIndex(text(source, "sourceSide")) != state.personal.routineSide) return false;
    const auto *plan = field(source, "plan");
    if (!cJSON_IsFalse(field(plan, "canChange")) || text(plan, "acknowledgment") != "accepted_not_physically_verified"
        || sideIndex(text(plan, "side")) != state.personal.routineSide || text(plan, "timeZone").empty()
        || text(plan, "timeZone").size() > 100) return false;
    std::string summary;
    const auto status = text(plan, "state");
    if (status == "scheduled") {
        const auto *alarm = field(plan, "alarm");
        const auto time = text(alarm, "time"), alarmAt = text(alarm, "at");
        if (time.size() != 5 || time[2] != ':' || time[0] < '0' || time[0] > '2'
            || time[1] < '0' || time[1] > '9' || (time[0] == '2' && time[1] > '3')
            || time[3] < '0' || time[3] > '5' || time[4] < '0' || time[4] > '9'
            || alarmAt.size() < 20 || alarmAt[4] != '-' || alarmAt[7] != '-') return false;
        // Preserve the server's local clock and time zone; never label an arbitrary occurrence "tomorrow".
        summary = "Next wake " + time + "\n" + text(plan, "timeZone");
    } else if (status == "none") summary = "No upcoming wake alarm";
    else if (status == "away") summary = "Wake plan paused / away";
    else if (status == "skipped") summary = "Next wake skipped";
    else return false;
    state.personal.wake = summary; state.personal.wakeReceivedAt = now;
    return true;
}

bool maySendPersonal(const Command &command, const State &state, int64_t now) {
    if (!state.personalMode || !command.personal || !state.personal.authenticated || !state.personal.ready || !state.personal.controlsAllowed
        || !samePersonalScope(command.scope, state.personal.scope)
        || now < state.personal.sessionReceivedAt || now - state.personal.sessionReceivedAt > statusLifetimeMs
        || !command.resolvedZones || command.resolvedZones != actionZones(command, state)) return false;
    if (command.action == Action::alarmDismiss || (command.action == Action::power && !command.enabled)) return true;
    if (!state.personal.observationFresh || now > state.personal.observationExpiresAt || state.lowWater || state.priming || !state.connected
        || now < state.receivedAt || now - state.receivedAt > statusLifetimeMs) return false;
    return command.action == Action::temperature || command.action == Action::power;
}

bool buildPersonalRequest(const Command &command, const State &state, int64_t now, int64_t epochMs,
                          const std::string &requestId, Request &request) {
    if (!maySend(command, state, now) || now - command.createdAt >= commandLifetimeMs
        || !identifier(requestId) || epochMs < 1704067200000LL || epochMs > 8640000000000000LL - commandLifetimeMs
        || (command.action == Action::temperature && (command.value < minimumTemperature || command.value > maximumTemperature))) return false;
    Json document(cJSON_CreateObject(), cJSON_Delete);
    cJSON_AddNumberToObject(document.get(), "version", 1);
    cJSON_AddStringToObject(document.get(), "requestId", requestId.c_str());
    cJSON_AddNumberToObject(document.get(), "issuedAt", static_cast<double>(epochMs));
    cJSON_AddNumberToObject(document.get(), "expiresAt", static_cast<double>(epochMs + commandLifetimeMs - (now - command.createdAt)));
    encodeScope(document.get(), command.scope);
    auto *action = cJSON_AddObjectToObject(document.get(), "action");
    if (command.action == Action::temperature) {
        cJSON_AddStringToObject(action, "kind", "temperature");
        cJSON_AddNumberToObject(action, "temperatureF", command.value);
        cJSON_AddNumberToObject(action, "holdMinutes", 30);
    } else if (command.action == Action::power) {
        cJSON_AddStringToObject(action, "kind", "power"); cJSON_AddBoolToObject(action, "powered", command.enabled);
    } else cJSON_AddStringToObject(action, "kind", "vibration.clear");
    char *encoded = cJSON_PrintUnformatted(document.get());
    if (!encoded) return false;
    request = {"/api/v1/me/controls", "POST", encoded}; cJSON_free(encoded); return true;
}

// A network success is insufficient: the receipt must acknowledge this exact person's action.
bool personalReceiptAcknowledged(const std::string &json, const Request &request, uint8_t expectedZones) {
    auto receipt = parse(json), sent = parse(request.body);
    const auto *response = receipt.get(), *original = sent.get();
    uint8_t resolvedZones = 0;
    return cJSON_IsObject(response) && cJSON_IsObject(original) && expectedZones
        && zonesFrom(field(response, "resolvedZones"), resolvedZones) && resolvedZones == expectedZones
        && cJSON_IsNumber(field(response, "version")) && field(response, "version")->valuedouble == 1
        && text(response, "state") == "acknowledged" && text(response, "physicalVerification") == "unverified"
        && cJSON_IsFalse(field(response, "replayAllowed"))
        && text(response, "requestId") == text(original, "requestId")
        && cJSON_Compare(field(response, "scope"), field(original, "scope"), true)
        && cJSON_Compare(field(response, "action"), field(original, "action"), true);
}
}
