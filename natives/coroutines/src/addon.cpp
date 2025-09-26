#include <napi.h>
#include <coroutine>
#include <thread>
#include <chrono>

struct Task {
    struct promise_type {
        int value;
        Task get_return_object() {
            return Task{ std::coroutine_handle<promise_type>::from_promise(*this) };
        }
        std::suspend_never initial_suspend() { return {}; }
        std::suspend_never final_suspend() noexcept { return {}; }
        void return_value(int v) { value = v; }
        void unhandled_exception() { std::terminate(); }
    };

    std::coroutine_handle<promise_type> coro;

    ~Task() { if (coro) coro.destroy(); }

    int get() { return coro.promise().value; }
};

// Example coroutine
Task addAsync(int a, int b) {
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    co_return a + b;
}

// Node wrapper
Napi::Value asyncAdd(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    int a = info[0].As<Napi::Number>().Int32Value();
    int b = info[1].As<Napi::Number>().Int32Value();

    auto deferred = Napi::Promise::Deferred::New(env);

    // Run coroutine in a separate thread
    std::thread([a,b,deferred]() mutable {
        auto t = addAsync(a, b);
        deferred.Resolve(Napi::Number::New(deferred.Env(), t.get()));
    }).detach();

    return deferred.Promise();
}

// Register addon
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("addAsync", Napi::Function::New(env, asyncAdd));
    return exports;
}

NODE_API_MODULE(coroutines_addon, Init)
