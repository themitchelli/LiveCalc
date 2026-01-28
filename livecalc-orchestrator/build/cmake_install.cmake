# Install script for directory: /Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-orchestrator

# Set the install prefix
if(NOT DEFINED CMAKE_INSTALL_PREFIX)
  set(CMAKE_INSTALL_PREFIX "/usr/local")
endif()
string(REGEX REPLACE "/$" "" CMAKE_INSTALL_PREFIX "${CMAKE_INSTALL_PREFIX}")

# Set the install configuration name.
if(NOT DEFINED CMAKE_INSTALL_CONFIG_NAME)
  if(BUILD_TYPE)
    string(REGEX REPLACE "^[^A-Za-z0-9_]+" ""
           CMAKE_INSTALL_CONFIG_NAME "${BUILD_TYPE}")
  else()
    set(CMAKE_INSTALL_CONFIG_NAME "Debug")
  endif()
  message(STATUS "Install configuration: \"${CMAKE_INSTALL_CONFIG_NAME}\"")
endif()

# Set the component getting installed.
if(NOT CMAKE_INSTALL_COMPONENT)
  if(COMPONENT)
    message(STATUS "Install component: \"${COMPONENT}\"")
    set(CMAKE_INSTALL_COMPONENT "${COMPONENT}")
  else()
    set(CMAKE_INSTALL_COMPONENT)
  endif()
endif()

# Is this installation the result of a crosscompile?
if(NOT DEFINED CMAKE_CROSSCOMPILING)
  set(CMAKE_CROSSCOMPILING "FALSE")
endif()

# Set path to fallback-tool for dependency-resolution.
if(NOT DEFINED CMAKE_OBJDUMP)
  set(CMAKE_OBJDUMP "/usr/bin/objdump")
endif()

if(NOT CMAKE_INSTALL_LOCAL_ONLY)
  # Include the install script for the subdirectory.
  include("/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-orchestrator/build/livecalc-engine/cmake_install.cmake")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/lib" TYPE STATIC_LIBRARY FILES "/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-orchestrator/build/liborchestrator.a")
  if(EXISTS "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib/liborchestrator.a" AND
     NOT IS_SYMLINK "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib/liborchestrator.a")
    execute_process(COMMAND "/usr/bin/ranlib" "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib/liborchestrator.a")
  endif()
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/livecalc/orchestrator" TYPE FILE FILES
    "/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-orchestrator/src/engine_interface.hpp"
    "/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-orchestrator/src/projection_engine.hpp"
    "/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-orchestrator/src/buffer_manager.hpp"
    "/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-orchestrator/src/engine_factory.hpp"
    "/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-orchestrator/src/engine_lifecycle.hpp"
    "/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-orchestrator/src/dag_config.hpp"
    "/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-orchestrator/src/config_parser.hpp"
    "/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-orchestrator/src/credential_manager.hpp"
    "/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-orchestrator/src/parquet_io.hpp"
    "/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-orchestrator/src/logger.hpp"
    "/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-orchestrator/src/orchestrator.hpp"
    )
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/share/livecalc/orchestrator/examples" TYPE DIRECTORY FILES "/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-orchestrator/examples/" FILES_MATCHING REGEX "/[^/]*\\.json$")
endif()

string(REPLACE ";" "\n" CMAKE_INSTALL_MANIFEST_CONTENT
       "${CMAKE_INSTALL_MANIFEST_FILES}")
if(CMAKE_INSTALL_LOCAL_ONLY)
  file(WRITE "/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-orchestrator/build/install_local_manifest.txt"
     "${CMAKE_INSTALL_MANIFEST_CONTENT}")
endif()
if(CMAKE_INSTALL_COMPONENT)
  if(CMAKE_INSTALL_COMPONENT MATCHES "^[a-zA-Z0-9_.+-]+$")
    set(CMAKE_INSTALL_MANIFEST "install_manifest_${CMAKE_INSTALL_COMPONENT}.txt")
  else()
    string(MD5 CMAKE_INST_COMP_HASH "${CMAKE_INSTALL_COMPONENT}")
    set(CMAKE_INSTALL_MANIFEST "install_manifest_${CMAKE_INST_COMP_HASH}.txt")
    unset(CMAKE_INST_COMP_HASH)
  endif()
else()
  set(CMAKE_INSTALL_MANIFEST "install_manifest.txt")
endif()

if(NOT CMAKE_INSTALL_LOCAL_ONLY)
  file(WRITE "/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-orchestrator/build/${CMAKE_INSTALL_MANIFEST}"
     "${CMAKE_INSTALL_MANIFEST_CONTENT}")
endif()
