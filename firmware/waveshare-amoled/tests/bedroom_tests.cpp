#include "model.hpp"
#include "cJSON.h"
#include <cassert>
#include <fstream>
#include <iterator>
#include <memory>

using namespace bedside;
static std::string changed(const std::string &original, const char *field, cJSON *replacement) {
    std::unique_ptr<cJSON, decltype(&cJSON_Delete)> document(cJSON_Parse(original.c_str()), cJSON_Delete);
    auto *first = cJSON_GetArrayItem(cJSON_GetObjectItemCaseSensitive(document.get(), "observations"), 0);
    cJSON_ReplaceItemInObjectCaseSensitive(first, field, replacement);
    char *encoded = cJSON_PrintUnformatted(document.get());
    const std::string result(encoded); cJSON_free(encoded); return result;
}
int main() {
    std::ifstream file(BEDROOM_FIXTURE_PATH);
    const std::string fixture((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
    BedroomContext context;
    assert(parseBedroom(fixture, context, 10000));
    assert(context.loaded && context.readings.size() == 7);
    assert(context.readings[0].device == "Fixture left bedside");
    assert(bedroomValue(context.readings[0], context, 10000, false) == "76°F");
    assert(bedroomValue(context.readings[0], context, 10000, true) == "24°C");
    assert(bedroomValue(context.readings[4], context, 10000, false) == "--");
    assert(context.readings[4].status == "cached");
    assert(bedroomValue(context.readings[5], context, 10000, false) == "On");
    assert(bedroomValue(context.readings[6], context, 10000, false) == "Off");
    assert(!bedroomFresh(context, 9999));
    assert(bedroomFresh(context, 24999));
    assert(!bedroomFresh(context, 25000));
    assert(bedroomValue(context.readings[0], context, 25000, false) == "--");
    assert(parseBedroom(changed(fixture, "expiresAt", cJSON_CreateNumber(1793067001000.0)), context, 10000));
    assert(bedroomValue(context.readings[0], context, 10999, false) == "76°F");
    assert(bedroomValue(context.readings[0], context, 11000, false) == "--");
    assert(!parseBedroom(changed(fixture, "expiresAt", cJSON_CreateNumber(1793067000000.0)), context, 10000));
    assert(!parseBedroom(changed(fixture, "expiresAt", cJSON_CreateNumber(1793077000000.0)), context, 10000));
    assert(!parseBedroom(changed(fixture, "timeBasis", cJSON_CreateString("cached")), context, 10000));
    assert(!parseBedroom(changed(fixture, "value", cJSON_CreateNumber(999)), context, 10000));
    assert(!parseBedroom(changed(fixture, "value", cJSON_CreateNull()), context, 10000));
    assert(!parseBedroom(changed(fixture, "observedAt", cJSON_CreateNumber(1793067000001.0)), context, 10000));
    assert(!parseBedroom(changed(fixture, "unit", cJSON_CreateString("°C")), context, 10000));
    assert(!parseBedroom(changed(fixture, "observedAt", cJSON_CreateNumber(1793066000000.0)), context, 10000));
    assert(!parseBedroom(fixture + " extra", context, 10000));
    assert(!parseBedroom("{}", context, 10000));
    assert(!parseBedroom(fixture, context, -1));
    assert(!parseBedroom(std::string(65537, ' '), context, 10000));
    context.enabled = false; assert(!bedroomFresh(context, 10000));
}
