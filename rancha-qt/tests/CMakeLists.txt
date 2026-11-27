add_executable(core_tests main.cpp test_natural_compare.cpp test_color_theme.cpp test_library_view.cpp test_library_query.cpp test_nav_history.cpp test_selection.cpp test_crop_math.cpp test_file_kinds.cpp test_launch.cpp test_folder_scan.cpp test_reorder_cover.cpp test_database.cpp test_data_paths.cpp test_settings.cpp test_item_repository.cpp)
target_link_libraries(core_tests PRIVATE rancha_core)
add_test(NAME core_tests COMMAND core_tests)
