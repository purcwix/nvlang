#include <napi.h>
using namespace std;

Napi::Value Clear(const Napi::CallbackInfo& info) {
system("clear");
return info.Env().Undefined();
}
Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set("clear", Napi::Function::New(env, Clear));
    return exports;
}

NODE_API_MODULE(dingles_addon, Init)
