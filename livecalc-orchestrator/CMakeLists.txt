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
)

# Header files
set(ORCHESTRATOR_HEADERS
    src/engine_interface.hpp
    src/projection_engine.hpp
)

# Build orchestrator as a library
add_library(orchestrator STATIC ${ORCHESTRATOR_SOURCES})

# Link against livecalc-engine
add_subdirectory(../livecalc-engine ${CMAKE_BINARY_DIR}/livecalc-engine)
target_link_libraries(orchestrator PRIVATE livecalc_lib)

# Optionally link against livecalc-assumptions-lib if available
if(EXISTS ${CMAKE_CURRENT_SOURCE_DIR}/../livecalc-assumptions-lib)
    add_subdirectory(../livecalc-assumptions-lib ${CMAKE_BINARY_DIR}/livecalc-assumptions-lib)
    target_link_libraries(orchestrator PRIVATE livecalc_assumptions_lib)
    target_compile_definitions(orchestrator PRIVATE HAVE_ASSUMPTIONS_CLIENT)
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
    )

    add_executable(orchestrator_tests ${TEST_SOURCES})
    target_link_libraries(orchestrator_tests PRIVATE orchestrator Catch2::Catch2WithMain)

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
