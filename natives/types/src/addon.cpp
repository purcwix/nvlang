#include <napi.h>
#include <typeinfo>
#include <cxxabi.h>
#include <cstdlib>
#include <string>
#include <variant>
#include <unordered_map>
#include <memory>

using namespace Napi;

// Runtime dynamic type registry
struct TypeInfoData {
    size_t size;
    size_t alignment;
};
std::unordered_map<std::string, TypeInfoData> dynamicTypes;

// Demangle helper
std::string demangle(const char* name) {
    int status = 0;
    char* demangled = abi::__cxa_demangle(name, nullptr, nullptr, &status);
    std::string result = (status == 0 && demangled) ? demangled : name;
    free(demangled);
    return result;
}

// Variant type holder
using AnyType = std::variant<int, double, bool, std::string, int64_t, float, char, void*>;

class TypedValue : public ObjectWrap<TypedValue> {
public:
    static FunctionReference constructor;
    static Object Init(Napi::Env env, Object exports);
    TypedValue(const CallbackInfo& info);

private:
    AnyType value;
    std::string typeName;
    size_t fixedSize = 0;
    size_t alignment = 0;

    Napi::Value SizeOf(const CallbackInfo& info);
    Napi::Value AlignOf(const CallbackInfo& info);
    Napi::Value TypeOf(const CallbackInfo& info);
    Napi::Value IsPolymorphic(const CallbackInfo& info);
};

FunctionReference TypedValue::constructor;

TypedValue::TypedValue(const CallbackInfo& info) : ObjectWrap<TypedValue>(info) {
    Napi::Env env = info.Env();

    if (info.Length() < 2) {
        TypeError::New(env, "Expected type name and value").ThrowAsJavaScriptException();
        return;
    }

    typeName = info[0].As<Napi::String>().Utf8Value();

    // Check dynamic types first
    auto it = dynamicTypes.find(typeName);
    if (it != dynamicTypes.end()) {
        fixedSize = it->second.size;
        alignment = it->second.alignment;
        value = nullptr; // placeholder
        return;
    }

    if (typeName == "int") value = info[1].As<Napi::Number>().Int32Value();
    else if (typeName == "double") value = info[1].As<Napi::Number>().DoubleValue();
    else if (typeName == "bool") value = info[1].As<Napi::Boolean>().Value();
    else if (typeName == "string") value = info[1].As<Napi::String>().Utf8Value();
    else if (typeName == "bigint") {
        bool lossless;
        value = info[1].As<Napi::BigInt>().Int64Value(&lossless);
    }
    else if (typeName == "float") value = static_cast<float>(info[1].As<Napi::Number>().DoubleValue());
    else if (typeName == "char") value = static_cast<char>(info[1].As<Napi::Number>().Int32Value());
    else TypeError::New(env, "Unknown type").ThrowAsJavaScriptException();
}

Napi::Value TypedValue::SizeOf(const CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (fixedSize != 0) return Napi::Number::New(env, fixedSize);
    return Napi::Number::New(env, std::visit([](auto&& v) -> size_t { return sizeof(v); }, value));
}

Napi::Value TypedValue::AlignOf(const CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (alignment != 0) return Napi::Number::New(env, alignment);
    return Napi::Number::New(env, std::visit([](auto&& v) -> size_t { return alignof(std::decay_t<decltype(v)>); }, value));
}

Napi::Value TypedValue::TypeOf(const CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (fixedSize != 0) return Napi::String::New(env, typeName);
    return Napi::String::New(env, std::visit([](auto&& v) -> std::string { return demangle(typeid(v).name()); }, value));
}

Napi::Value TypedValue::IsPolymorphic(const CallbackInfo& info) {
    Napi::Env env = info.Env();
    bool isPoly = false;
    std::visit([&](auto&& v) { isPoly = std::is_polymorphic_v<std::decay_t<decltype(v)>>; }, value);
    return Napi::Boolean::New(env, isPoly);
}

// Class init
Object TypedValue::Init(Napi::Env env, Object exports) {
    Napi::Function func = DefineClass(env, "TypedValue", {
        InstanceMethod("sizeof", &TypedValue::SizeOf),
        InstanceMethod("alignof", &TypedValue::AlignOf),
        InstanceMethod("type", &TypedValue::TypeOf),
        InstanceMethod("isPolymorphic", &TypedValue::IsPolymorphic)
    });

    constructor = Napi::Persistent(func);
    constructor.SuppressDestruct();
    exports.Set("TypedValue", func);
    return exports;
}

// Helper functions
Object MakeHelpers(Napi::Env env) {
    Napi::Object types = Napi::Object::New(env);

    auto makeFn = [env](const std::string& typeName) {
        return Napi::Function::New(env, [typeName](const CallbackInfo& info) {
            Napi::Env env = info.Env();
            // Use the stored constructor
            Napi::Function ctor = TypedValue::constructor.Value();
            return ctor.New({ Napi::String::New(env, typeName), info[0] });
        });
    };

    // Standard types
    types.Set("int", makeFn("int"));
    types.Set("double", makeFn("double"));
    types.Set("float", makeFn("float"));
    types.Set("bool", makeFn("bool"));
    types.Set("string", makeFn("string"));
    types.Set("bigint", makeFn("bigint"));
    types.Set("char", makeFn("char"));

    // addType(name, size, align)
    types.Set("addType", Napi::Function::New(env, [](const CallbackInfo& info) {
        Napi::Env env = info.Env();
        if (info.Length() < 2)
            Napi::TypeError::New(env, "Expected type name and size").ThrowAsJavaScriptException();
        std::string name = info[0].As<Napi::String>().Utf8Value();
        size_t size = info[1].As<Napi::Number>().Int64Value();
        size_t alignment = (info.Length() >= 3) ? info[2].As<Napi::Number>().Int64Value() : 1;
        dynamicTypes[name] = { size, alignment };
        return env.Undefined();
    }));

    return types;
}

Object InitAll(Napi::Env env, Object exports) {
    TypedValue::Init(env, exports);
    exports.Set("types", MakeHelpers(env));
    return exports;
}

NODE_API_MODULE(cpp_types, InitAll)
