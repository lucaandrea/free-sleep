idf_component_register(SRCS "main.cpp" "model.cpp" "bedroom.cpp" "controller.cpp" "ui.cpp" "bed_scene.cpp" "temperature.cpp" "preferences.cpp"
    INCLUDE_DIRS "."
    REQUIRES nvs_flash esp_wifi esp_event esp_netif esp_http_client esp-tls json esp_timer)
target_compile_features(${COMPONENT_LIB} PUBLIC cxx_std_17)
