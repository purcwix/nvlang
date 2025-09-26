#include <napi.h>
#include <Python.h>

PyObject* ToPyObject(Napi::Value v) {
    if (v.IsNull() || v.IsUndefined()) {
        Py_INCREF(Py_None);
        return Py_None;
    }

    if (v.IsBoolean()) {
        return PyBool_FromLong(v.As<Napi::Boolean>().Value() ? 1 : 0);
    }

    if (v.IsNumber()) {
        return PyFloat_FromDouble(v.As<Napi::Number>().DoubleValue());
    }

    if (v.IsString()) {
        return PyUnicode_FromString(v.As<Napi::String>().Utf8Value().c_str());
    }

    if (v.IsArray()) {
        Napi::Array arr = v.As<Napi::Array>();
        uint32_t len = arr.Length();
        PyObject* list = PyList_New(len);
        for (uint32_t i = 0; i < len; i++) {
            PyObject* item = ToPyObject(arr.Get(i));  // use Get() not []
            PyList_SetItem(list, i, item);           // steals ref, no INCREF
        }
        return list;
    }

    if (v.IsObject()) {
        Napi::Object obj = v.As<Napi::Object>();
        PyObject* dict = PyDict_New();
        Napi::Array props = obj.GetPropertyNames();
        for (uint32_t i = 0; i < props.Length(); i++) {
            std::string key = props.Get(i).As<Napi::String>();
            PyObject* val = ToPyObject(obj.Get(key));
            PyDict_SetItemString(dict, key.c_str(), val);
            Py_DECREF(val);  // OK to DECREF here, PyDict_SetItem increments
        }
        return dict;
    }

    if (v.IsExternal()) {
        return v.As<Napi::External<PyObject>>().Data();
    }

    // fallback
    Py_INCREF(Py_None);
    return Py_None;
}

// --- Helper: wrap a PyObject into JS External ---
Napi::Value WrapPyObject(Napi::Env env, PyObject* obj) {
    if (!obj || obj == Py_None) {
        return env.Null();
    }
    if (PyBool_Check(obj)) {
        return Napi::Boolean::New(env, obj == Py_True);
    }
    if (PyLong_Check(obj)) {
        return Napi::Number::New(env, PyLong_AsLong(obj));
    }
    if (PyFloat_Check(obj)) {
        return Napi::Number::New(env, PyFloat_AsDouble(obj));
    }
    if (PyUnicode_Check(obj)) {
        return Napi::String::New(env, PyUnicode_AsUTF8(obj));
    }
    if (PyList_Check(obj) || PyTuple_Check(obj)) {
        size_t len = PySequence_Size(obj);
        Napi::Array arr = Napi::Array::New(env, len);
        for (size_t i = 0; i < len; i++) {
            PyObject* item = PySequence_GetItem(obj, i);
            arr[i] = WrapPyObject(env, item);
            Py_XDECREF(item);
        }
        return arr;
    }
    if (PyDict_Check(obj)) {
        Napi::Object dict = Napi::Object::New(env);
        PyObject* key;
        PyObject* value;
        Py_ssize_t pos = 0;
        while (PyDict_Next(obj, &pos, &key, &value)) {
            // Only handle string keys for now
            if (PyUnicode_Check(key)) {
                dict[PyUnicode_AsUTF8(key)] = WrapPyObject(env, value);
            }
        }
        return dict;
    }
if (PyModule_Check(obj)) {
    PyObject* dictObj = PyModule_GetDict(obj); // borrowed ref
    if (dictObj) {
        // create a JS object up front so we can return it immediately
        Napi::Object jsObj = Napi::Object::New(env);

        // store it in a "seen" cache to break cycles
        static std::unordered_map<PyObject*, Napi::Object> seenModules;
        auto it = seenModules.find(obj);
        if (it != seenModules.end()) {
            return it->second; // return cached object instead of recursing
        }
        seenModules[obj] = jsObj;

        // now wrap the dict contents shallowly
        PyObject *key, *value;
        Py_ssize_t pos = 0;
        while (PyDict_Next(dictObj, &pos, &key, &value)) {
            if (PyUnicode_Check(key)) {
                const char* kstr = PyUnicode_AsUTF8(key);
                jsObj.Set(kstr, WrapPyObject(env, value));
            }
        }

        return jsObj;
    }
}

if (PyCallable_Check(obj)) {
    return Napi::Function::New(env, [obj](const Napi::CallbackInfo& info) -> Napi::Value {
        Napi::Env env = info.Env();

        // build args
        Py_ssize_t argc = info.Length();
        PyObject* args = PyTuple_New(argc);
        for (Py_ssize_t i = 0; i < argc; i++) {
            PyObject* arg = ToPyObject(info[i]);
            PyTuple_SET_ITEM(args, i, arg); // steals ref
        }

        PyObject* result = PyObject_CallObject(obj, args);
        Py_DECREF(args);

        if (!result) {
            PyErr_Print();
            return env.Null();
        }

        // Special case: shuffle returns None, but first arg is the mutated list
        if (result == Py_None && argc > 0 && PyList_Check(PyTuple_GetItem(args, 0))) {
            PyObject* shuffled = PyTuple_GetItem(args, 0); // borrowed
            return WrapPyObject(env, shuffled);
        }

        Napi::Value ret = WrapPyObject(env, result);
        Py_DECREF(result);
        return ret;
    });
}

    // Default: wrap as external handle
    Py_INCREF(obj);
    return Napi::External<PyObject>::New(env, obj, [](Napi::Env, PyObject* p) {
        Py_DECREF(p);
    });
}

