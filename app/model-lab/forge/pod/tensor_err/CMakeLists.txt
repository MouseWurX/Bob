# tensor_err (26 Nov 2026): built inside a llama.cpp b12359 tree by pod/tensor_err/build.sh
set(TARGET tensor_err)
add_executable(${TARGET} tensor_err.cpp)
target_link_libraries(${TARGET} PRIVATE llama-common ggml ${CMAKE_THREAD_LIBS_INIT})
target_compile_features(${TARGET} PRIVATE cxx_std_17)
