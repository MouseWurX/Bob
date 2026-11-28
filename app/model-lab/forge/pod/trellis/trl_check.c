// trl_check.c: the decode loop of Lamplight 0136's ggml_trellis_decode_rows (ggml/src/ggml-trellis.cpp), copied as is
// with fp16 scales replaced by float, so the tests can check trl_codec.py's words against the engine's own reading.
// usage: trl_check <k> <K> <N> <words.u32> <s16.f32> <out.f32>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
int main(int argc, char ** argv) {
    if (argc != 7) return 2;
    const int k = atoi(argv[1]); const long K = atol(argv[2]), N = atol(argv[3]);
    const int nw = 8 * k, total = 256 * k; const long kt = K / 16;
    uint32_t * words = malloc(N / 16 * kt * nw * 4); float * s16 = malloc(kt * 4); float * out = malloc(N * K * 4);
    FILE * f = fopen(argv[4], "rb"); fread(words, 4, N / 16 * kt * nw, f); fclose(f);
    f = fopen(argv[5], "rb"); fread(s16, 4, kt, f); fclose(f);
    for (long J = 0; J < N / 16; ++J) for (long i = 0; i < kt; ++i) {
        const uint32_t * t = words + (J * kt + i) * nw; const float s = s16[i];
        for (int p = 0; p < 256; ++p) {
            const int start = ((p + 1) * k - 16 + total) % total; const int w = start >> 5, o = start & 31;
            const uint64_t pair = ((uint64_t) t[w] << 32) | t[(w + 1) % nw];
            const uint32_t state = (uint32_t) (pair >> (48 - o)) & 0xFFFFu; const uint32_t x = state * 0x83DCD12Du;
            const int v = (int) (((x >> 2) & 63) + ((x >> 10) & 63) + ((x >> 18) & 63) + ((x >> 26) & 63)) - 126;
            const int a = p >> 3, jj = p & 7; const int row = (a >> 2) + 8 * ((jj >> 2) & 1); const int col = 2 * (a & 3) + (jj & 1) + 8 * ((jj >> 1) & 1);
            out[(16 * J + row) * K + 16 * i + col] = (float) v * s;
        }
    }
    f = fopen(argv[6], "wb"); fwrite(out, 4, N * K, f); fclose(f); return 0;
}
