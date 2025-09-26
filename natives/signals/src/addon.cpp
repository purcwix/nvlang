#include <napi.h>
#include <signal.h>
#include <map>
#include <string>
#include <unistd.h>

std::map<int, Napi::FunctionReference> signalHandlers;

void nativeHandler(int sig) {
    auto it = signalHandlers.find(sig);
    if (it != signalHandlers.end()) {
        it->second.Call({ Napi::Number::New(it->second.Env(), sig) });
    }
}

Napi::Value raiseSignal(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Expected signal number").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    int sig = info[0].As<Napi::Number>().Int32Value();
    raise(sig);
    return env.Undefined();
}

Napi::Value catchSignal(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsFunction()) {
        Napi::TypeError::New(env, "Expected signal number and callback").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    int sig = info[0].As<Napi::Number>().Int32Value();
    Napi::Function cb = info[1].As<Napi::Function>();
    signalHandlers[sig] = Napi::Persistent(cb);
    signal(sig, nativeHandler);

    return env.Undefined();
}

Napi::Value sendSignal(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) {
        Napi::TypeError::New(env, "Expected pid and signal number").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    pid_t pid = info[0].As<Napi::Number>().Int32Value();
    int sig = info[1].As<Napi::Number>().Int32Value();
    kill(pid, sig);

    return env.Undefined();
}

Napi::Object getFaults(Napi::Env env) {
    Napi::Object faults = Napi::Object::New(env);
    faults.Set("SIGSEGV", Napi::Number::New(env, SIGSEGV));
    faults.Set("SIGFPE",  Napi::Number::New(env, SIGFPE));
    faults.Set("SIGILL",  Napi::Number::New(env, SIGILL));
    faults.Set("SIGABRT", Napi::Number::New(env, SIGABRT));
    faults.Set("SIGBUS",  Napi::Number::New(env, SIGBUS));
    faults.Set("SIGUSR1", Napi::Number::New(env, SIGUSR1));
    faults.Set("SIGUSR2", Napi::Number::New(env, SIGUSR2));
    faults.Set("SIGINT",  Napi::Number::New(env, SIGINT));
    faults.Set("SIGTERM", Napi::Number::New(env, SIGTERM));
    return faults;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("raise", Napi::Function::New(env, raiseSignal));
    exports.Set("catch", Napi::Function::New(env, catchSignal));
    exports.Set("send",  Napi::Function::New(env, sendSignal));
    exports.Set("faults",      getFaults(env));
    return exports;
}

NODE_API_MODULE(signal_addon, Init)
