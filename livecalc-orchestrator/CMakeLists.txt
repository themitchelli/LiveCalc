cmake_minimum_required(VERSION 3.20)
project(livecalc-orchestrator VERSION 1.0.0 LANGUAGES CXX)

# C++17 required for std::filesystem and other features
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Build type
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# Compiler flags
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -Wall -Wextra")
set(CMAKE_CXX_FLAGS_DEBUG "-g -O0")
set(CMAKE_CXX_FLAGS_RELEASE "-O3 -DNDEBUG")

# Include directories
include_directories(
    ${CMAKE_CURRENT_SOURCE_DIR}/src
    ${CMAKE_CURRENT_SOURCE_DIR}/../livecalc-engine/src
)

# Source files
set(ORCHESTRATOR_SOURCES
    src/projection_engine.cpp
    src/buffer_manager.cpp
    src/engine_factory.cpp
    src/engine_lifecycle.cpp
    src/dag_config.cpp
    src/config_parser.cpp
    src/credential_manager.cpp
    src/parquet_io.cpp
    src/logger.cpp
    src/orchestrator.cpp
)

# Header files
set(ORCHESTRATOR_HEADERS
    src/engine_interface.hpp
    src/projection_engine.hpp
    src/buffer_manager.hpp
    src/engine_factory.hpp
    src/engine_lifecycle.hpp
    src/dag_config.hpp
    src/config_parser.hpp
    src/credential_manager.hpp
    src/parquet_io.hpp
    src/logger.hpp
    src/orchestrator.hpp
)

# Build orchestrator as a library
add_library(orchestrator STATIC ${ORCHESTRATOR_SOURCES})

# Link against livecalc-engine (which already includes assumptions-lib if available)
if(NOT TARGET livecalc_core)
    add_subdirectory(../livecalc-engine ${CMAKE_BINARY_DIR}/livecalc-engine)
endif()
target_link_libraries(orchestrator PRIVATE livecalc_core)

# nlohmann/json is needed for config parsing
# Check if it's available from assumptions lib or fetch it
if(TARGET nlohmann_json::nlohmann_json)
    target_link_libraries(orchestrator PRIVATE nlohmann_json::nlohmann_json)
else()
    include(FetchContent)
    FetchContent_Declare(
        nlohmann_json
        GIT_REPOSITORY https://github.com/nlohmann/json.git
        GIT_TAG v3.11.3
    )
    FetchContent_MakeAvailable(nlohmann_json)
    target_link_libraries(orchestrator PRIVATE nlohmann_json::nlohmann_json)
endif()

# If livecalc_core linked against assumptions_lib, we inherit it
if(TARGET livecalc_assumptions_lib)
    target_link_libraries(orchestrator PRIVATE livecalc_assumptions_lib)
    target_compile_definitions(orchestrator PRIVATE HAVE_ASSUMPTIONS_CLIENT)
endif()

# Apache Arrow for Parquet I/O (optional)
find_package(Arrow QUIET)
if(Arrow_FOUND)
    find_package(Parquet REQUIRED)
    target_link_libraries(orchestrator PRIVATE Arrow::arrow_shared Parquet::parquet_shared)
    target_compile_definitions(orchestrator PRIVATE HAVE_ARROW)
    message(STATUS "  Arrow/Parquet support: Enabled")
else()
    message(STATUS "  Arrow/Parquet support: Disabled (Arrow not found)")
endif()

# Tests
option(BUILD_TESTS "Build unit tests" ON)

if(BUILD_TESTS)
    enable_testing()

    # Download Catch2 for testing
    include(FetchContent)
    FetchContent_Declare(
        Catch2
        GIT_REPOSITORY https://github.com/catchorg/Catch2.git
        GIT_TAG v3.5.0
    )
    FetchContent_MakeAvailable(Catch2)

    # Test sources
    set(TEST_SOURCES
        tests/test_engine_interface.cpp
        tests/test_buffer_manager.cpp
        tests/test_engine_lifecycle.cpp
        tests/test_dag_config.cpp
        tests/test_credential_manager.cpp
        tests/test_parquet_io.cpp
        tests/test_logger.cpp
        tests/test_orchestrator.cpp
    )

    add_executable(orchestrator_tests ${TEST_SOURCES})
    target_link_libraries(orchestrator_tests PRIVATE orchestrator Catch2::Catch2WithMain)

    # Link Arrow/Parquet if available (for parquet_io tests)
    if(Arrow_FOUND)
        target_link_libraries(orchestrator_tests PRIVATE Arrow::arrow_shared Parquet::parquet_shared)
        target_compile_definitions(orchestrator_tests PRIVATE HAVE_ARROW)
    endif()
    if(TARGET nlohmann_json::nlohmann_json)
        target_link_libraries(orchestrator_tests PRIVATE nlohmann_json::nlohmann_json)
    endif()

    # Register tests
    add_test(NAME OrchestratorTests COMMAND orchestrator_tests)
endif()

# Installation
install(TARGETS orchestrator
    ARCHIVE DESTINATION lib
    LIBRARY DESTINATION lib
)

install(FILES ${ORCHESTRATOR_HEADERS}
    DESTINATION include/livecalc/orchestrator
)

install(DIRECTORY examples/
    DESTINATION share/livecalc/orchestrator/examples
    FILES_MATCHING PATTERN "*.json"
)

# Print configuration summary
message(STATUS "LiveCalc Orchestrator Configuration:")
message(STATUS "  Build type: ${CMAKE_BUILD_TYPE}")
message(STATUS "  C++ standard: ${CMAKE_CXX_STANDARD}")
message(STATUS "  Build tests: ${BUILD_TESTS}")
