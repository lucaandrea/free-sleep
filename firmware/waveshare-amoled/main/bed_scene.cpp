#include "bed_scene.hpp"
#include "temperature.hpp"
#include <algorithm>
#include <cmath>
#include <limits>

namespace bedside {
namespace {
constexpr float radians = 0.01745329252f;
using Vertex = std::array<float, 3>;
struct MeshFace { std::array<Vertex, 4> points; uint32_t color; };
uint32_t shade(uint32_t color, float light) {
    uint32_t result = 0;
    for (int shift : {16, 8, 0}) result |= static_cast<uint32_t>(std::min(255.f, ((color >> shift) & 255) * light)) << shift;
    return result;
}
Vertex articulate(Vertex point, float head, float feet) {
    // Head and knee hinges lift panels about the seat, without stretching their surfaces.
    float hinge = 0, angle = 0;
    if (point[2] < -0.24f) { hinge = -0.24f; angle = -head * radians; }
    if (point[2] > 0.24f) { hinge = 0.24f; angle = feet * radians; }
    const float distance = point[2] - hinge, height = point[1] - 0.20f;
    point[2] = hinge + distance * std::cos(angle) - height * std::sin(angle);
    point[1] = 0.20f + distance * std::sin(angle) + height * std::cos(angle);
    return point;
}
void box(std::vector<MeshFace> &mesh, float left, float right, float top, float bottom,
         float lower, float upper, uint32_t color, const BedScene *bed = nullptr) {
    const float radius=std::min({0.045f,(right-left)/8,(bottom-top)/8});
    const float bevel=std::min(0.018f,(upper-lower)/4);
    auto ring=[&](float height,float inset) {
        const float minimum=left+inset,maximum=right-inset,near=top+inset,far=bottom-inset;
        return std::array<Vertex,8>{{{minimum+radius,height,near},{maximum-radius,height,near},
            {maximum,height,near+radius},{maximum,height,far-radius},{maximum-radius,height,far},
            {minimum+radius,height,far},{minimum,height,far-radius},{minimum,height,near+radius}}};
    };
    auto lowerRing=ring(lower,0),edgeRing=ring(upper-bevel,0),upperRing=ring(upper,bevel);
    Vertex center{(left+right)/2,upper,(top+bottom)/2};
    Vertex underside{(left+right)/2,lower,(top+bottom)/2};
    if(bed) {
        for(auto *vertices:{&lowerRing,&edgeRing,&upperRing}) for(auto &point:*vertices) point=articulate(point,bed->head,bed->feet);
        center=articulate(center,bed->head,bed->feet);
        underside=articulate(underside,bed->head,bed->feet);
    }
    for(int edge=0;edge<8;++edge) {
        const int next=(edge+1)%8;
        const float lighting=0.54f+0.16f*std::abs(std::sin(edge*0.785398f));
        mesh.push_back({{lowerRing[edge],lowerRing[next],edgeRing[next],edgeRing[edge]},shade(color,lighting)});
        mesh.push_back({{edgeRing[edge],edgeRing[next],upperRing[next],upperRing[edge]},shade(color,0.88f)});
        mesh.push_back({{center,upperRing[edge],upperRing[next],center},color});
        mesh.push_back({{underside,lowerRing[next],lowerRing[edge],underside},shade(color,0.40f)});
    }
}
ScenePoint project(Vertex point, const BedScene &scene) {
    const float horizontal = point[0] * std::cos(scene.yaw) - point[2] * std::sin(scene.yaw);
    const float distance = point[0] * std::sin(scene.yaw) + point[2] * std::cos(scene.yaw);
    return {horizontal, distance * std::sin(scene.pitch) - point[1] * std::cos(scene.pitch),
            distance * std::cos(scene.pitch) + point[1] * std::sin(scene.pitch)};
}
}
std::vector<SceneFace> bedFaces(const BedScene &configuration, int width, int height) {
    BedScene scene = configuration;
    scene.pitch = std::clamp(scene.pitch, 0.30f, 1.20f);
    scene.head = std::clamp(scene.head, 0.f, 60.f); scene.feet = std::clamp(scene.feet, 0.f, 45.f);
    std::vector<MeshFace> mesh; mesh.reserve(500);
    box(mesh,-1.03f,1.03f,-1.16f,1.16f,-0.10f,0.10f,0x666059);
    box(mesh,-0.98f,0.98f,-1.10f,1.10f,0.10f,0.19f,0x292a2e);
    constexpr float boundaries[4] = {-1.10f,-0.24f,0.24f,1.10f};
    for (int side = 0; side < 2; ++side) {
        const float left = side == 0 ? -0.96f : 0.025f, right = side == 0 ? -0.025f : 0.96f;
        for (int panel = 0; panel < 3; ++panel) {
            const float top = boundaries[panel] + 0.012f, bottom = boundaries[panel+1] - 0.012f;
            box(mesh,left,right,top,bottom,0.20f,0.27f,0x77787d,&scene);
            if (scene.mattress) {
                box(mesh,left+0.008f,right-0.008f,top,bottom,0.275f,0.43f,scene.sideColors[side],&scene);
                // Each measured region spans the bed length; it does not imply head/foot resolution.
                for (int region = 0; region < 3; ++region) {
                    const int sensor = side == 0 ? region : 5-region;
                    if (!(scene.sensorMask & (1 << sensor))) continue;
                    const float zoneLeft = left + (right-left) * region / 3.f + 0.027f;
                    const float zoneRight = left + (right-left) * (region+1) / 3.f - 0.027f;
                    MeshFace face{{Vertex{zoneLeft,0.434f,top+0.025f},Vertex{zoneRight,0.434f,top+0.025f},
                                   Vertex{zoneRight,0.434f,bottom-0.025f},Vertex{zoneLeft,0.434f,bottom-0.025f}},scene.sensorColors[sensor]};
                    for (auto &point : face.points) point = articulate(point,scene.head,scene.feet);
                    mesh.push_back(face);
                }
            }
        }
        if (scene.mattress) box(mesh,left+0.13f,right-0.13f,-1.02f,-0.74f,0.44f,0.53f,0xd6d0c6,&scene);
    }
    std::vector<SceneFace> result; result.reserve(mesh.size());
    float minimumHorizontal=100,maximumHorizontal=-100,minimumVertical=100,maximumVertical=-100;
    for (const auto &face : mesh) {
        SceneFace projected; projected.color=face.color;
        for (int index=0;index<4;++index) {
            auto point=project(face.points[index],scene); projected.points[index]=point; projected.depth+=point.depth/4;
            minimumHorizontal=std::min(minimumHorizontal,point.horizontal);maximumHorizontal=std::max(maximumHorizontal,point.horizontal);
            minimumVertical=std::min(minimumVertical,point.vertical);maximumVertical=std::max(maximumVertical,point.vertical);
        }
        result.push_back(projected);
    }
    // Fit every orbit and articulation inside the viewport; zoom only uses this safe envelope.
    const float scale=std::min((width-20)/(maximumHorizontal-minimumHorizontal),(height-16)/(maximumVertical-minimumVertical))*std::clamp(scene.zoom,0.65f,1.f);
    for(auto &face:result) for(auto &point:face.points) {
        point.horizontal=width/2.f+(point.horizontal-(minimumHorizontal+maximumHorizontal)/2)*scale;
        point.vertical=height/2.f+(point.vertical-(minimumVertical+maximumVertical)/2)*scale;
    }
    std::stable_sort(result.begin(),result.end(),[](const SceneFace &left,const SceneFace &right){return left.depth<right.depth;});
    return result;
}
// A depth buffer prevents the wide frame or seat from painting over raised panels.
void rasterizeBed(const BedScene &scene,int width,int height,std::vector<uint16_t> &pixels,std::vector<float> &depth) {
    auto rgb565=[](uint32_t color) {return static_cast<uint16_t>(((color>>8)&0xf800)|((color>>5)&0x07e0)|((color>>3)&0x001f));};
    pixels.assign(width*height,rgb565(0x10111c));depth.assign(width*height,-std::numeric_limits<float>::infinity());
    const auto faces=bedFaces(scene,width,height);
    auto edge=[](const ScenePoint &first,const ScenePoint &second,float horizontal,float vertical) {
        return (horizontal-first.horizontal)*(second.vertical-first.vertical)-(vertical-first.vertical)*(second.horizontal-first.horizontal);
    };
    for(const auto &face:faces) for(int triangle=0;triangle<2;++triangle) {
        const auto &first=face.points[0],&second=face.points[triangle+1],&third=face.points[triangle+2];
        const float area=edge(first,second,third.horizontal,third.vertical);
        if(area>=-0.01f)continue; // Cull faces pointing away from the camera.
        const int left=std::max(0,static_cast<int>(std::floor(std::min({first.horizontal,second.horizontal,third.horizontal}))));
        const int right=std::min(width-1,static_cast<int>(std::ceil(std::max({first.horizontal,second.horizontal,third.horizontal}))));
        const int top=std::max(0,static_cast<int>(std::floor(std::min({first.vertical,second.vertical,third.vertical}))));
        const int bottom=std::min(height-1,static_cast<int>(std::ceil(std::max({first.vertical,second.vertical,third.vertical}))));
        const auto color=rgb565(face.color);
        const float inverseArea=1.f/area;
        const float horizontalFirst=(third.vertical-second.vertical)*inverseArea;
        const float horizontalSecond=(first.vertical-third.vertical)*inverseArea;
        const float depthStep=horizontalFirst*(first.depth-third.depth)+horizontalSecond*(second.depth-third.depth);
        for(int vertical=top;vertical<=bottom;++vertical) {
            float weightFirst=edge(second,third,left+0.5f,vertical+0.5f)*inverseArea;
            float weightSecond=edge(third,first,left+0.5f,vertical+0.5f)*inverseArea;
            float distance=weightFirst*first.depth+weightSecond*second.depth+(1-weightFirst-weightSecond)*third.depth;
            for(int horizontal=left;horizontal<=right;++horizontal) {
                if(weightFirst>=0 && weightSecond>=0 && weightFirst+weightSecond<=1) {
                    const int index=vertical*width+horizontal;
                    if(distance>depth[index]) {depth[index]=distance;pixels[index]=color;}
                }
                weightFirst+=horizontalFirst;weightSecond+=horizontalSecond;distance+=depthStep;
            }
        }
    }
}
uint32_t thermalColor(double fahrenheit) {
    if (!std::isfinite(fahrenheit)) return 0x62656a;
    constexpr double stops[] = {64.4, 76, 80, 84, 96.8};
    constexpr uint32_t colors[] = {0x2371ec, 0x9fcff4, 0xb9bcc3, 0xf3b0af, 0xe43d4c};
    for (int index = 0; index < 4; ++index)
        if (fahrenheit < stops[index+1]) return mixColors(colors[index], colors[index+1], (fahrenheit-stops[index])/(stops[index+1]-stops[index]));
    return colors[4];
}
bool insideCircle(float horizontal,float vertical,float radius) {
    return (horizontal-233)*(horizontal-233)+(vertical-233)*(vertical-233)<=radius*radius;
}
bool rectangleInsideCircle(int horizontal,int vertical,int width,int height) {
    return insideCircle(horizontal,vertical)&&insideCircle(horizontal+width,vertical)
        &&insideCircle(horizontal,vertical+height)&&insideCircle(horizontal+width,vertical+height);
}
}
