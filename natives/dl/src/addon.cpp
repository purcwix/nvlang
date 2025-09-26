#include <napi.h>
#include <dlfcn.h>
#include <map>
#include <string>
#include <vector>
#include <sstream>
#include <cmath>

using namespace Napi;

// ----------------- Type system -----------------

enum ArgType {
  ARG_INT,
  ARG_DOUBLE,
  ARG_STRING,
  ARG_POINTER
};

enum RetType {
  RET_VOID,
  RET_INT,
  RET_DOUBLE,
  RET_STRING,
  RET_POINTER
};

static ArgType parseArgType(const std::string& t) {
  if (t == "int") return ARG_INT;
  if (t == "double") return ARG_DOUBLE;
  if (t == "string") return ARG_STRING;
  return ARG_POINTER;
}

static RetType parseRetType(const std::string& t) {
  if (t == "int") return RET_INT;
  if (t == "double") return RET_DOUBLE;
  if (t == "string") return RET_STRING;
  if (t == "pointer") return RET_POINTER;
  return RET_VOID;
}

// ----------------- Generic wrapper -----------------

static Napi::Function WrapTypedSymbol(Napi::Env env, void* sym,
                                      const std::vector<ArgType>& args,
                                      RetType ret) {
  return Napi::Function::New(env, [sym, args, ret](const Napi::CallbackInfo& info) -> Napi::Value {
    Napi::Env e = info.Env();

    // Collect arguments
    std::vector<void*> cargs;
    std::vector<std::string> strHold; // keep string storage alive

    for (size_t i = 0; i < args.size(); i++) {
      switch (args[i]) {
        case ARG_INT: {
          int* v = new int(info[i].As<Napi::Number>().Int32Value());
          cargs.push_back(v);
          break;
        }
        case ARG_DOUBLE: {
          double* v = new double(info[i].As<Napi::Number>().DoubleValue());
          cargs.push_back(v);
          break;
        }
        case ARG_STRING: {
          std::string s = info[i].As<Napi::String>().Utf8Value();
          strHold.push_back(s);
          cargs.push_back((void*)strHold.back().c_str());
          break;
        }
        case ARG_POINTER: {
          // for now accept external<void> as pointer
          void* ptr = nullptr;
          if (info[i].IsExternal()) {
            ptr = info[i].As<Napi::External<void>>().Data();
          }
          cargs.push_back(ptr);
          break;
        }
      }
    }

    // Variadic trampoline: cast to different signatures based on return type
    switch (ret) {
      case RET_INT: {
        using Func = int (*)(...);
        Func f = reinterpret_cast<Func>(sym);
        return Napi::Number::New(e, f(*cargs.data()));
      }
      case RET_DOUBLE: {
        using Func = double (*)(...);
        Func f = reinterpret_cast<Func>(sym);
        return Napi::Number::New(e, f(*cargs.data()));
      }
      case RET_STRING: {
        using Func = const char* (*)(...);
        Func f = reinterpret_cast<Func>(sym);
        const char* res = f(*cargs.data());
        return Napi::String::New(e, res ? res : "");
      }
      case RET_POINTER: {
        using Func = void* (*)(...);
        Func f = reinterpret_cast<Func>(sym);
        void* res = f(*cargs.data());
        return Napi::External<void>::New(e, res);
      }
      case RET_VOID: {
        using Func = void (*)(...);
        Func f = reinterpret_cast<Func>(sym);
        f(*cargs.data());
        return e.Undefined();
      }
    }
    return e.Null();
  });
}

// ----------------- Lib class -----------------

class Lib : public Napi::ObjectWrap<Lib> {
public:
  static Napi::Function GetClass(Napi::Env env) {
    return DefineClass(env, "Lib", {
      InstanceMethod("get", &Lib::Get),
      InstanceMethod("close", &Lib::Close)
    });
  }

  Lib(const Napi::CallbackInfo& info) : Napi::ObjectWrap<Lib>(info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
      Napi::TypeError::New(env, "Expected path to shared library").ThrowAsJavaScriptException();
      return;
    }

    std::string path = info[0].As<Napi::String>().Utf8Value();
    handle = dlopen(path.c_str(), RTLD_NOW);
    if (!handle) {
      Napi::Error::New(env, dlerror()).ThrowAsJavaScriptException();
      return;
    }

    // If signature map is passed
    if (info.Length() > 1 && info[1].IsObject()) {
      Napi::Object spec = info[1].As<Napi::Object>();
      Napi::Array props = spec.GetPropertyNames();

      for (uint32_t i = 0; i < props.Length(); i++) {
        std::string symName = props.Get(i).As<Napi::String>().Utf8Value();
        Napi::Array sig = spec.Get(symName).As<Napi::Array>();

        if (sig.Length() != 2) continue;

        // Extract args + return type
        Napi::Array argTypes = sig.Get((uint32_t)0).As<Napi::Array>();
        std::string retType = sig.Get((uint32_t)1).As<Napi::String>().Utf8Value();

        std::vector<ArgType> args;
        for (uint32_t j = 0; j < argTypes.Length(); j++) {
          args.push_back(parseArgType(argTypes.Get(j).As<Napi::String>().Utf8Value()));
        }
        RetType ret = parseRetType(retType);

        void* sym = dlsym(handle, symName.c_str());
        if (sym) {
          Napi::Function fn = WrapTypedSymbol(env, sym, args, ret);
          this->Value().As<Napi::Object>().Set(symName, fn);
        } else {
          this->Value().As<Napi::Object>().Set(symName, env.Null());
        }
      }
    }
  }

  ~Lib() {
    if (handle) dlclose(handle);
  }

