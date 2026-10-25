#pragma once
#include <cstdint>
inline int bsp_display_lock(uint32_t) { return 0; }
inline void bsp_display_unlock() {}
