cmake_minimum_required(VERSION 3.20)
project(LiveCalcAssumptionsLib VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Compiler warnings
if(MSVC)
    add_compile_options(/W4)
else()
    add_compile_options(-Wall -Wextra -Wpedantic)
endif()

# Find dependencies
find_package(CURL REQUIRED)
find_package(nlohmann_json 3.2.0 QUIET)
if(NOT nlohmann_json_FOUND)
    include(FetchContent)
    FetchContent_Declare(json
        URL https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz
    )
    FetchContent_MakeAvailable(json)
endif()

# Library source files
set(LIB_SOURCES
    src/c++/assumptions_client.cpp
    src/auth/jwt_handler.cpp
    src/api/http_client.cpp
    src/cache/lru_cache.cpp
)

set(LIB_HEADERS
    src/c++/assumptions_client.hpp
    src/auth/jwt_handler.hpp
    src/cache/lru_cache.hpp
    src/api/http_client.hpp
)

# Create static library
add_library(assumptions_lib STATIC ${LIB_SOURCES} ${LIB_HEADERS})

target_include_directories(assumptions_lib
    PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/src>
        $<INSTALL_INTERFACE:include>
)

target_link_libraries(assumptions_lib
    PUBLIC
        CURL::libcurl
        nlohmann_json::nlohmann_json
)

# Tests
option(BUILD_TESTS "Build tests" ON)
if(BUILD_TESTS)
    enable_testing()

    # Fetch Catch2
    include(FetchContent)
    FetchContent_Declare(
        Catch2
        GIT_REPOSITORY https://github.com/catchorg/Catch2.git
        GIT_TAG v3.5.0
    )
    FetchContent_MakeAvailable(Catch2)

    add_executable(test_assumptions_client tests/test_assumptions_client.cpp)
    target_link_libraries(test_assumptions_client PRIVATE assumptions_lib Catch2::Catch2WithMain)
    add_test(NAME test_assumptions_client COMMAND test_assumptions_client)

    add_executable(test_cache tests/test_cache.cpp)
    target_link_libraries(test_cache PRIVATE assumptions_lib Catch2::Catch2WithMain)
    add_test(NAME test_cache COMMAND test_cache)
endif()

# Installation
install(TARGETS assumptions_lib
    ARCHIVE DESTINATION lib
    LIBRARY DESTINATION lib
)

install(FILES ${LIB_HEADERS}
    DESTINATION include/livecalc-assumptions
)