private:
  void* handle = nullptr;

  Napi::Value Get(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 3) {
      Napi::TypeError::New(env, "Expected (symbolName, [argTypes], retType)").ThrowAsJavaScriptException();
      return env.Null();
    }

    std::string symName = info[0].As<Napi::String>().Utf8Value();
    Napi::Array argTypes = info[1].As<Napi::Array>();
    std::string retType = info[2].As<Napi::String>().Utf8Value();

    std::vector<ArgType> args;
    for (uint32_t j = 0; j < argTypes.Length(); j++) {
      args.push_back(parseArgType(argTypes.Get(j).As<Napi::String>().Utf8Value()));
    }
    RetType ret = parseRetType(retType);

    void* sym = dlsym(handle, symName.c_str());
    if (!sym) return env.Null();

    return WrapTypedSymbol(env, sym, args, ret);
  }

  Napi::Value Close(const Napi::CallbackInfo& info) {
    if (handle) {
      dlclose(handle);
      handle = nullptr;
    }
    return info.Env().Undefined();
  }
};

// Basic wrappers
Value Dlopen(const CallbackInfo& info) {
  std::string path = info[0].As<String>();
  int flags = info[1].As<Number>();
  void* handle = dlopen(path.c_str(), flags);
  return External<void>::New(info.Env(), handle);
}

Value Dlsym(const CallbackInfo& info) {
  void* handle = info[0].As<External<void>>().Data();
  std::string symbol = info[1].As<String>();
  void* sym = dlsym(handle, symbol.c_str());
  return External<void>::New(info.Env(), sym);
}

Value Dlclose(const CallbackInfo& info) {
  void* handle = info[0].As<External<void>>().Data();
  int result = dlclose(handle);
  return Number::New(info.Env(), result);
}

Value Dlerror(const CallbackInfo& info) {
  const char* err = dlerror();
  return String::New(info.Env(), err ? err : "");
}

// Cast and call a void(*)(const char*) function
Value CallVoidCString(const CallbackInfo& info) {
  void* fnPtr = info[0].As<External<void>>().Data();
  std::string arg = info[1].As<String>();
  using FuncType = void (*)(const char*);
  FuncType func = reinterpret_cast<FuncType>(fnPtr);
  func(arg.c_str());
  return info.Env().Undefined();
}

// Cast and call int(*)() function
Value CallIntNoArgs(const CallbackInfo& info) {
  void* fnPtr = info[0].As<External<void>>().Data();
  using FuncType = int (*)();
  FuncType func = reinterpret_cast<FuncType>(fnPtr);
  int result = func();
  return Number::New(info.Env(), result);
}

Value WrapSymbol(Env env, const std::string& name, void* sym) {
  using namespace Napi;

  // Try int()
  try {
    using IntFunc = int (*)();
    IntFunc f = reinterpret_cast<IntFunc>(sym);
    int result = f(); // probe
    return Function::New(env, [sym](const CallbackInfo& info) {
      IntFunc func = reinterpret_cast<IntFunc>(sym);
      return Number::New(info.Env(), func());
    });
  } catch (...) {}

  // Try int(const char*)
  try {
    using StrFunc = int (*)(const char*);
    StrFunc f = reinterpret_cast<StrFunc>(sym);
    int result = f("test"); // probe
    return Function::New(env, [sym](const CallbackInfo& info) {
      std::string arg = info[0].As<String>().Utf8Value();
      StrFunc func = reinterpret_cast<StrFunc>(sym);
      return Number::New(info.Env(), func(arg.c_str()));
    });
  } catch (...) {}

  // Try double(double)
try {
  using DblFunc = double (*)(double);
  DblFunc func = reinterpret_cast<DblFunc>(sym);
  double probe = func(1.0);

  if (std::abs(probe - std::cos(1.0)) > 0.0001) throw std::runtime_error("Mismatch");

  return Function::New(env, [func](const CallbackInfo& info) {
    double arg = info[0].As<Number>().DoubleValue();
    return Number::New(info.Env(), func(arg));
  });
} catch (...) {}

  // Fallback: return raw pointer
  Object obj = Object::New(env);
  obj.Set("name", String::New(env, name));
  obj.Set("ptr", External<void>::New(env, sym));
  return obj;
}

Value Expose(const CallbackInfo& info) {
  using namespace Napi;

  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsArray()) {
    TypeError::New(env, "Expected (string path, array symbols)").ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string path = info[0].As<String>().Utf8Value();
  Array symbols = info[1].As<Array>();

  void* handle = dlopen(path.c_str(), RTLD_NOW);
  if (!handle) return env.Null();

  Object libObj = Object::New(env);

  for (uint32_t i = 0; i < symbols.Length(); ++i) {
    std::string symName = symbols.Get(i).As<String>().Utf8Value();
    void* sym = dlsym(handle, symName.c_str());
    if (sym) {
      libObj.Set(symName, WrapSymbol(env, symName, sym));
    } else {
      libObj.Set(symName, env.Null());
    }
  }

  return libObj;
}

Object Init(Env env, Object exports) {
    Napi::Function ctor = Lib::GetClass(env);

    // Wrap into a callable factory
    exports.Set("lib", Napi::Function::New(env, [ctor](const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        return ctor.New({}); // forward args if needed
    }));

  exports.Set("dlopen", Function::New(env, Dlopen));
  exports.Set("dlsym", Function::New(env, Dlsym));
  exports.Set("dlclose", Function::New(env, Dlclose));
  exports.Set("dlerror", Function::New(env, Dlerror));
  exports.Set("callVoidCString", Function::New(env, CallVoidCString));
  exports.Set("callIntNoArgs", Function::New(env, CallIntNoArgs));
  exports.Set("expose", Function::New(env, Expose));
  return exports;
}

NODE_API_MODULE(dlwrap, Init)
