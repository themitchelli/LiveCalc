cmake_minimum_required(VERSION 3.14)
project(livecalc-engine VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# SIMD build option (only applies to Emscripten WASM builds)
option(ENABLE_SIMD "Enable SIMD128 instructions for WASM (requires browser support)" OFF)

# Parquet support (requires Apache Arrow C++)
option(ENABLE_PARQUET "Enable Parquet file support via Apache Arrow" OFF)

# Detect build environment
# Emscripten: Browser/Node.js WASM with JS wrapper
# WASI: Standalone WASM for Wasmtime/Wasmer CLI execution
if(EMSCRIPTEN)
    message(STATUS "Building for WebAssembly with Emscripten (Browser/Node.js)")
    set(WASM_BUILD ON)
    set(WASI_BUILD OFF)
elseif(DEFINED ENV{WASI_SDK_PATH} OR DEFINED WASI_SDK_PATH)
    message(STATUS "Building for WebAssembly with WASI SDK (Wasmtime/Wasmer)")
    set(WASM_BUILD OFF)
    set(WASI_BUILD ON)
else()
    message(STATUS "Building native executable")
    set(WASM_BUILD OFF)
    set(WASI_BUILD OFF)
endif()

# Build type configuration
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# Compiler warnings
if(NOT WASM_BUILD AND NOT WASI_BUILD)
    add_compile_options(-Wall -Wextra -Werror -pedantic)
else()
    add_compile_options(-Wall -Wextra)
endif()

# Library sources (shared between native and WASM builds)
set(LIB_SOURCES
    src/policy.cpp
    src/assumptions.cpp
    src/assumption_set.cpp
    src/scenario.cpp
    src/projection.cpp
    src/valuation.cpp
    src/io/csv_reader.cpp
    src/io/json_writer.cpp
    src/udf/udf_context.cpp
    src/udf/udf_executor.cpp
)

# Add Parquet support if enabled
if(ENABLE_PARQUET)
    list(APPEND LIB_SOURCES src/io/parquet_reader.cpp)
    message(STATUS "Parquet support enabled (requires Apache Arrow)")
endif()

# ============================================================================
# Native Build Configuration
# ============================================================================
if(NOT WASM_BUILD AND NOT WASI_BUILD)
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

    # Link Apache Arrow if Parquet enabled
    if(ENABLE_PARQUET)
        find_package(Arrow REQUIRED)
        find_package(Parquet REQUIRED)
        target_link_libraries(livecalc_core PUBLIC Arrow::arrow_shared Parquet::parquet_shared)
        target_compile_definitions(livecalc_core PUBLIC HAVE_ARROW)
    endif()

    # Main executable
    add_executable(livecalc-engine src/main.cpp)
    target_link_libraries(livecalc-engine PRIVATE livecalc_core)

    # Add assumptions library subdirectory (for AssumptionsClient integration)
    # Note: For US-002, we test AssumptionSet with local file loading only.
    # Full AssumptionsClient integration requires assumptions-lib to be built.
    if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/../livecalc-assumptions-lib/CMakeLists.txt")
        set(BUILD_TESTS_TEMP ${BUILD_TESTS})
        set(BUILD_TESTS OFF CACHE BOOL "Disable tests for assumptions lib" FORCE)
        # Temporarily disable -Werror for assumptions-lib compilation
        set(CMAKE_CXX_FLAGS_BACKUP "${CMAKE_CXX_FLAGS}")
        string(REPLACE "-Werror" "" CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS}")
        add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/../livecalc-assumptions-lib
                         ${CMAKE_CURRENT_BINARY_DIR}/livecalc-assumptions-lib EXCLUDE_FROM_ALL)
        set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS_BACKUP}")
        set(BUILD_TESTS ${BUILD_TESTS_TEMP} CACHE BOOL "Restore tests setting" FORCE)
        target_link_libraries(livecalc_core PUBLIC assumptions_lib)
        target_compile_definitions(livecalc_core PUBLIC HAVE_ASSUMPTIONS_CLIENT)
        message(STATUS "Assumptions Manager client library found and linked")
    else()
        message(STATUS "Assumptions Manager client library not found (AssumptionSet will support local files only)")
    endif()

    # Test executable
    add_executable(tests
        tests/test_policy.cpp
        tests/test_assumptions.cpp
        tests/test_assumption_set.cpp
        tests/test_scenario.cpp
        tests/test_projection.cpp
        tests/test_valuation.cpp
        tests/test_udf_execution.cpp
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
elseif(WASM_BUILD)
    # WASM library with exports
    set(WASM_SOURCES
        ${LIB_SOURCES}
        src/wasm/exports.cpp
    )

    # WASM output name - changes based on SIMD flag
    if(ENABLE_SIMD)
        set(WASM_OUTPUT_NAME "livecalc-simd")
        message(STATUS "SIMD128 enabled - output: livecalc-simd.wasm")
        message(STATUS "  Browser support: Chrome 91+, Firefox 89+, Safari 16.4+, Node 16+")
    else()
        set(WASM_OUTPUT_NAME "livecalc")
        message(STATUS "SIMD disabled - output: livecalc.wasm (scalar)")
    endif()

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
    set(EXPORTED_RUNTIME_METHODS "'cwrap','ccall','getValue','setValue','UTF8ToString','stringToUTF8','lengthBytesUTF8','HEAPU8','HEAPF64'")

    # Module export name depends on SIMD
    if(ENABLE_SIMD)
        set(WASM_EXPORT_NAME "createLiveCalcModuleSimd")
    else()
        set(WASM_EXPORT_NAME "createLiveCalcModule")
    endif()

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
        "-s EXPORT_NAME='${WASM_EXPORT_NAME}'"
        "-s ENVIRONMENT='web,node'"
        "-s FILESYSTEM=0"
        "-s ASSERTIONS=0"
        "--no-entry"
    )

    # SIMD-specific flags
    if(ENABLE_SIMD)
        list(APPEND WASM_COMMON_FLAGS "-msimd128")
        # Note: SIMD requires 16-byte alignment for vector loads/stores
        # See docs/simd-alignment.md for details
    endif()

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

    # Add SIMD compile flag if enabled
    if(ENABLE_SIMD)
        target_compile_options(${WASM_OUTPUT_NAME} PRIVATE -msimd128)
    endif()

    # Custom target to report WASM binary size
    if(ENABLE_SIMD)
        add_custom_command(TARGET ${WASM_OUTPUT_NAME} POST_BUILD
            COMMAND ${CMAKE_COMMAND} -E echo "WASM SIMD build complete:"
            COMMAND ${CMAKE_COMMAND} -E echo "  SIMD128 instructions enabled"
            COMMAND ls -lh ${CMAKE_BINARY_DIR}/${WASM_OUTPUT_NAME}.wasm || true
            COMMAND ls -lh ${CMAKE_BINARY_DIR}/${WASM_OUTPUT_NAME}.mjs || true
        )
    else()
        add_custom_command(TARGET ${WASM_OUTPUT_NAME} POST_BUILD
            COMMAND ${CMAKE_COMMAND} -E echo "WASM scalar build complete:"
            COMMAND ls -lh ${CMAKE_BINARY_DIR}/${WASM_OUTPUT_NAME}.wasm || true
            COMMAND ls -lh ${CMAKE_BINARY_DIR}/${WASM_OUTPUT_NAME}.mjs || true
        )
    endif()

