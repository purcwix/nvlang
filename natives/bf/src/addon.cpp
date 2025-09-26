#include <napi.h>
#include <iostream>
#include <vector>
#include <stack>
#include <string>

// Brainfuck interpreter that prints AND returns output
std::string runBF(const std::string& code, const std::string& input = "") {
    std::vector<unsigned char> tape(30000, 0);
    size_t ptr = 0;
    size_t inputPtr = 0;
    std::stack<size_t> loopStack;
    std::string output;

    for (size_t i = 0; i < code.size(); i++) {
        char cmd = code[i];
        switch (cmd) {
            case '>': ptr++; break;
            case '<': ptr--; break;
            case '+': tape[ptr]++; break;
            case '-': tape[ptr]--; break;
            case '.': {
                char c = static_cast<char>(tape[ptr]);
                std::cout << c;              // print live
                output.push_back(c);         // collect for return
                break;
            }
            case ',':
                if (inputPtr < input.size()) {
                    tape[ptr] = input[inputPtr++];
                } else {
                    tape[ptr] = 0;
                }
                break;
case '[':
    if (tape[ptr] == 0) {
        int loop = 1;
        while (loop > 0 && ++i < code.size()) {
            if (code[i] == '[') loop++;
            else if (code[i] == ']') loop--;
        }
    } else {
        loopStack.push(i); // only push if not skipping
    }
    break;

case ']':
    if (tape[ptr] != 0) {
        i = loopStack.top(); // jump back
    } else {
        loopStack.pop(); // done with this loop
    }
    break;
        }
    }
    std::cout.flush(); // make sure it appears immediately
    return output;
}

Napi::Value WrapperRunBF(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected a string").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    std::string code = info[0].As<Napi::String>().Utf8Value();
    std::string result = runBF(code);

    return Napi::String::New(env, result);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("runBF", Napi::Function::New(env, WrapperRunBF));
    return exports;
}

NODE_API_MODULE(bf, Init)
