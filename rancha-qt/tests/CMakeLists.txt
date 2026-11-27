add_executable(core_tests main.cpp test_natural_compare.cpp test_color_theme.cpp test_library_view.cpp test_database.cpp test_data_paths.cpp test_settings.cpp test_item_repository.cpp)
target_link_libraries(core_tests PRIVATE rancha_core)
add_test(NAME core_tests COMMAND core_tests)
