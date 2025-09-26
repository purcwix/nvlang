cmake_minimum_required(VERSION 3.15)
project(pointer-addon)

set(CMAKE_CXX_STANDARD 17)

# Node / N-API includes
include_directories(${CMAKE_JS_INC})
include_directories(${CMAKE_SOURCE_DIR}/node_modules/node-addon-api)

# --- Python detection (cross platform) ---
# REQUIRED means CMake errors if Python3 isn't found
find_package(Python3 COMPONENTS Interpreter Development REQUIRED)

if(NOT Python3_FOUND)
    message(FATAL_ERROR "Python3 (with dev headers) not found. Please install python3-dev / python3-devel.")
endif()

message(STATUS "Found Python: ${Python3_EXECUTABLE}")
message(STATUS "Python includes: ${Python3_INCLUDE_DIRS}")
message(STATUS "Python libs: ${Python3_LIBRARIES}")

include_directories(${Python3_INCLUDE_DIRS})
link_libraries(${Python3_LIBRARIES})

# Sources
file(GLOB SOURCE_FILES "src/*.cpp")

# Build shared addon
add_library(${PROJECT_NAME} SHARED ${SOURCE_FILES} ${CMAKE_JS_SRC})

set_target_properties(${PROJECT_NAME} PROPERTIES PREFIX "" SUFFIX ".node")

target_link_libraries(${PROJECT_NAME} ${CMAKE_JS_LIB})
