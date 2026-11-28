// Bob for Android's door to the phone brain: the JNI calls Llama.kt makes, each passed straight to bob_brain.cpp
// (shared with Bob for iPhone). Strings cross JNI as UTF-8 byte arrays, because Java's "modified UTF-8" mangles emoji.
#include <jni.h>

#include <string>

#include "bob_brain.h"

static std::string bytes_in(JNIEnv * env, jbyteArray a) {
    if (!a) return {};
    const jsize n = env->GetArrayLength(a);
    std::string s((size_t) n, '\0');
    if (n > 0) env->GetByteArrayRegion(a, 0, n, reinterpret_cast<jbyte *>(&s[0]));
    return s;
}

static jbyteArray bytes_out(JNIEnv * env, const std::string & s) {
    jbyteArray a = env->NewByteArray((jsize) s.size());
    if (a && !s.empty()) env->SetByteArrayRegion(a, 0, (jsize) s.size(), reinterpret_cast<const jbyte *>(s.data()));
    return a;
}

// A string from bob_brain (or NULL) as a byte array (or null), freed here.
static jbyteArray take(JNIEnv * env, char * s) {
    if (!s) return nullptr;
    jbyteArray a = bytes_out(env, std::string(s));
    bob_brain_free(s);
    return a;
}

extern "C" JNIEXPORT void JNICALL
Java_ca_mousewurx_bob_Llama_nativeInit(JNIEnv * env, jobject, jbyteArray libDir) {
    bob_brain_init(bytes_in(env, libDir).c_str());
}

extern "C" JNIEXPORT jint JNICALL
Java_ca_mousewurx_bob_Llama_nativeLoad(JNIEnv * env, jobject, jbyteArray path, jint nCtx, jint threads) {
    return bob_brain_load(bytes_in(env, path).c_str(), nCtx, threads, -1);
}

extern "C" JNIEXPORT void JNICALL
Java_ca_mousewurx_bob_Llama_nativeUnload(JNIEnv *, jobject) { bob_brain_unload(); }

extern "C" JNIEXPORT void JNICALL
Java_ca_mousewurx_bob_Llama_nativeAbort(JNIEnv *, jobject, jboolean on) { bob_brain_abort(on == JNI_TRUE ? 1 : 0); }

extern "C" JNIEXPORT jbyteArray JNICALL
Java_ca_mousewurx_bob_Llama_nativeStart(JNIEnv * env, jobject, jbyteArray messages, jbyteArray tools,
                                        jint maxNew, jfloat temp, jboolean think) {
    return take(env, bob_brain_start(bytes_in(env, messages).c_str(), bytes_in(env, tools).c_str(), maxNew, temp, think == JNI_TRUE ? 1 : 0));
}

extern "C" JNIEXPORT jint JNICALL
Java_ca_mousewurx_bob_Llama_nativeIngest(JNIEnv *, jobject, jint maxTokens) { return bob_brain_ingest(maxTokens); }

extern "C" JNIEXPORT jbyteArray JNICALL
Java_ca_mousewurx_bob_Llama_nativeNext(JNIEnv * env, jobject) { return take(env, bob_brain_next()); }

extern "C" JNIEXPORT jbyteArray JNICALL
Java_ca_mousewurx_bob_Llama_nativeFinish(JNIEnv * env, jobject) { return take(env, bob_brain_finish()); }

extern "C" JNIEXPORT jbyteArray JNICALL
Java_ca_mousewurx_bob_Llama_nativeBench(JNIEnv * env, jobject, jint pp, jint tg) { return take(env, bob_brain_bench(pp, tg)); }
