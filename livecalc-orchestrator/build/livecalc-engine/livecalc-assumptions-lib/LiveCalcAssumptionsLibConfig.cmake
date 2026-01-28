
####### Expanded from @PACKAGE_INIT@ by configure_package_config_file() #######
####### Any changes to this file will be overwritten by the next CMake run ####
####### The input file was LiveCalcAssumptionsLibConfig.cmake.in                            ########

get_filename_component(PACKAGE_PREFIX_DIR "${CMAKE_CURRENT_LIST_DIR}/../../../" ABSOLUTE)

macro(set_and_check _var _file)
  set(${_var} "${_file}")
  if(NOT EXISTS "${_file}")
    message(FATAL_ERROR "File or directory ${_file} referenced by variable ${_var} does not exist !")
  endif()
endmacro()

macro(check_required_components _NAME)
  foreach(comp ${${_NAME}_FIND_COMPONENTS})
    if(NOT ${_NAME}_${comp}_FOUND)
      if(${_NAME}_FIND_REQUIRED_${comp})
        set(${_NAME}_FOUND FALSE)
      endif()
    endif()
  endforeach()
endmacro()

####################################################################################

include(CMakeFindDependencyMacro)

# Find required dependencies
find_dependency(CURL REQUIRED)

if(NOT TARGET nlohmann_json::nlohmann_json)
    find_package(nlohmann_json 3.2.0 QUIET)
    if(NOT nlohmann_json_FOUND)
        message(STATUS "nlohmann_json not found, will be fetched by downstream projects")
    endif()
endif()

# Include targets file
include("${CMAKE_CURRENT_LIST_DIR}/LiveCalcAssumptionsLibTargets.cmake")

check_required_components(LiveCalcAssumptionsLib)
