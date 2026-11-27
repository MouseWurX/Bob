#!/usr/bin/env bash
# Bob for iPhone's brain engine: llama.cpp at the commit in android/llama.cpp.pin (the same one Bob for Android uses,
# fetched by android/tools/fetch-llama.sh), built for iPhones (Metal graphics) and the iPhone simulator, each as one
# static library: ios/build/engine/<iphoneos|iphonesimulator>/libbobengine.a. Flags follow llama.cpp's own
# build-xcframework.sh. Run from app/ios on a Mac with Xcode and CMake.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=../android/third_party/llama.cpp
[ -f "$SRC/CMakeLists.txt" ] || sh ../android/tools/fetch-llama.sh
MIN=16.4
for sdk in iphoneos iphonesimulator; do
  B=build/engine-$sdk
  cmake -S "$SRC" -B "$B" -G Xcode \
    -DCMAKE_SYSTEM_NAME=iOS -DCMAKE_OSX_SYSROOT=$sdk -DCMAKE_OSX_ARCHITECTURES=arm64 \
    -DCMAKE_OSX_DEPLOYMENT_TARGET=$MIN -DCMAKE_XCODE_ATTRIBUTE_SUPPORTED_PLATFORMS=$sdk \
    -DCMAKE_XCODE_ATTRIBUTE_CODE_SIGNING_ALLOWED=NO -DCMAKE_XCODE_ATTRIBUTE_CODE_SIGNING_REQUIRED=NO \
    -DBUILD_SHARED_LIBS=OFF -DLLAMA_BUILD_COMMON=ON -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_BUILD_TOOLS=OFF \
    -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_SERVER=OFF -DLLAMA_BUILD_APP=OFF -DLLAMA_BUILD_MTMD=OFF \
    -DLLAMA_BUILD_UI=OFF -DLLAMA_USE_PREBUILT_UI=OFF -DLLAMA_CURL=OFF -DLLAMA_OPENSSL=OFF \
    -DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON -DGGML_METAL_TARGET_OS=ios -DGGML_BLAS_DEFAULT=ON \
    -DGGML_NATIVE=OFF -DGGML_OPENMP=OFF \
    -DCMAKE_C_FLAGS="-Wno-macro-redefined -Wno-shorten-64-to-32 -Wno-unused-command-line-argument" \
    -DCMAKE_CXX_FLAGS="-Wno-macro-redefined -Wno-shorten-64-to-32 -Wno-unused-command-line-argument"
  cmake --build "$B" --config Release -j "$(sysctl -n hw.logicalcpu)" -- -quiet
  mkdir -p build/engine/$sdk
  libs=$(find "$B" -path "*Release-$sdk*" -name '*.a' | sort)
  echo "$sdk libraries:"; echo "$libs"
  libtool -static -o build/engine/$sdk/libbobengine.a $libs
done
ls -la build/engine/*/
