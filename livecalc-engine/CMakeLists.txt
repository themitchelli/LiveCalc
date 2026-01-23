cmake_minimum_required(VERSION 3.14)
project(livecalc-engine VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Compiler warnings
add_compile_options(-Wall -Wextra -Werror -pedantic)

# Fetch Catch2 for testing
include(FetchContent)
FetchContent_Declare(
    Catch2
    GIT_REPOSITORY https://github.com/catchorg/Catch2.git
    GIT_TAG v3.5.2
)
FetchContent_MakeAvailable(Catch2)

# Library sources
set(LIB_SOURCES
    src/policy.cpp
    src/assumptions.cpp
    src/scenario.cpp
    src/io/csv_reader.cpp
)

# Main library
add_library(livecalc_core STATIC ${LIB_SOURCES})
target_include_directories(livecalc_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/src)

# Main executable
add_executable(livecalc-engine src/main.cpp)
target_link_libraries(livecalc-engine PRIVATE livecalc_core)

# Test executable
add_executable(tests
    tests/test_policy.cpp
    tests/test_assumptions.cpp
    tests/test_scenario.cpp
)
target_link_libraries(tests PRIVATE livecalc_core Catch2::Catch2WithMain)

# Enable testing
include(CTest)
include(Catch)
catch_discover_tests(tests)
