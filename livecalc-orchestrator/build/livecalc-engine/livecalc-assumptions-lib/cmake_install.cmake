# Install script for directory: /Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-assumptions-lib

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

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/lib" TYPE STATIC_LIBRARY FILES "/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-orchestrator/build/livecalc-engine/livecalc-assumptions-lib/libassumptions_lib.a")
  if(EXISTS "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib/libassumptions_lib.a" AND
     NOT IS_SYMLINK "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib/libassumptions_lib.a")
    execute_process(COMMAND "/usr/bin/ranlib" "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib/libassumptions_lib.a")
  endif()
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/livecalc-assumptions" TYPE FILE FILES
    "/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-assumptions-lib/src/c++/assumptions_client.hpp"
    "/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-assumptions-lib/src/auth/jwt_handler.hpp"
    "/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-assumptions-lib/src/cache/lru_cache.hpp"
    "/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-assumptions-lib/src/api/http_client.hpp"
    )
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/lib/cmake/LiveCalcAssumptionsLib" TYPE FILE FILES
    "/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-orchestrator/build/livecalc-engine/livecalc-assumptions-lib/LiveCalcAssumptionsLibConfig.cmake"
    "/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-orchestrator/build/livecalc-engine/livecalc-assumptions-lib/LiveCalcAssumptionsLibConfigVersion.cmake"
    )
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  if(EXISTS "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib/cmake/LiveCalcAssumptionsLib/LiveCalcAssumptionsLibTargets.cmake")
    file(DIFFERENT _cmake_export_file_changed FILES
         "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib/cmake/LiveCalcAssumptionsLib/LiveCalcAssumptionsLibTargets.cmake"
         "/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-orchestrator/build/livecalc-engine/livecalc-assumptions-lib/CMakeFiles/Export/1ffea90bd68635a54f48e94ceee5f3a0/LiveCalcAssumptionsLibTargets.cmake")
    if(_cmake_export_file_changed)
      file(GLOB _cmake_old_config_files "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib/cmake/LiveCalcAssumptionsLib/LiveCalcAssumptionsLibTargets-*.cmake")
      if(_cmake_old_config_files)
        string(REPLACE ";" ", " _cmake_old_config_files_text "${_cmake_old_config_files}")
        message(STATUS "Old export file \"$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib/cmake/LiveCalcAssumptionsLib/LiveCalcAssumptionsLibTargets.cmake\" will be replaced.  Removing files [${_cmake_old_config_files_text}].")
        unset(_cmake_old_config_files_text)
        file(REMOVE ${_cmake_old_config_files})
      endif()
      unset(_cmake_old_config_files)
    endif()
    unset(_cmake_export_file_changed)
  endif()
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/lib/cmake/LiveCalcAssumptionsLib" TYPE FILE FILES "/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-orchestrator/build/livecalc-engine/livecalc-assumptions-lib/CMakeFiles/Export/1ffea90bd68635a54f48e94ceee5f3a0/LiveCalcAssumptionsLibTargets.cmake")
  if(CMAKE_INSTALL_CONFIG_NAME MATCHES "^([Dd][Ee][Bb][Uu][Gg])$")
    file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/lib/cmake/LiveCalcAssumptionsLib" TYPE FILE FILES "/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-orchestrator/build/livecalc-engine/livecalc-assumptions-lib/CMakeFiles/Export/1ffea90bd68635a54f48e94ceee5f3a0/LiveCalcAssumptionsLibTargets-debug.cmake")
  endif()
endif()

string(REPLACE ";" "\n" CMAKE_INSTALL_MANIFEST_CONTENT
       "${CMAKE_INSTALL_MANIFEST_FILES}")
if(CMAKE_INSTALL_LOCAL_ONLY)
  file(WRITE "/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-orchestrator/build/livecalc-engine/livecalc-assumptions-lib/install_local_manifest.txt"
     "${CMAKE_INSTALL_MANIFEST_CONTENT}")
endif()
