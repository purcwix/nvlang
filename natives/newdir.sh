#/bin/bash
cp ./utils -r ./"$1"

rm -rf ./"$1"/CMakeLists.txt

echo 'cmake_minimum_required(VERSION 3.15)
project('"$2"')

set(CMAKE_CXX_STANDARD 17)

include_directories(${CMAKE_JS_INC})
# 👇 Add node-addon-api include path
include_directories(${CMAKE_SOURCE_DIR}/node_modules/node-addon-api)

file(GLOB SOURCE_FILES "src/*.cpp")

add_library(${PROJECT_NAME} SHARED ${SOURCE_FILES} ${CMAKE_JS_SRC})

set_target_properties(${PROJECT_NAME} PROPERTIES PREFIX "" SUFFIX ".node")

target_link_libraries(${PROJECT_NAME} ${CMAKE_JS_LIB})
" >> ./"$1"/CMakeLists.txt

rm -rf ./"$1"/index.js
echo "const addon = require('bindings')('$2');

module.exports = addon
' >> ./"$1"/index.js

rm -rf ./"$1"/src/addon.cpp
echo "
#include <napi.h>
using namespace std;

// your values here..
Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set("undefined", env.Undefined());
    return exports;
}

NODE_API_MODULE($2_addon, Init)
" >> src/addon.cpp
