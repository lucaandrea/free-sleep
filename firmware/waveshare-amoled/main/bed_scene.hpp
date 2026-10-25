#pragma once
#include <array>
#include <cstdint>
#include <vector>

namespace bedside {
struct ScenePoint { float horizontal = 0, vertical = 0, depth = 0; };
struct SceneFace { std::array<ScenePoint, 4> points; uint32_t color = 0; float depth = 0; };
struct BedScene {
    float yaw = -0.55f, pitch = 0.65f, zoom = 1;
    float head = 0, feet = 0;
    bool mattress = true;
    std::array<uint32_t, 2> sideColors{0xa8aaae, 0xa8aaae};
    uint8_t sensorMask = 0;
    std::array<uint32_t, 6> sensorColors{};
};
// Projects the articulated mesh into a bounded viewport, back faces first.
std::vector<SceneFace> bedFaces(const BedScene &scene, int width, int height);
void rasterizeBed(const BedScene &scene, int width, int height, std::vector<uint16_t> &pixels, std::vector<float> &depth);
uint32_t thermalColor(double fahrenheit);
bool insideCircle(float horizontal, float vertical, float radius = 225);
bool rectangleInsideCircle(int horizontal, int vertical, int width, int height);
}
