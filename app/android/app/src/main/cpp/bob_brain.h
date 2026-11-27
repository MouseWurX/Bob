// Bob's phone brain, as plain C calls (bob_brain.cpp over llama.cpp). Shared by Bob for Android (bob_llama.cpp, the
// JNI side for Llama.kt) and Bob for iPhone (ios/Bob/Brain.swift). One conversation and one thread at a time;
// only bob_brain_abort may be called from another thread. Strings are UTF-8. A char * handed back is the caller's:
// free it with bob_brain_free.
#pragma once

#ifdef __cplusplus
extern "C" {
#endif

// Loads the engine's parts: from lib_dir (Android's native library folder), or the built-in ones when NULL or "".
void   bob_brain_init(const char * lib_dir);
// 0 ok, 1 the brain file didn't open, 2 no room for its memory, 3 no engine to run it on.
// gpu_layers: -1 leaves it to llama.cpp, 0 keeps it all on the processor (the iPhone simulator), N puts N layers on the graphics.
int    bob_brain_load(const char * path, int n_ctx, int threads, int gpu_layers);
void   bob_brain_unload(void);
void   bob_brain_abort(int on);
// messages and tools: OpenAI-style JSON arrays. Answers JSON {tokens, reused, todo} or {error, tokens?, ctx?}.
char * bob_brain_start(const char * messages, const char * tools, int max_new, float temp, int think);
// Reads up to max_tokens more of the chat. Answers how many are still to read (0: ready to write), or -1.
int    bob_brain_ingest(int max_tokens);
// The next bit of reply text ("" while a tool call is being written), or NULL when the reply is over.
char * bob_brain_next(void);
// The finished reply: JSON {content, reasoning, tool_calls: [{name, arguments}], tokens, stop}.
char * bob_brain_finish(void);
// Speed test on the loaded brain: JSON {pp, tg} in tokens a second, or {error}.
char * bob_brain_bench(int pp, int tg);
void   bob_brain_free(char * s);

#ifdef __cplusplus
}
#endif
