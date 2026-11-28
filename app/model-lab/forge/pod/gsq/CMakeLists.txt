# x_dump (26 Nov 2026): built inside a llama.cpp b12359 tree by pod/gsq/build.sh
set(TARGET x_dump)
add_executable(${TARGET} x_dump.cpp)
target_link_libraries(${TARGET} PRIVATE llama-common llama ggml ${CMAKE_THREAD_LIBS_INIT})
target_compile_features(${TARGET} PRIVATE cxx_std_17)
