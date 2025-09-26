#include <napi.h>
#include <vector>
#include <string>
#include <sstream>
#include <iomanip>
#include <cstdint>
#include <algorithm>

Napi::Value Pi(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    int digits = info[0].As<Napi::Number>().Int32Value();

    // --- BigDecimal block representation ---
    struct Big {
        std::vector<uint32_t> blocks; // each block = 9 digits
        int block_size = 9;

        Big(uint32_t val=0) { if(val) blocks.push_back(val); }

        void multiply(uint32_t x) {
            uint64_t carry=0;
            for(auto &b:blocks){
                uint64_t prod = uint64_t(b)*x+carry;
                b = prod%1000000000;
                carry = prod/1000000000;
            }
            while(carry){
                blocks.push_back(carry%1000000000);
                carry/=1000000000;
            }
        }

        void multiply(const Big &other){
            std::vector<uint32_t> res(blocks.size()+other.blocks.size(),0);
            for(size_t i=0;i<blocks.size();i++){
                uint64_t carry=0;
                for(size_t j=0;j<other.blocks.size();j++){
                    uint64_t sum = uint64_t(blocks[i])*other.blocks[j]+res[i+j]+carry;
                    res[i+j] = sum%1000000000;
                    carry = sum/1000000000;
                }
                if(carry) res[i+other.blocks.size()] += carry;
            }
            blocks = res;
            while(blocks.size()>1 && blocks.back()==0) blocks.pop_back();
        }

        void add(const Big &other){
            size_t n = std::max(blocks.size(),other.blocks.size());
            blocks.resize(n,0);
            uint64_t carry=0;
            for(size_t i=0;i<n;i++){
                uint64_t sum = uint64_t(blocks[i])+(i<other.blocks.size()?other.blocks[i]:0)+carry;
                blocks[i] = sum%1000000000;
                carry = sum/1000000000;
            }
            if(carry) blocks.push_back(carry);
        }

        void divide(uint32_t x){
            uint64_t rem=0;
            for(int i=blocks.size()-1;i>=0;i--){
                uint64_t cur = blocks[i]+rem*1000000000ULL;
                blocks[i] = cur/x;
                rem = cur%x;
            }
            while(blocks.size()>1 && blocks.back()==0) blocks.pop_back();
        }

        std::string toString(int decimalDigits){
            std::ostringstream oss;
            oss<<blocks.back();
            for(int i=blocks.size()-2;i>=0;i--) oss<<std::setw(9)<<std::setfill('0')<<blocks[i];
            std::string s = oss.str();
            if(decimalDigits < (int)s.size()) s = s.substr(0,decimalDigits+1);
            s.insert(1,".");
            return s;
        }
    };

    // --- Factorial helper ---
    auto factorial = [&](int n) -> Big {
        Big res(1);
        for(int i=2;i<=n;i++) res.multiply(i);
        return res;
    };

    // --- Chudnovsky sum ---
    int terms = digits/14+1;
    Big sum(0);
    for(int k=0;k<terms;k++){
        Big num = factorial(6*k);
        Big den = factorial(3*k);
        Big kfact = factorial(k);
        kfact.multiply(kfact);
        kfact.multiply(kfact); // k!^3
        den.multiply(kfact);
        if(k%2) num.multiply(-1);
        Big term(545140134*k+13591409);
        num.multiply(term);
        num.divide(den.blocks.back()); // simple integer division
        sum.add(num);
    }

    // multiply by constant 426880*sqrt(10005) ~ 42692725
    sum.multiply(42692725);

    return Napi::String::New(env,sum.toString(digits));
}

Napi::Object Init(Napi::Env env, Napi::Object exports){
    exports.Set("pi", Napi::Function::New(env,Pi));
    return exports;
}

NODE_API_MODULE(piaddon, Init)
