#include "model.hpp"
#include "cJSON.h"
#include <cassert>
#include <fstream>
#include <iostream>
#include <iterator>
#include <memory>
using namespace bedside;
using Json = std::unique_ptr<cJSON, decltype(&cJSON_Delete)>;

static std::string encode(const cJSON *value) {
    char *bytes = cJSON_PrintUnformatted(value); assert(bytes);
    std::string result(bytes); cJSON_free(bytes); return result;
}
static Json fixture(const char *name) {
    std::ifstream input(std::string(PERSONAL_FIXTURE_DIRECTORY) + "/" + name);
    std::string data((std::istreambuf_iterator<char>(input)), std::istreambuf_iterator<char>());
    Json result(cJSON_Parse(data.c_str()), cJSON_Delete); assert(result); return result;
}
static void setText(cJSON *object, const char *key, const char *value) {
    cJSON_ReplaceItemInObjectCaseSensitive(object, key, cJSON_CreateString(value));
}
int main() {
    const std::string pod = "00000000-0000-4000-8000-000000000001";
    const std::string household = "00000000-0000-4000-8000-000000000002";
    const std::string sleeper = "00000000-0000-4000-8000-000000000003";
    const std::string account = "00000000-0000-4000-8000-000000000005";
    Configuration configuration;
    configuration.ssid = "Home"; configuration.endpoint = "https://pod.example";
    configuration.token = std::string(43, 'a'); configuration.personal = true;
    configuration.identity = {pod, household, account, sleeper};
    Configuration restored;
    assert(parseConfiguration(serializeConfiguration(configuration), restored));
    assert(restored.personal && restored.identity.sleeperId == sleeper);
    restored.identity.sleeperId = "bad";
    assert(!parseConfiguration(serializeConfiguration(restored), restored));
    restored = configuration; restored.token += "!";
    assert(!parseConfiguration(serializeConfiguration(restored), restored));
    State state; state.controllerConfigured = true; state.wifi = true;
    std::string session = "{\"apiVersion\":1,\"podId\":\"" + pod + "\",\"householdId\":\"" + household
        + "\",\"accountId\":\"" + account + "\",\"selfSleeperId\":\"" + sleeper
        + "\",\"membership\":\"active\",\"sessionRevision\":1,\"assignmentRevision\":1,"
          "\"self\":{\"displayName\":\"Luca\",\"assignment\":\"solo\"},\"capabilities\":{\"personalControls\":true}}";
    assert(parsePersonalSession(session, configuration, state, 10000));
    auto wakeFixture = fixture("personal-next-wake-v1.json");
    auto *bed = cJSON_GetObjectItemCaseSensitive(wakeFixture.get(), "bed");
    auto *wake = cJSON_GetObjectItemCaseSensitive(wakeFixture.get(), "wake");
    constexpr int64_t epoch = 1793278800000LL;
    assert(parsePersonalBed(encode(bed), configuration, state, 10000, epoch));
    assert(state.personal.ready && state.personal.temperatureZones == 3 && state.personal.vibrationZones == 3);
    assert(state.sides[0].measured == 69 && state.sides[1].measured == 81);
    assert(parsePersonalWake(encode(wake), state, 10000, epoch));
    assert(state.personal.wake.find("07:00") != std::string::npos);
    assert(!parsePersonalWake(encode(wake), state, 10000, epoch - 1));
    assert(!parsePersonalWake(encode(wake), state, 10000, epoch + statusLifetimeMs + 1));
    Command temperature; temperature.personal = true; temperature.scope = state.personal.scope;
    temperature.resolvedZones = 3; temperature.value = 70; temperature.createdAt = 10000;
    Request request;
    assert(maySend(temperature, state, 10001));
    assert(!buildRequest(temperature, request)); // Personal taps cannot enter the owner API.
    assert(buildPersonalRequest(temperature, state, 10001, epoch, account, request));
    assert(request.path == "/api/v1/me/controls");
    Json sent(cJSON_Parse(request.body.c_str()), cJSON_Delete);
    auto *action = cJSON_GetObjectItemCaseSensitive(sent.get(), "action");
    assert(!cJSON_GetObjectItemCaseSensitive(action, "side"));
    assert(cJSON_GetObjectItemCaseSensitive(action, "holdMinutes")->valueint == 30);
    assert(cJSON_GetObjectItemCaseSensitive(sent.get(), "expiresAt")->valuedouble == epoch + 4999);
    assert(!buildPersonalRequest(temperature, state, 15000, epoch, account, request));
    assert(!buildPersonalRequest(temperature, state, 10001, 0, account, request));
    assert(!maySend(temperature, state, 9999));
    assert(!maySend(temperature, state, 15001));
    auto previous = state;
    state.personal.scope.assignmentRevision++; assert(!maySend(temperature, state, 10001)); state = previous;
    state.personal.scope.configurationRevision[0] = 'b'; assert(!maySend(temperature, state, 10001)); state = previous;
    state.personal.temperatureZones = 1; assert(!maySend(temperature, state, 10001)); state = previous;
    state.personal.authenticated = false; assert(!maySend(temperature, state, 10001)); state = previous;
    state.personal.controlsAllowed = false; assert(!maySend(temperature, state, 10001)); state = previous;
    state.lowWater = true; assert(!maySend(temperature, state, 10001)); state = previous;
    state.priming = true; assert(!maySend(temperature, state, 10001)); state = previous;
    state.wifi = false; assert(!maySend(temperature, state, 10001)); state = previous;
    for (auto forbidden : {Action::baseStop, Action::basePosition, Action::alarmSave, Action::prime, Action::resume, Action::alarmSnooze}) {
        auto command = temperature; command.action = forbidden;
        assert(!maySend(command, state, 10001));
    }
    Command stop = temperature; stop.action = Action::power; stop.enabled = false;
    state.lowWater = true; state.priming = true; state.personal.observationFresh = false;
    assert(maySend(stop, state, 10001));
    stop.action = Action::alarmDismiss; assert(maySend(stop, state, 10001));
    state = previous;
    assert(parsePersonalBed(encode(bed), configuration, state, 10000, epoch + 14000));
    temperature.createdAt = 11001;
    assert(!maySend(temperature, state, 11001)); // Receipt freshness cannot extend the original sensor clock.
    assert(parsePersonalBed(encode(bed), configuration, state, 10000, epoch - 1));
    assert(!state.personal.observationFresh && !state.sides[0].measuredAvailable);
    state = previous; temperature.createdAt = 10000;
    assert(!parsePersonalBed(encode(bed) + "junk", configuration, state, 10000, epoch));
    assert(!parsePersonalSession("{}", configuration, state, 10000));
    auto otherConfiguration = configuration; otherConfiguration.identity.accountId = pod;
    assert(!parsePersonalSession(session, otherConfiguration, state, 10000));
    Json changed(cJSON_Duplicate(bed, true), cJSON_Delete);
    setText(cJSON_GetObjectItemCaseSensitive(changed.get(), "scope"), "sleeperId", account.c_str());
    assert(!parsePersonalBed(encode(changed.get()), configuration, state, 10000, epoch));
    changed.reset(cJSON_Duplicate(bed, true));
    auto *zones = cJSON_GetObjectItemCaseSensitive(changed.get(), "zones");
    setText(cJSON_GetArrayItem(zones, 1), "side", "left");
    assert(!parsePersonalBed(encode(changed.get()), configuration, state, 10000, epoch));
    state.personal.assignment = "left";
    assert(!parsePersonalBed(encode(bed), configuration, state, 10000, epoch)); // No partner readings admitted.
    state = previous;
    assert(buildPersonalRequest(temperature, state, 10001, epoch, account, request));
    Json receipt(cJSON_Parse(request.body.c_str()), cJSON_Delete);
    cJSON_AddStringToObject(receipt.get(), "state", "acknowledged");
    cJSON_AddStringToObject(receipt.get(), "physicalVerification", "unverified");
    cJSON_AddBoolToObject(receipt.get(), "replayAllowed", false);
    const char *both[] = {"left", "right"};
    cJSON_AddItemToObject(receipt.get(), "resolvedZones", cJSON_CreateStringArray(both, 2));
    assert(personalReceiptAcknowledged(encode(receipt.get()), request, 3));
    assert(!personalReceiptAcknowledged(encode(receipt.get()), request, 1));
    setText(receipt.get(), "state", "unknown");
    assert(!personalReceiptAcknowledged(encode(receipt.get()), request, 3));
    setText(receipt.get(), "state", "acknowledged");
    setText(receipt.get(), "requestId", pod.c_str());
    assert(!personalReceiptAcknowledged(encode(receipt.get()), request, 3));
    auto contract = fixture("personal-controls-v1.json");
    auto *assigned = cJSON_GetObjectItemCaseSensitive(contract.get(), "assignedBed");
    auto *assignedScope = cJSON_GetObjectItemCaseSensitive(assigned, "scope");
    const std::string member = cJSON_GetObjectItemCaseSensitive(assignedScope, "sleeperId")->valuestring;
    auto memberConfiguration = configuration; memberConfiguration.identity.sleeperId = member;
    Json memberSession(cJSON_Parse(session.c_str()), cJSON_Delete);
    setText(memberSession.get(), "selfSleeperId", member.c_str());
    setText(cJSON_GetObjectItemCaseSensitive(memberSession.get(), "self"), "assignment", "left");
    cJSON_SetNumberValue(cJSON_GetObjectItemCaseSensitive(memberSession.get(), "assignmentRevision"), 2);
    assert(parsePersonalSession(encode(memberSession.get()), memberConfiguration, state, 10000));
    assert(parsePersonalBed(encode(assigned), memberConfiguration, state, 10000, 1793314800000LL));
    assert(state.personal.temperatureZones == 1 && state.sides[0].valid && !state.sides[1].valid);
    assert(!maySend(temperature, state, 10001)); // Previous person's tap cannot be applied to the newly read account.
    temperature.scope = state.personal.scope; temperature.resolvedZones = 1;
    assert(buildPersonalRequest(temperature, state, 10001, 1793314800000LL, account, request));
    auto *unassigned = cJSON_GetObjectItemCaseSensitive(contract.get(), "unassignedBed");
    setText(cJSON_GetObjectItemCaseSensitive(memberSession.get(), "self"), "assignment", "unassigned");
    cJSON_SetNumberValue(cJSON_GetObjectItemCaseSensitive(memberSession.get(), "assignmentRevision"), 1);
    assert(parsePersonalSession(encode(memberSession.get()), memberConfiguration, state, 10000));
    assert(parsePersonalBed(encode(unassigned), memberConfiguration, state, 10000, 1793314800000LL));
    assert(!state.personal.ready && !state.sides[0].valid && !state.sides[1].valid);
    assert(!maySend(temperature, state, 10001));
    std::cout << "Personal identity, routing, expiry, observations and receipts passed\n";
}
