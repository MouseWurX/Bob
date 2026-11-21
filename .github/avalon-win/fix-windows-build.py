# Build-only fixes so plain Avalon's CUDA files compile on Windows, where nvcc must use Microsoft's compiler (MSVC) as
# its host. Avalon is written and tested with GCC/Clang on Linux; MSVC rejects a few GCC-only spellings. Nothing here
# changes what the engine does on an NVIDIA card: every change either spells the same thing the MSVC way, or swaps a
# type that only AMD (RDNA3, HIP) code uses for a stand-in on this build. Prints every change it makes.
import pathlib, re, sys

root = pathlib.Path(sys.argv[1]) / 'ggml' / 'src' / 'ggml-cuda'
changes = []

def edit(name, fn):
    p = root / name
    old = p.read_text(encoding='utf-8')
    new = fn(old)
    if new == old:
        sys.exit(f'fix-windows-build: nothing to change in {name}: Avalon moved, recheck these fixes')
    p.write_text(new, encoding='utf-8', newline='\n')
    changes.append(name)

# 1. Grid-barrier counters: GCC's alignment attribute -> CUDA's own __align__ (same 256-byte alignment).
for name in ('mk.cu', 'qwen4-hc.cu', 'top-k.cu'):
    edit(name, lambda s: re.sub(r'static __device__ __attribute__\(\(aligned\((\d+)\)\)\)', r'static __device__ __align__(\1)', s))

# 2. qattn-i8.cu: the RDNA3 kernel's vector types (Clang ext_vector_type, _Float16). The kernel body is already
#    AMD-only (#if defined(GGML_USE_HIP)); on an MSVC build the types become plain stand-ins so the file parses.
def qattn(s):
    a = ('typedef _Float16 qattn_h16 __attribute__((ext_vector_type(16)));\n'
         'typedef _Float16 qattn_h2  __attribute__((ext_vector_type(2)));\n'
         'typedef float    qattn_f8  __attribute__((ext_vector_type(8)));\n')
    b = 'typedef uint32_t qattn_u4a __attribute__((ext_vector_type(4), aligned(4)));\n'
    assert a in s and b in s, 'qattn-i8.cu: typedefs not found'
    stand = ('struct qattn_h16 { float v[8]; };\nstruct qattn_h2 { float v; };\nstruct qattn_f8 { float v[8]; };\n')
    s = s.replace(a, '#if defined(GGML_USE_HIP) || !defined(_MSC_VER)\n' + a + '#else // Windows build fix: stand-ins, the kernel is AMD-only\n' + stand + '#endif\n')
    s = s.replace(b, '#if defined(GGML_USE_HIP) || !defined(_MSC_VER)\n' + b + '#else // Windows build fix\nstruct qattn_u4a { uint32_t x, y, z, w; };\n#endif\n')
    return s
edit('qattn-i8.cu', qattn)

# 3. moe-cache.cu: 15 host-side GCC atomics on pinned flags (__atomic_load_n / _store_n / _add_fetch) -> the MSVC
#    equivalents (x64 loads and stores already have acquire / release order; the add is an interlocked add).
shim = r'''// Windows build fix (not in Avalon): GCC's __atomic builtins for MSVC hosts, x64 only.
#pragma once
#if defined(_MSC_VER) && !defined(__clang__)
#include <intrin.h>
#ifndef __ATOMIC_RELAXED
#define __ATOMIC_RELAXED 0
#define __ATOMIC_CONSUME 1
#define __ATOMIC_ACQUIRE 2
#define __ATOMIC_RELEASE 3
#define __ATOMIC_ACQ_REL 4
#define __ATOMIC_SEQ_CST 5
#endif
template <typename T> static inline T avalon_win_load(const volatile T * p) { T v = *p; _ReadWriteBarrier(); return v; }
template <typename T, typename U> static inline void avalon_win_store(volatile T * p, U v) { _ReadWriteBarrier(); *p = (T) v; _ReadWriteBarrier(); }
template <typename T, typename U> static inline T avalon_win_add_fetch(volatile T * p, U v) {
    static_assert(sizeof(T) == 4, "32-bit only");
    return (T) (_InterlockedExchangeAdd((volatile long *) p, (long) v) + (long) v);
}
#define __atomic_load_n(p, o)       avalon_win_load(p)
#define __atomic_store_n(p, v, o)   avalon_win_store((p), (v))
#define __atomic_add_fetch(p, v, o) avalon_win_add_fetch((p), (v))
#endif
'''
(root / 'avalon-win-atomics.h').write_text(shim, encoding='utf-8', newline='\n')
edit('moe-cache.cu', lambda s: s.replace('#include "moe-cache.cuh"\n', '#include "moe-cache.cuh"\n#include "avalon-win-atomics.h" // Windows build fix\n', 1))
changes.append('avalon-win-atomics.h (new)')

# 4. mmvq.cu, mul_mat_vec_q: nvcc's MSVC mode loses a brace when it instantiates the template ("expected a }" at the
#    end of the function). The two constructs Avalon added there that upstream does not have: a "#pragma unroll"
#    inside an "if constexpr" block (the q8_dst write, a loop over ncols_dst, a constant the compiler unrolls anyway),
#    and an "else" whose statement is a bare switch. The pragma goes; the switch gets braces (same code).
def mmvq(s):
    a = ('                ggml_cuda_fence_acquire_device();\n#pragma unroll\n                for (int j = 0; j < ncols_dst; ++j) {\n')
    assert s.count(a) == 1, 'mmvq.cu: q8_dst loop not found'
    s = s.replace(a, '                ggml_cuda_fence_acquire_device();\n                for (int j = 0; j < ncols_dst; ++j) { // Windows build fix: no pragma inside if constexpr\n')
    b = '                        } else\n                        switch (active_glu) {\n'
    assert s.count(b) == 1, 'mmvq.cu: else switch not found'
    s = s.replace(b, '                        } else { // Windows build fix: braces\n                        switch (active_glu) {\n')
    c = ('                                result = result * gate_value;\n                                break;\n'
         '                        }\n                    }\n')
    assert s.count(c) == 1, 'mmvq.cu: switch end not found'
    s = s.replace(c, '                                result = result * gate_value;\n                                break;\n'
                     '                        }\n                        }\n                    }\n')
    return s
edit('mmvq.cu', mmvq)

print('Windows build fixes applied to:', ', '.join(changes))
