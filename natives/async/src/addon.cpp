#include <napi.h>
#include <condition_variable>
#include <mutex>

struct AwaitData {
    std::mutex mtx;
    std::condition_variable cv;
    bool done = false;
    Napi::Reference<Napi::Value> result;
    bool isError = false;
};

// AwaitBlock implementation
Napi::Value AwaitBlock(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1) {
        Napi::TypeError::New(env, "Need at least one argument").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Value input = info[0];
    Napi::Value promiseVal;

    if (input.IsPromise()) {
        // Case 1: directly a Promise
        promiseVal = input;
    } else if (input.IsFunction()) {
        // Case 2: a function -> call it with args
        Napi::Function fn = input.As<Napi::Function>();
        std::vector<napi_value> args;
        for (size_t i = 1; i < info.Length(); i++) {
            args.push_back(info[i]);
        }
        promiseVal = fn.Call(env.Global(), args);
        if (!promiseVal.IsPromise()) {
            // If function returned non-promise, just return
            return promiseVal;
        }
    } else {
        // Case 3: plain value
        return input;
    }

    // Now we have a Promise
    Napi::Promise promise = promiseVal.As<Napi::Promise>();
    auto* data = new AwaitData();

    // Attach then/catch
    promise.Then(
        Napi::Function::New(env, [data](const Napi::CallbackInfo& cbInfo) {
            std::unique_lock<std::mutex> lock(data->mtx);
            data->result = Napi::Persistent(cbInfo[0]);
            data->done = true;
            data->cv.notify_one();
            return cbInfo.Env().Undefined();
        }),
        Napi::Function::New(env, [data](const Napi::CallbackInfo& cbInfo) {
            std::unique_lock<std::mutex> lock(data->mtx);
            data->result = Napi::Persistent(cbInfo[0]);
            data->isError = true;
            data->done = true;
            data->cv.notify_one();
            return cbInfo.Env().Undefined();
        })
    );

    // Block until promise resolves
    std::unique_lock<std::mutex> lock(data->mtx);
    while (!data->done) {
        data->cv.wait(lock);
    }

    Napi::Value res = data->result.Value();
    bool isErr = data->isError;
    delete data;

    if (isErr) {
        Napi::Error::New(env, res.ToString()).ThrowAsJavaScriptException();
        return env.Null();
    }

    return res;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("awaitBlock", Napi::Function::New(env, AwaitBlock));
    return exports;
}

NODE_API_MODULE(awaitblock, Init)
