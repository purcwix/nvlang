#include <napi.h>
#include <iostream>
#include <sstream>
#include <string>
#include <thread>
#include <chrono>
using namespace std;

Napi::Value Sleep(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    int time = info[0].As<Napi::Number>().Int64Value();
    this_thread::sleep_for(chrono::milliseconds(time));
    return Napi::Number::New(env, time);
}

Napi::Value Printer(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    string message = info[0].As<Napi::String>().Utf8Value();
    cout << message << endl;
    return Napi::String::New(env, message);
}

Napi::Value Prompt(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    string val;
    cin >> val;
    return Napi::Value::From(env, val);
}

Napi::Value Clear(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
#ifdef _WIN32
    system("cls");
#else
    system("clear");
#endif
    return Napi::Boolean::New(env, true);
}

Napi::Value Exit(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    int code = info[0].As<Napi::Number>().Int64Value();
    exit(code);
    return Napi::Number::New(env, code);
}
#include <mutex>
#include <condition_variable>

Napi::Value AwaitSync(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsObject() || !info[0].As<Napi::Object>().Has("then"))
    {
        Napi::TypeError::New(env, "Argument must be a Promise").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    Napi::Promise promise = info[0].As<Napi::Promise>();

    // Mutex and condition variable to block the thread
    std::mutex mtx;
    std::condition_variable cv;
    bool completed = false;
    Napi::Value result = env.Undefined();
    Napi::Value error = env.Undefined();

    // The deferred callback is used to resolve/reject the internal promise
    Napi::Reference<Napi::Promise> wrappedPromiseRef = Napi::Persistent(promise);

    // Callbacks for promise resolution/rejection
    auto onFulfilled = [&](const Napi::CallbackInfo &info)
    {
        std::lock_guard<std::mutex> lock(mtx);
        // Get the first argument from the callback info
        result = info[0];
        completed = true;
        cv.notify_one();
    };

    auto onRejected = [&](const Napi::CallbackInfo &info)
    {
        std::lock_guard<std::mutex> lock(mtx);
        // Get the first argument from the callback info
        error = info[0];
        completed = true;
        cv.notify_one();
    };

    // Attach callbacks to the promise
    promise.As<Napi::Object>().Set("then", Napi::Function::New(env, onFulfilled));
    promise.As<Napi::Object>().Set("catch", Napi::Function::New(env, onRejected));

    // The blocking loop
    {
        std::unique_lock<std::mutex> lock(mtx);
        cv.wait(lock, [&]
                { return completed; });
    }

    // Clean up the persistent reference
    wrappedPromiseRef.Unref();

    // Check if an error occurred and throw it
    if (!error.IsUndefined())
    {
        Napi::Error jsError = error.As<Napi::Error>();
        jsError.ThrowAsJavaScriptException();
    }

    return result;
}
Napi::Value Sstream(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    // Check if the first argument is a string. If not, throw a TypeError.
    if (info.Length() < 1 || !info[0].IsString())
    {
        Napi::TypeError::New(env, "String argument expected").ThrowAsJavaScriptException();
        return env.Null();
    }

    // Get the string from the Node.js argument.
    std::string initial_str = info[0].As<Napi::String>().Utf8Value();

    // Create a new stringstream and initialize it with the input string.
    auto *strm_ptr = new std::stringstream(initial_str);

    // Create a JavaScript object to hold the methods and the stream pointer.
    Napi::Object obj = Napi::Object::New(env);

    // Wrap the C++ stringstream pointer in an external object.
    // The finalizer ensures the C++ object is deleted when the JS object is garbage collected.
    Napi::External<std::stringstream> external = Napi::External<std::stringstream>::New(
        env,
        strm_ptr,
        [](Napi::Env /*env*/, std::stringstream *data)
        {
            delete data;
        });

    // Attach the external pointer to the JavaScript object for later access.
    obj.Set("data", external);

    // Create and attach the 'read' method.
    obj.Set("read", Napi::Function::New(env, [](const Napi::CallbackInfo &info)
                                        {
        Napi::Env env_read = info.Env();
        Napi::Object this_obj = info.This().As<Napi::Object>();
        auto* strm = this_obj.Get("data").As<Napi::External<std::stringstream>>().Data();
        std::string buffer;
        *strm >> buffer;
        return Napi::String::New(env_read, buffer); }));

    // Create and attach the 'write' method.
    obj.Set("write", Napi::Function::New(env, [](const Napi::CallbackInfo &info)
                                         {
        Napi::Env env_write = info.Env();
        if (info.Length() < 1 || !info[0].IsString()) {
            Napi::TypeError::New(env_write, "String argument expected").ThrowAsJavaScriptException();
            return env_write.Undefined();
        }
        Napi::Object this_obj = info.This().As<Napi::Object>();
        auto* strm = this_obj.Get("data").As<Napi::External<std::stringstream>>().Data();
        std::string write_str = info[0].As<Napi::String>().Utf8Value();
        *strm << " " << write_str; // Add a space for proper word separation
        return env_write.Undefined(); }));

    // Create and attach the 'str' method to get the current content of the stream.
    obj.Set("str", Napi::Function::New(env, [](const Napi::CallbackInfo &info)
                                       {
        Napi::Env env_str = info.Env();
        Napi::Object this_obj = info.This().As<Napi::Object>();
        auto* strm = this_obj.Get("data").As<Napi::External<std::stringstream>>().Data();
        return Napi::String::New(env_str, strm->str()); }));

    return obj;
}

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set("sleep", Napi::Function::New(env, Sleep));
    exports.Set("print", Napi::Function::New(env, Printer));
    exports.Set("prompt", Napi::Function::New(env, Prompt));
    exports.Set("clear", Napi::Function::New(env, Clear));
    exports.Set("exit", Napi::Function::New(env, Exit));
    exports.Set("awaitSync", Napi::Function::New(env, AwaitSync));
    exports.Set("sstream", Napi::Function::New(env, Sstream));
    return exports;
}

NODE_API_MODULE(utils_addon, Init)