// --- Core functions ---
Napi::Value PyInitialize(const Napi::CallbackInfo& info) {
    if (!Py_IsInitialized()) {
        Py_Initialize();
    }
    return info.Env().Undefined();
}

Napi::Value PyFinalize(const Napi::CallbackInfo& info) {
    if (Py_IsInitialized()) {
        Py_Finalize();
    }
    return info.Env().Undefined();
}

Napi::Value PyGetVersion(const Napi::CallbackInfo& info) {
    return Napi::String::New(info.Env(), Py_GetVersion());
}

Napi::Value Exec(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!Py_IsInitialized()) {
        Napi::Error::New(env, "Python not initialized").ThrowAsJavaScriptException();
        return env.Null();
    }
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected code string").ThrowAsJavaScriptException();
        return env.Null();
    }
    std::string code = info[0].As<Napi::String>();
    int result = PyRun_SimpleString(code.c_str());
    return Napi::Number::New(env, result);
}

Napi::Value Eval(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!Py_IsInitialized()) {
        Napi::Error::New(env, "Python not initialized").ThrowAsJavaScriptException();
        return env.Null();
    }
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected expression string").ThrowAsJavaScriptException();
        return env.Null();
    }
    std::string expr = info[0].As<Napi::String>();

    PyObject* globals = PyDict_New();
    PyObject* locals = PyDict_New();
    PyObject* result = PyRun_StringFlags(expr.c_str(), Py_eval_input, globals, locals, nullptr);

    if (!result) {
        PyErr_Print();
        return env.Null();
    }

    Napi::Value out = WrapPyObject(env, result);
    Py_DECREF(result);
    return out;
}

Napi::Value Import(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!Py_IsInitialized()) {
        Napi::Error::New(env, "Python not initialized").ThrowAsJavaScriptException();
        return env.Null();
    }
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected module name").ThrowAsJavaScriptException();
        return env.Null();
    }
    std::string name = info[0].As<Napi::String>();

    PyObject* module = PyImport_ImportModule(name.c_str());
    if (!module) {
        PyErr_Print();
        return env.Null();
    }

    return WrapPyObject(env, module);
}

Napi::Value GetAttr(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsExternal() || !info[1].IsString()) {
        Napi::TypeError::New(env, "Expected (PyObject, string)").ThrowAsJavaScriptException();
        return env.Null();
    }
    PyObject* obj = info[0].As<Napi::External<PyObject>>().Data();
    std::string name = info[1].As<Napi::String>();

    PyObject* attr = PyObject_GetAttrString(obj, name.c_str());
    if (!attr) {
        PyErr_Print();
        return env.Null();
    }
    return WrapPyObject(env, attr);
}

Napi::Value SetAttr(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 3 || !info[0].IsExternal() || !info[1].IsString()) {
        Napi::TypeError::New(env, "Expected (PyObject, string, value)").ThrowAsJavaScriptException();
        return env.Null();
    }
    PyObject* obj = info[0].As<Napi::External<PyObject>>().Data();
    std::string name = info[1].As<Napi::String>();
    PyObject* val = ToPyObject(info[2]);

    int res = PyObject_SetAttrString(obj, name.c_str(), val);
    return Napi::Boolean::New(env, res == 0);
}

Napi::Value Call(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsExternal()) {
        Napi::TypeError::New(env, "Expected (PyObject, [args...])").ThrowAsJavaScriptException();
        return env.Null();
    }
    PyObject* func = info[0].As<Napi::External<PyObject>>().Data();

    PyObject* args = PyTuple_New(info.Length() - 1);
    for (size_t i = 1; i < info.Length(); i++) {
        PyObject* arg = ToPyObject(info[i]);
        Py_INCREF(arg);
        PyTuple_SetItem(args, i - 1, arg); // steals ref
    }

    PyObject* result = PyObject_CallObject(func, args);
    Py_DECREF(args);

    if (!result) {
        PyErr_Print();
        return env.Null();
    }

    Napi::Value out = WrapPyObject(env, result);
    Py_DECREF(result);
    return out;
}

Napi::Value SimpleString(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (!Py_IsInitialized()) {
        Napi::Error::New(env, "Python not initialized! Call Py_Initialize() first.")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected a string").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string code = info[0].As<Napi::String>();
    int result = PyRun_SimpleString(code.c_str());

    return Napi::Number::New(env, result);
}

// --- Init ---
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("init", Napi::Function::New(env, PyInitialize));
    exports.Set("end", Napi::Function::New(env, PyFinalize));
    exports.Set("ver", Napi::Function::New(env, PyGetVersion));
    exports.Set("exec", Napi::Function::New(env, Exec));
    exports.Set("eval", Napi::Function::New(env, Eval));
    exports.Set("import", Napi::Function::New(env, Import));
    exports.Set("getAttr", Napi::Function::New(env, GetAttr));
    exports.Set("setAttr", Napi::Function::New(env, SetAttr));
    exports.Set("call", Napi::Function::New(env, Call));
    exports.Set("simpleString", Napi::Function::New(env, SimpleString));
    return exports;
}

NODE_API_MODULE(pointeraddon, Init)
