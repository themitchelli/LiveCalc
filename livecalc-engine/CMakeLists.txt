cmake_minimum_required(VERSION 3.14)
project(livecalc-engine VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Detect Emscripten
if(EMSCRIPTEN)
    message(STATUS "Building for WebAssembly with Emscripten")
    set(WASM_BUILD ON)
else()
    message(STATUS "Building native executable")
    set(WASM_BUILD OFF)
endif()

# Build type configuration
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# Compiler warnings (not all work with Emscripten)
if(NOT WASM_BUILD)
    add_compile_options(-Wall -Wextra -Werror -pedantic)
else()
    add_compile_options(-Wall -Wextra)
endif()

# Library sources (shared between native and WASM builds)
set(LIB_SOURCES
    src/policy.cpp
    src/assumptions.cpp
    src/scenario.cpp
    src/projection.cpp
    src/valuation.cpp
    src/io/csv_reader.cpp
    src/io/json_writer.cpp
)

# ============================================================================
# Native Build Configuration
# ============================================================================
if(NOT WASM_BUILD)
    # Fetch Catch2 for testing
    include(FetchContent)
    FetchContent_Declare(
        Catch2
        GIT_REPOSITORY https://github.com/catchorg/Catch2.git
        GIT_TAG v3.5.2
    )
    FetchContent_MakeAvailable(Catch2)

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
        tests/test_projection.cpp
        tests/test_valuation.cpp
    )
    target_link_libraries(tests PRIVATE livecalc_core Catch2::Catch2WithMain)

    # Enable testing
    include(CTest)
    include(Catch)
    catch_discover_tests(tests)

    # Benchmark executable (not part of regular tests)
    add_executable(benchmark tests/benchmark_valuation.cpp)
    target_link_libraries(benchmark PRIVATE livecalc_core)

    # CLI integration tests (requires the main executable to be built first)
    add_executable(cli_tests tests/test_cli.cpp)
    target_link_libraries(cli_tests PRIVATE Catch2::Catch2WithMain)
    add_dependencies(cli_tests livecalc-engine)
    set_target_properties(cli_tests PROPERTIES
        RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}"
    )
    catch_discover_tests(cli_tests WORKING_DIRECTORY "${CMAKE_BINARY_DIR}")

# ============================================================================
# WASM Build Configuration (Emscripten)
# ============================================================================
else()
    # WASM library with exports
    set(WASM_SOURCES
        ${LIB_SOURCES}
        src/wasm/exports.cpp
    )

    # WASM output name
    set(WASM_OUTPUT_NAME "livecalc")

    add_executable(${WASM_OUTPUT_NAME} ${WASM_SOURCES})
    target_include_directories(${WASM_OUTPUT_NAME} PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)

    # Exported functions for JavaScript access
    set(EXPORTED_FUNCTIONS
        "_livecalc_malloc"
        "_livecalc_free"
        "_load_policies_binary"
        "_load_policies_csv"
        "_get_policy_count"
        "_clear_policies"
        "_load_mortality_binary"
        "_load_mortality_csv"
        "_load_lapse_binary"
        "_load_lapse_csv"
        "_load_expenses_binary"
        "_load_expenses_csv"
        "_run_valuation"
        "_get_result_mean"
        "_get_result_std_dev"
        "_get_result_p50"
        "_get_result_p75"
        "_get_result_p90"
        "_get_result_p95"
        "_get_result_p99"
        "_get_result_cte95"
        "_get_result_execution_time_ms"
        "_get_result_scenario_count"
        "_get_result_scenario_npv"
        "_get_result_distribution"
        "_generate_result_json"
        "_get_result_json_ptr"
        "_get_result_json_length"
        "_get_version"
    )

    # Join exported functions into comma-separated list
    string(REPLACE ";" "," EXPORTED_FUNCTIONS_STR "${EXPORTED_FUNCTIONS}")

    # Exported runtime methods for JavaScript access
    set(EXPORTED_RUNTIME_METHODS "'cwrap','ccall','getValue','setValue','UTF8ToString','stringToUTF8','lengthBytesUTF8'")

    # Common WASM link flags
    set(WASM_COMMON_FLAGS
        "-s WASM=1"
        "-s EXPORTED_FUNCTIONS=[${EXPORTED_FUNCTIONS_STR}]"
        "-s EXPORTED_RUNTIME_METHODS=[${EXPORTED_RUNTIME_METHODS}]"
        "-s ALLOW_MEMORY_GROWTH=1"
        "-s MAXIMUM_MEMORY=4GB"
        "-s INITIAL_MEMORY=64MB"
        "-s STACK_SIZE=1MB"
        "-s MODULARIZE=1"
        "-s EXPORT_ES6=1"
        "-s EXPORT_NAME='createLiveCalcModule'"
        "-s ENVIRONMENT='web,node'"
        "-s FILESYSTEM=0"
        "-s ASSERTIONS=0"
        "--no-entry"
    )

    # Build type specific flags
    if(CMAKE_BUILD_TYPE STREQUAL "Debug")
        message(STATUS "WASM Debug build with source maps")
        set(WASM_BUILD_FLAGS
            ${WASM_COMMON_FLAGS}
            "-O0"
            "-g"
            "-gsource-map"
            "-s ASSERTIONS=2"
            "-s SAFE_HEAP=1"
            "-s STACK_OVERFLOW_CHECK=2"
        )
    else()
        message(STATUS "WASM Release build with optimizations")
        set(WASM_BUILD_FLAGS
            ${WASM_COMMON_FLAGS}
            "-O3"
            "-flto"
        )
    endif()

    # Join flags
    string(REPLACE ";" " " WASM_LINK_FLAGS "${WASM_BUILD_FLAGS}")

    # Apply link flags
    # Note: Output is .mjs for proper ES6 module support in Node.js
    set_target_properties(${WASM_OUTPUT_NAME} PROPERTIES
        SUFFIX ".mjs"
        LINK_FLAGS "${WASM_LINK_FLAGS}"
    )

    # Also apply compile flags for consistency
    if(CMAKE_BUILD_TYPE STREQUAL "Debug")
        target_compile_options(${WASM_OUTPUT_NAME} PRIVATE -O0 -g)
    else()
        target_compile_options(${WASM_OUTPUT_NAME} PRIVATE -O3 -flto)
    endif()

    # Custom target to report WASM binary size
    add_custom_command(TARGET ${WASM_OUTPUT_NAME} POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E echo "WASM build complete:"
        COMMAND ls -lh ${CMAKE_BINARY_DIR}/${WASM_OUTPUT_NAME}.wasm || true
        COMMAND ls -lh ${CMAKE_BINARY_DIR}/${WASM_OUTPUT_NAME}.mjs || true
    )
endif()
