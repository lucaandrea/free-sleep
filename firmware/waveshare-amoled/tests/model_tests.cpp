#include "model.hpp"
#include "bed_scene.hpp"
#include "temperature.hpp"
#include <cmath>
#include <cassert>
#include <iostream>
using namespace bedside;

int main() {
    State state;
    const std::string status = R"({"leftSide":{"currentTemperature":81,"targetTemperature":80,"targetLevel":0,"heatingDuration":3600},"rightSide":{"currentTemperature":null,"targetTemperature":null,"heatingDuration":0},"waterLevel":"ok","isPriming":false,"temperatureControl":{"left":{"source":"manual","holdUntil":1800000000,"blocked":null}}})";
    assert(parseDevice(status, state, 10000));
    assert(state.sides[0].powered); // Neutral temperature is not powered-off.
    assert(!state.sides[1].measuredAvailable && !state.sides[1].powered);
    assert(state.sides[0].owner == "manual");
    assert(!parseDevice("{}", state, 11000));
    assert(!parseDevice(R"({"leftSide":{},"rightSide":{}})", state, 11000));
    assert(state.receivedAt == 10000);
    Command temperature; temperature.side = 0; temperature.value = 80; temperature.createdAt = 10000;
    Request request;
    assert(buildRequest(temperature, request));
    assert(request.path == "/api/device/temperature" && request.body.find("360") != std::string::npos);
    state.wifi = true;
    assert(maySend(temperature, state, 10001));
    assert(!maySend(temperature, state, 16000));
    assert(!maySend(temperature, state, 9999));
    state.lowWater = true; assert(!maySend(temperature, state, 10001)); state.lowWater = false;
    state.priming = true; assert(!maySend(temperature, state, 10001)); state.priming = false;
    temperature.value = 111; assert(!buildRequest(temperature, request));
    temperature.value = 54; assert(!buildRequest(temperature, request));
    temperature.side = 3; assert(!maySend(temperature, state, 10001));
    Command move; move.action = Action::basePosition; move.createdAt = 10000; move.value = 60; move.feet = 45;
    assert(buildRequest(move, request)); assert(!maySend(move, state, 10001));
    assert(parseBase(R"({"state":"connected","stale":false,"busy":false,"position":{"left":{"head":5,"feet":10},"right":{"head":5,"feet":10}}})", state, 10000));
    assert(maySend(move, state, 10001));
    state.base.stale = true; assert(!maySend(move, state, 10001));
    move.value = 61; assert(!buildRequest(move, request));
    Command stop; stop.action = Action::baseStop; stop.createdAt = 10000; state.connected = false;
    assert(maySend(stop, state, 10001));
    state.preview = true; assert(!maySend(stop, state, 10001)); state.preview = false;
    state.wifi = false; assert(!maySend(stop, state, 10001)); state.wifi = true;
    Command alarm; alarm.action = Action::alarmSave; alarm.alarm.day = "monday"; alarm.alarm.time = "07:30";
    assert(buildRequest(alarm, request) && request.method == "POST");
    alarm.alarm.identifier = 23;
    assert(buildRequest(alarm, request) && request.method == "PATCH");
    assert(request.body.find("wakeWindow") != std::string::npos);
    alarm.alarm.wakeWindow=11; assert(!buildRequest(alarm,request));
    alarm.alarm.wakeWindow=15; assert(buildRequest(alarm,request));
    alarm.alarm.time = "24:00"; assert(!buildRequest(alarm, request));
    alarm.alarm.time = "07:60"; assert(!buildRequest(alarm, request));
    assert(parseAlarms(R"({"alarm":[{"id":23,"side":"left","dayOfWeek":"monday","time":"07:30","enabled":true}]})", state, 0));
    assert(state.alarmsLoaded[0] && state.alarms.size() == 1);
    assert(!parseAlarms(R"({"alarm":[{"id":23,"side":"right"}]})", state, 0));
    assert(state.alarms.size() == 1); // Invalid replies cannot erase the last valid snapshot.
    Configuration configuration;
    const std::string key = "01234567890123456789012345678901";
    assert(parseConfiguration("{\"ssid\":\"Home\",\"endpoint\":\"https://pod.example\",\"token\":\"" + key + "\"}", configuration));
    assert(!parseConfiguration("{\"ssid\":\"Home\",\"endpoint\":\"http://public.example\",\"allowLocalHttp\":true,\"token\":\"" + key + "\"}", configuration));
    assert(parseConfiguration("{\"ssid\":\"Home\",\"endpoint\":\"http://192.168.1.10:3000\",\"allowLocalHttp\":true,\"token\":\"" + key + "\"}", configuration));
    assert(temperatureText(32, true) == "0°C");
    assert(targetText(77, false, TemperatureDisplay::degrees) == "77°F");
    assert(targetText(77, true, TemperatureDisplay::degrees) == "25°C");
    assert(targetText(77, true, TemperatureDisplay::offset) == "-3");
    assert(targetText(88, false, TemperatureDisplay::eightSleep) == "+2");
    assert(targetText(80, false, TemperatureDisplay::offset) == "0");
    assert(eightSleepLevel(55) == -10 && eightSleepLevel(110) == 10);
    assert(fahrenheitForLevel(0) == 83);
    assert(eightSleepLevel(79.75) == -1 && eightSleepLevel(78.375) == -1);
    for (int level = -10; level <= 10; ++level) assert(eightSleepLevel(fahrenheitForLevel(level)) == level);
    assert(stepTemperature(80, 1, false, TemperatureDisplay::eightSleep) == 83);
    assert(stepTemperature(80, -1, false, TemperatureDisplay::eightSleep) == 77);
    assert(stepTemperature(80, 1, true, TemperatureDisplay::degrees) == 82);
    for (auto display : {TemperatureDisplay::degrees, TemperatureDisplay::offset, TemperatureDisplay::eightSleep}) {
        assert(stepTemperature(55, -1, true, display) == 55);
        assert(stepTemperature(110, 1, false, display) == 110);
    }
    SideStatus cooling{true, true, false, 82, 70, true, true, "", "", 0};
    SideStatus heating = cooling; heating.target = 94;
    assert(temperatureActivity(cooling, true) == TemperatureActivity::cooling);
    assert(temperatureActivity(heating, true) == TemperatureActivity::heating);
    assert(activityColor(cooling, true) == 0x2371ec && activityColor(heating, true) == 0xe43d4c);
    cooling.target = 80; assert(activityColor(cooling,true) != 0x2371ec);
    assert(activityColor(cooling,false) == 0x62656a);
    cooling.powered = false; assert(temperatureActivity(cooling,true) == TemperatureActivity::off);
    cooling.powered = true; cooling.measuredAvailable = false;
    assert(temperatureActivity(cooling,true) == TemperatureActivity::unavailable);
    cooling.measuredAvailable = true; cooling.target = cooling.measured;
    assert(temperatureActivity(cooling,true) == TemperatureActivity::holding);
    assert(thermalColor(NAN) == 0x62656a);
    assert(thermalColor(67) != thermalColor(78) && thermalColor(84) != thermalColor(95));
    const std::string thermal = R"({"timestamp":"2026-10-25T20:00:00.000Z","leftOuterTemp":75.6,"leftCenterTemp":80.3,"leftInnerTemp":78.9,"rightOuterTemp":null,"rightCenterTemp":80.8,"rightInnerTemp":79.4,"ambientTemp":76.8,"humidity":54,"mcuTemp":91.9})";
    assert(parseThermal(thermal,state,10000));
    assert(state.thermal.available == 55 && state.thermal.humidityAvailable);
    assert(std::abs(state.thermal.zones[0]-75.6)<0.001);
    assert(state.thermal.observedAt==1792958400);
    state.connected=true;
    assert(thermalFresh(state,10000,1792958410));
    assert(!thermalFresh(state,10000,1792958399));
    assert(!thermalFresh(state,10000,1792958431));
    assert(!thermalFresh(state,40001,1792958410));
    assert(!parseThermal(R"({"timestamp":"2026-02-30T20:00:00Z"})",state,10000));
    assert(!parseThermal(R"({"timestamp":"2026-10-25T20:00:00-07:00"})",state,10000));
    assert(!parseThermal("{}",state,10000));
    assert(parseThermal(R"({"timestamp":"2026-10-25T20:00:00Z","leftOuterTemp":999,"humidity":101})",state,10000));
    assert(state.thermal.available==0 && !state.thermal.humidityAvailable);
    assert(parseThermal("null",state,10000) && state.thermal.observedAt==0);
    move.value=60; move.speed=25; assert(!buildRequest(move,request));
    move.speed=75; assert(buildRequest(move,request));
    assert(request.body.find("75")!=std::string::npos && request.body.find("right")!=std::string::npos);
    assert(thermalColor(0)==thermalColor(64.4) && thermalColor(200)==thermalColor(96.8));
    assert(!rectangleInsideCircle(0,0,80,44));
    BedScene scene; std::vector<uint16_t> pixels; std::vector<float> depth;
    for(float yaw=-3.14f;yaw<=3.14f;yaw+=0.2f) for(float pitch:{0.3f,0.65f,1.2f}) for(int head:{0,30,60}) for(int feet:{0,15,45}) for(bool mattress:{false,true}) {
        scene.yaw=yaw;scene.pitch=pitch;scene.head=head;scene.feet=feet;scene.mattress=mattress;
        const auto faces=bedFaces(scene,350,176);
        for(const auto &face:faces) for(const auto &point:face.points) {
            assert(std::isfinite(point.horizontal) && std::isfinite(point.vertical));
            assert(point.horizontal>=9.9f && point.horizontal<=340.1f && point.vertical>=7.9f && point.vertical<=168.1f);
        }
    }
    rasterizeBed(scene,350,176,pixels,depth);assert(pixels.size()==350*176);
    int visible=0; for(float value:depth) if(std::isfinite(value)) ++visible;
    assert(visible>1000 && visible<350*176);
    std::cout << "All bedside model checks passed\n";
}
