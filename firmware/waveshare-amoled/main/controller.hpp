#pragma once
#include "model.hpp"

namespace bedside {
void startController(const Configuration &configuration);
void startPreview();
State snapshot();
bool submit(Command command);
int64_t nowMilliseconds();
void setMessage(const std::string &message);
void startUI(bool celsius);
}
