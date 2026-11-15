// SCUT alone, through engine/tests/scut-pretend-wifi.py: N round trips of a set size, then (optionally) a batch each way.
// Used for the repair-packet measurements (docs/test-results/2026-11-15-scut-repair-packets.md). Build beside scut.cpp:
//   g++ -O2 -std=c++17 -pthread -I<a folder with an empty log.h that defines LOG_INF/LOG_DBG/...> -I<ggml-rpc folder> scut-repairs.cpp scut.cpp
//   scut-repairs PORT TRIPS BATCH_BYTES THINK_US REQUEST_BYTES ANSWER_BYTES   (GGML_RPC_SCUT=1, GGML_RPC_SCUT_TEST_UDP_PORT=the pretend Wi-Fi)
#include "scut.h"
#include <arpa/inet.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <sys/socket.h>
#include <unistd.h>
#include <algorithm>
#include <chrono>
#include <cstring>
#include <thread>
#include <vector>
#include <cstdio>
#include <cstdlib>
using clk = std::chrono::steady_clock;
static double ms(clk::time_point a) { return std::chrono::duration<double, std::milli>(clk::now() - a).count(); }
static bool rd(int fd, void * p, size_t n) { char * c = (char *) p; while (n) { ssize_t r = recv(fd, c, n, 0); if (r <= 0) return false; c += r; n -= r; } return true; }
int main(int argc, char ** argv) {
    int port = atoi(argv[1]), words = atoi(argv[2]); size_t big = (size_t) atol(argv[3]); int think_us = argc > 4 ? atoi(argv[4]) : 0; uint32_t REQ = argc > 5 ? atoi(argv[5]) : 8300, RSP = argc > 6 ? atoi(argv[6]) : 8200; size_t cap = std::max<size_t>(big, std::max(REQ, RSP));
    int ls = socket(AF_INET, SOCK_STREAM, 0); int one = 1; setsockopt(ls, SOL_SOCKET, SO_REUSEADDR, &one, sizeof(one));
    sockaddr_in a = {}; a.sin_family = AF_INET; a.sin_port = htons(port); a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    if (bind(ls, (sockaddr *) &a, sizeof(a)) || listen(ls, 1)) { perror("bind"); return 2; }
    std::thread srv([&] {
        int fd = accept(ls, nullptr, nullptr); setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &one, sizeof(one));
        uint8_t theirs[24], mine[24] = {0}; rd(fd, theirs, 24);
        scut_ptr b = scut_prepare(fd, true, mine, 24); send(fd, mine, 24, 0);
        if (!b || !scut_activate(b.get(), theirs, 24)) { fprintf(stderr, "server: no SCUT (%s)\n", scut_why()); return; }
        std::vector<uint8_t> buf(cap + 16);
        for (;;) {
            uint32_t h[2]; if (!scut_recv(b.get(), h, 8)) break;
            if (!scut_recv(b.get(), buf.data(), h[0])) break;
            if (think_us) std::this_thread::sleep_for(std::chrono::microseconds(think_us));
            if (!scut_send(b.get(), buf.data(), h[1]) || !scut_flush(b.get())) break;
        }
        fprintf(stderr, "server end: %s\n", scut_note(b.get()).c_str());
    });
    int fd = socket(AF_INET, SOCK_STREAM, 0); connect(fd, (sockaddr *) &a, sizeof(a)); setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &one, sizeof(one));
    uint8_t mine[24] = {0}, theirs[24];
    scut_ptr b = scut_prepare(fd, false, mine, 24); send(fd, mine, 24, 0); rd(fd, theirs, 24);
    if (!b || !scut_activate(b.get(), theirs, 24)) { fprintf(stderr, "client: no SCUT (%s)\n", scut_why()); return 3; }
    std::vector<uint8_t> out(cap + 16, 7), in(cap + 16);
    auto trip = [&](uint32_t req, uint32_t rsp) {
        uint32_t h[2] = { req, rsp }; auto t0 = clk::now();
        if (!scut_send(b.get(), h, 8) || !scut_send(b.get(), out.data(), req) || !scut_flush(b.get()) || !scut_recv(b.get(), in.data(), rsp)) { fprintf(stderr, "link died\n"); exit(4); }
        return ms(t0);
    };
    for (int phase = 0; phase < 2; phase++) { // two halves, so tuning that settles shows in the second
        std::vector<double> t; auto t0 = clk::now();
        for (int i = 0; i < words / 2; i++) t.push_back(trip(REQ, RSP));
        double total = ms(t0), sum = 0; for (double x : t) sum += x; std::sort(t.begin(), t.end());
        printf("words %d-%d: %.1f a second; round trip mean %.2f ms, middle %.2f, 95%% %.2f, 99%% %.2f, worst %.2f\n", phase * words / 2, (phase + 1) * words / 2,
               t.size() * 1000.0 / total, sum / t.size(), t[t.size() / 2], t[t.size() * 95 / 100], t[t.size() * 99 / 100], t.back());
    }
    if (big) { double up = trip((uint32_t) big, 8); double down = trip(8, (uint32_t) big); printf("batch of %.1f MiB: there %.0f ms (%.0f Mbit/s), back %.0f ms (%.0f Mbit/s)\n", big / 1048576.0, up, big * 8 / 1e3 / up, down, big * 8 / 1e3 / down); }
    printf("client end: %s\n", scut_note(b.get()).c_str());
    b.reset(); close(fd); srv.join(); return 0;
}