# ============================================================================
# WASI Build Configuration (for Wasmtime/Wasmer)
# ============================================================================
elseif(WASI_BUILD)
    # WASI standalone executable with CLI interface
    set(WASI_SOURCES
        ${LIB_SOURCES}
        src/wasm/wasi_main.cpp
    )

    set(WASI_OUTPUT_NAME "livecalc-wasi")

    add_executable(${WASI_OUTPUT_NAME} ${WASI_SOURCES})
    target_include_directories(${WASI_OUTPUT_NAME} PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)

    # WASI-specific compile options
    target_compile_options(${WASI_OUTPUT_NAME} PRIVATE
        -O3
        -fno-exceptions
    )

    # WASI link options for standalone execution
    target_link_options(${WASI_OUTPUT_NAME} PRIVATE
        -Wl,--export=main
        -Wl,--export=__heap_base
        -Wl,--export=__data_end
        -Wl,--initial-memory=67108864    # 64MB initial memory
        -Wl,--max-memory=4294967296      # 4GB max memory
    )

    # Output .wasm suffix
    set_target_properties(${WASI_OUTPUT_NAME} PROPERTIES
        SUFFIX ".wasm"
    )

    # Report build size
    add_custom_command(TARGET ${WASI_OUTPUT_NAME} POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E echo "WASI build complete:"
        COMMAND ls -lh ${CMAKE_BINARY_DIR}/${WASI_OUTPUT_NAME}.wasm || true
    )
endif()
