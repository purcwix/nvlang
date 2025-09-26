cmake_minimum_required(VERSION 3.15)
project(ncurses)

set(CMAKE_CXX_STANDARD 17)

include_directories(${CMAKE_JS_INC})
include_directories(${CMAKE_SOURCE_DIR}/node_modules/node-addon-api)

file(GLOB SOURCE_FILES "src/*.cpp")

# Try to find ncursesw first, then ncurses
find_library(NCURSES_LIB NAMES ncursesw ncurses)

if (NOT NCURSES_LIB)
    message(FATAL_ERROR "Neither ncursesw nor ncurses could be found on your system")
endif()

add_library(${PROJECT_NAME} SHARED ${SOURCE_FILES} ${CMAKE_JS_SRC})

set_target_properties(${PROJECT_NAME} PROPERTIES PREFIX "" SUFFIX ".node")

target_link_libraries(${PROJECT_NAME} ${CMAKE_JS_LIB} ${NCURSES_LIB})
