#include <napi.h>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <unistd.h>
#include <sys/mman.h>
#include <bit>
#include <cstdint>
#include <cstring>
#include <random>
#include <chrono>


// Include appropriate header based on OS
#if defined(__linux__)
#include <sys/syscall.h>
#elif defined(__APPLE__)
#include <sys/syscall.h>
#include <sys/mman.h>
#endif

#include <sys/syscall.h>
#include <unistd.h>

// Compat shim for Bionic / Termux (Android ARM64)
// Maps glibc-style SYS_* to Android __NR_* equivalents

#ifndef SYS_read
#define SYS_read __NR_read
#endif
#ifndef SYS_write
#define SYS_write __NR_write
#endif
#ifndef SYS_open
#define SYS_open __NR_openat   // open() is openat() on Android
#endif
#ifndef SYS_close
#define SYS_close __NR_close
#endif
#ifndef SYS_stat
#define SYS_stat __NR_newfstatat  // stat() -> newfstatat()
#endif
#ifndef SYS_fstat
#define SYS_fstat __NR_fstat
#endif
#ifndef SYS_lstat
#define SYS_lstat 0
#endif
#ifndef SYS_poll
#define SYS_poll __NR_ppoll
#endif
#ifndef SYS_lseek
#define SYS_lseek __NR_lseek
#endif
#ifndef SYS_mmap
#define SYS_mmap __NR_mmap
#endif
#ifndef SYS_munmap
#define SYS_munmap __NR_munmap
#endif
#ifndef SYS_readlink
#define SYS_readlink __NR_readlinkat
#endif
 #ifndef SYS_access
#define SYS_access __NR_faccessat
#endif
#ifndef SYS_fork
#define SYS_fork __NR_clone   // fork is emulated via clone
#endif
#ifndef SYS_vfork
#define SYS_vfork __NR_clone
#endif
#ifndef SYS_execve
#define SYS_execve __NR_execve
#endif
#ifndef SYS_exit
#define SYS_exit __NR_exit
#endif
#ifndef SYS_wait4
#define SYS_wait4 __NR_wait4
#endif
#ifndef SYS_kill
#define SYS_kill __NR_kill
#endif
#ifndef SYS_sigaction
#define SYS_sigaction __NR_rt_sigaction
#endif

// Directory and link-related
#ifndef SYS_mkdir
#define SYS_mkdir __NR_mkdirat
#endif
#ifndef SYS_rmdir
#define SYS_rmdir __NR_unlinkat   // rmdir is handled via unlinkat
#endif
#ifndef SYS_link
#define SYS_link __NR_linkat
#endif
#ifndef SYS_unlink
#define SYS_unlink __NR_unlinkat
#endif
#ifndef SYS_symlink
#define SYS_symlink __NR_symlinkat
#endif
#ifndef SYS_rename
#define SYS_rename __NR_renameat
#endif

Napi::Object SyscallConstants(Napi::Env env) {
    Napi::Object constants = Napi::Object::New(env);

    // File I/O
    constants.Set("SYS_read", Napi::Number::New(env, SYS_read));
    constants.Set("SYS_write", Napi::Number::New(env, SYS_write));
    constants.Set("SYS_open", Napi::Number::New(env, SYS_open));
    constants.Set("SYS_close", Napi::Number::New(env, SYS_close));
    constants.Set("SYS_stat", Napi::Number::New(env, SYS_stat));
    constants.Set("SYS_fstat", Napi::Number::New(env, SYS_fstat));
    constants.Set("SYS_lstat", Napi::Number::New(env, SYS_lstat));
    constants.Set("SYS_poll", Napi::Number::New(env, SYS_poll));
    constants.Set("SYS_lseek", Napi::Number::New(env, SYS_lseek));
    constants.Set("SYS_mmap", Napi::Number::New(env, SYS_mmap));
    constants.Set("SYS_munmap", Napi::Number::New(env, SYS_munmap));
    constants.Set("SYS_readlink", Napi::Number::New(env, SYS_readlink));
    constants.Set("SYS_access", Napi::Number::New(env, SYS_access));

    // Process and Memory Management
    constants.Set("SYS_getpid", Napi::Number::New(env, SYS_getpid));
    constants.Set("SYS_getppid", Napi::Number::New(env, SYS_getppid));
    constants.Set("SYS_fork", Napi::Number::New(env, SYS_fork));
    constants.Set("SYS_vfork", Napi::Number::New(env, SYS_vfork));
    constants.Set("SYS_execve", Napi::Number::New(env, SYS_execve));
    constants.Set("SYS_exit", Napi::Number::New(env, SYS_exit));
    constants.Set("SYS_wait4", Napi::Number::New(env, SYS_wait4));
    constants.Set("SYS_kill", Napi::Number::New(env, SYS_kill));
    constants.Set("SYS_sigaction", Napi::Number::New(env, SYS_sigaction));

    // Directory and File System
    constants.Set("SYS_chdir", Napi::Number::New(env, SYS_chdir));
    constants.Set("SYS_fchdir", Napi::Number::New(env, SYS_fchdir));
    constants.Set("SYS_mkdir", Napi::Number::New(env, SYS_mkdir));
    constants.Set("SYS_rmdir", Napi::Number::New(env, SYS_rmdir));
    constants.Set("SYS_link", Napi::Number::New(env, SYS_link));
    constants.Set("SYS_unlink", Napi::Number::New(env, SYS_unlink));
    constants.Set("SYS_symlink", Napi::Number::New(env, SYS_symlink));
    constants.Set("SYS_rename", Napi::Number::New(env, SYS_rename));
    constants.Set("SYS_readlink", Napi::Number::New(env, SYS_readlink));
    constants.Set("SYS_mount", Napi::Number::New(env, SYS_mount));

    // Networking
    constants.Set("SYS_socket", Napi::Number::New(env, SYS_socket));
    constants.Set("SYS_connect", Napi::Number::New(env, SYS_connect));
    constants.Set("SYS_accept", Napi::Number::New(env, SYS_accept));
    constants.Set("SYS_listen", Napi::Number::New(env, SYS_listen));
    constants.Set("SYS_bind", Napi::Number::New(env, SYS_bind));
    constants.Set("SYS_sendto", Napi::Number::New(env, SYS_sendto));
    constants.Set("SYS_recvfrom", Napi::Number::New(env, SYS_recvfrom));

    // Time
    constants.Set("SYS_gettimeofday", Napi::Number::New(env, SYS_gettimeofday));

    // User and Group
    constants.Set("SYS_getuid", Napi::Number::New(env, SYS_getuid));
    constants.Set("SYS_setuid", Napi::Number::New(env, SYS_setuid));
    constants.Set("SYS_geteuid", Napi::Number::New(env, SYS_geteuid));
    constants.Set("SYS_setgid", Napi::Number::New(env, SYS_setgid));
    constants.Set("SYS_getgid", Napi::Number::New(env, SYS_getgid));
    constants.Set("SYS_getegid", Napi::Number::New(env, SYS_getegid));

    return constants;
}

Napi::Value Sizeof(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected a type name (string)").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string typeName = info[0].As<Napi::String>();
    size_t size = 0;

    if (typeName == "integer")        size = sizeof(int);
    else if (typeName == "float") size = sizeof(float);
    else if (typeName == "string") size = sizeof(std::string);
    else if (typeName == "bool") size = sizeof(bool);
    else if (typeName == "array") size = sizeof(long) * 100;
    else {
        Napi::TypeError::New(env, "Unsupported type: " + typeName).ThrowAsJavaScriptException();
        return env.Null();
    }

    return Napi::Number::New(env, size);
}

// ----- Type punning / alias hacks -----
// Read any type as any other type
template <typename To, typename From>
Napi::Value ReadAs(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    bool lossless;
    uint64_t ptr = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    To val;
    std::memcpy(&val, reinterpret_cast<void *>(ptr), sizeof(To));
    return Napi::Number::New(env, static_cast<double>(val));
}

// Write any type as any other type
template <typename To, typename From>
Napi::Value WriteAs(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    bool lossless;
    uint64_t ptr = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    To val = static_cast<To>(info[1].As<Napi::Number>().DoubleValue());
    std::memcpy(reinterpret_cast<void *>(ptr), &val, sizeof(To));
    return env.Undefined();
}

// ----- Random hacks -----
// “Magic pointer” randomize memory
Napi::Value RandomizeMemory(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    bool lossless;
    uint64_t ptr = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    size_t size = info[1].As<Napi::Number>().Uint32Value();

    std::mt19937 rng(static_cast<unsigned>(
        std::chrono::high_resolution_clock::now().time_since_epoch().count()));
    std::uniform_int_distribution<uint8_t> dist(0, 255);

    uint8_t *p = reinterpret_cast<uint8_t *>(ptr);
    for (size_t i = 0; i < size; i++)
    {
        p[i] = dist(rng);
    }
    return env.Undefined();
}

// ----- Pointer magic -----
// XOR two pointers (totally useless but fun)
Napi::Value XorPointers(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    bool lossless;
    uint64_t a = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    uint64_t b = info[1].As<Napi::BigInt>().Uint64Value(&lossless);
    return Napi::BigInt::New(env, a ^ b);
}

// Rotate memory bytes (like a tiny obfuscator)
Napi::Value RotateMemory(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    bool lossless;
    uint64_t ptr = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    size_t size = info[1].As<Napi::Number>().Uint32Value();
    uint8_t amount = info[2].As<Napi::Number>().Uint32Value();

    uint8_t *p = reinterpret_cast<uint8_t *>(ptr);
    for (size_t i = 0; i < size; i++)
    {
        p[i] = (p[i] << amount) | (p[i] >> (8 - amount));
    }
    return env.Undefined();
}

Napi::Value ExecMachineCode(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    Napi::Array arr = info[0].As<Napi::Array>();
    size_t length = arr.Length();

    // Allocate RWX memory (page-aligned by mmap)
    void *mem = mmap(nullptr, length,
                     PROT_READ | PROT_WRITE | PROT_EXEC,
                     MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (mem == MAP_FAILED)
    {
        Napi::Error::New(env, "Failed to allocate executable memory").ThrowAsJavaScriptException();
        return env.Null();
    }

    // Copy bytes from JS array into memory
    for (size_t i = 0; i < length; i++)
    {
        uint32_t byte = arr.Get(i).As<Napi::Number>().Uint32Value();
        reinterpret_cast<uint8_t *>(mem)[i] = byte & 0xFF;
    }

    // Cast to a function pointer that returns uint64_t
    uint64_t (*func)() = reinterpret_cast<uint64_t (*)()>(mem);
    uint64_t result = func(); // Call it and store x0 return value

    // Free memory
    munmap(mem, length);

    return Napi::Number::New(env, result);
}

Napi::Value Alloc(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    size_t size = info[0].As<Napi::Number>().Uint32Value();
    void *ptr = malloc(size);

    // return the actual address as a BigInt
    return Napi::BigInt::New(env, reinterpret_cast<uint64_t>(ptr));
}

Napi::Value WriteInt(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    bool lossless;
    uint64_t raw = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    int value = info[1].As<Napi::Number>().Int32Value();

    // directly dereference raw pointer
    int *ptr = reinterpret_cast<int *>(raw);
    *ptr = value;

    return env.Undefined();
}

Napi::Value Memcpy(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    bool lossless;
    uint64_t dest = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    uint64_t src = info[1].As<Napi::BigInt>().Uint64Value(&lossless);
    size_t size = info[2].As<Napi::Number>().Uint32Value();
    std::memcpy(reinterpret_cast<void *>(dest), reinterpret_cast<void *>(src), size);
    return env.Undefined();
}

Napi::Value Memset(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    bool lossless;
    uint64_t ptr = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    uint8_t value = info[1].As<Napi::Number>().Uint32Value();
    size_t size = info[2].As<Napi::Number>().Uint32Value();
    std::memset(reinterpret_cast<void *>(ptr), value, size);
    return env.Undefined();
}

Napi::Value PtrAdd(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    bool lossless;
    uint64_t ptr = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    int64_t offset = info[1].As<Napi::Number>().Int64Value();
    return Napi::BigInt::New(env, ptr + offset);
}

Napi::Value WriteByte(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    bool lossless;
    uint64_t raw = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    uint8_t value = info[1].As<Napi::Number>().Uint32Value();
    uint8_t *ptr = reinterpret_cast<uint8_t *>(raw);
    *ptr = value;
    return env.Undefined();
}

Napi::Value ReadByte(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    bool lossless;
    uint64_t raw = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    uint8_t *ptr = reinterpret_cast<uint8_t *>(raw);
    return Napi::Number::New(env, *ptr);
}

Napi::Value WriteString(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    bool lossless;
    uint64_t raw = info[0].As<Napi::BigInt>().Uint64Value(&lossless);

    std::string str = info[1].As<Napi::String>().Utf8Value();

    // also pass length from JS so we know how much to copy
    size_t len = str.size();
    char* ptr = reinterpret_cast<char*>(raw);

    std::memcpy(ptr, str.data(), len);  
    return env.Undefined();
}

Napi::Value ReadString(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    bool lossless;
    uint64_t raw = info[0].As<Napi::BigInt>().Uint64Value(&lossless);

    size_t len = info[1].As<Napi::Number>().Uint32Value(); // length passed from JS
    char* ptr = reinterpret_cast<char*>(raw);

    std::string str(ptr, len); // construct from raw memory and explicit length
    return Napi::String::New(env, str);
}

Napi::Value ReadInt(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    bool lossless;
    uint64_t raw = info[0].As<Napi::BigInt>().Uint64Value(&lossless);

    int *ptr = reinterpret_cast<int *>(raw);
    int value = *ptr;

    return Napi::Number::New(env, value);
}

Napi::Value Free(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    bool lossless;
    uint64_t raw = info[0].As<Napi::BigInt>().Uint64Value(&lossless);

    void *ptr = reinterpret_cast<void *>(raw);
    free(ptr);

    return env.Undefined();
}

// ----- Short -----
Napi::Value WriteShort(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    bool lossless;
    uint64_t raw = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    int16_t value = info[1].As<Napi::Number>().Int32Value();
    int16_t *ptr = reinterpret_cast<int16_t *>(raw);
    *ptr = value;
    return env.Undefined();
}

Napi::Value ReadShort(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    bool lossless;
    uint64_t raw = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    int16_t *ptr = reinterpret_cast<int16_t *>(raw);
    return Napi::Number::New(env, *ptr);
}

// ----- Float / Double -----
Napi::Value WriteFloat(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    bool lossless;
    uint64_t raw = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    float value = static_cast<float>(info[1].As<Napi::Number>().DoubleValue());
    float *ptr = reinterpret_cast<float *>(raw);
    *ptr = value;
    return env.Undefined();
}

Napi::Value ReadFloat(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    bool lossless;
    uint64_t raw = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    float *ptr = reinterpret_cast<float *>(raw);
    return Napi::Number::New(env, *ptr);
}

Napi::Value WriteDouble(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    bool lossless;
    uint64_t raw = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    double value = info[1].As<Napi::Number>().DoubleValue();
    double *ptr = reinterpret_cast<double *>(raw);
    *ptr = value;
    return env.Undefined();
}

Napi::Value ReadDouble(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    bool lossless;
    uint64_t raw = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    double *ptr = reinterpret_cast<double *>(raw);
    return Napi::Number::New(env, *ptr);
}

// ----- Function call -----
Napi::Value CallFunc(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    bool lossless;
    uint64_t funcPtr = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    using Fn = int (*)(int, int); // example signature
    Fn f = reinterpret_cast<Fn>(funcPtr);
    int result = f(info[1].As<Napi::Number>().Int32Value(), info[2].As<Napi::Number>().Int32Value());
    return Napi::Number::New(env, result);
}

// ----- Patch memory -----
Napi::Value PatchMemory(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    bool lossless;
    uint64_t addr = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    uint8_t val = info[1].As<Napi::Number>().Uint32Value();
    *((uint8_t *)addr) = val;
    return env.Undefined();
}

// ----- Unsafe array access -----
Napi::Value ReadArray(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    bool lossless;
    uint64_t base = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    uint32_t index = info[1].As<Napi::Number>().Uint32Value();
    int *ptr = reinterpret_cast<int *>(base);
    return Napi::Number::New(env, ptr[index]);
}

Napi::Value WriteArray(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    bool lossless;
    uint64_t base = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    uint32_t index = info[1].As<Napi::Number>().Uint32Value();
    int value = info[2].As<Napi::Number>().Int32Value();
    int *ptr = reinterpret_cast<int *>(base);
    ptr[index] = value;
    return env.Undefined();
}

#include <atomic>
#include <thread>
#include <cmath>
#include <climits>
#include <iostream>

// ----- Atomic / Thread Hacks -----
// Flip a single bit atomically
Napi::Value AtomicFlipBit(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    bool lossless;
    uint64_t ptr = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    uint8_t bit = info[1].As<Napi::Number>().Uint32Value();
    std::atomic<uint8_t> *p = reinterpret_cast<std::atomic<uint8_t> *>(ptr);
    uint8_t old = p->fetch_xor(1 << bit);
    return Napi::Number::New(env, old);
}

// Spin-wait until memory matches a value (dangerous busy-wait)
Napi::Value SpinUntil(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    bool lossless;
    uint64_t ptr = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    uint8_t val = info[1].As<Napi::Number>().Uint32Value();
    volatile uint8_t *p = reinterpret_cast<volatile uint8_t *>(ptr);
    while (*p != val)
    {
    } // 💥 blocks CPU
    return env.Undefined();
}

// ----- Floating-point / bit hacks -----
// Flip the sign bit of a float
Napi::Value NegateFloatBitwise(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    bool lossless;
    uint64_t ptr = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    uint32_t *asInt = reinterpret_cast<uint32_t *>(ptr);
    *asInt ^= 0x80000000; // flip sign bit
    return env.Undefined();
}

// Flip the exponent of a double
Napi::Value ChaosDouble(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    bool lossless;
    uint64_t ptr = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    uint64_t *asInt = reinterpret_cast<uint64_t *>(ptr);
    *asInt ^= 0x7FF0000000000000; // max exponent mask
    return env.Undefined();
}

// ----- Self-modifying memory -----
// Overwrite a function pointer with NOPs
Napi::Value NopFunction(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    bool lossless;
    uint64_t func = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    size_t size = info[1].As<Napi::Number>().Uint32Value();
    uint8_t *p = reinterpret_cast<uint8_t *>(func);
    for (size_t i = 0; i < size; i++)
        p[i] = 0x90; // NOP
    return env.Undefined();
}

// ----- Crazy pointer tricks -----
// Swap memory blocks without a temp buffer (XOR swap)
Napi::Value XorSwapMemory(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    bool lossless;
    uint64_t a = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    uint64_t b = info[1].As<Napi::BigInt>().Uint64Value(&lossless);
    size_t size = info[2].As<Napi::Number>().Uint32Value();
    uint8_t *pa = reinterpret_cast<uint8_t *>(a);
    uint8_t *pb = reinterpret_cast<uint8_t *>(b);
    for (size_t i = 0; i < size; i++)
    {
        pa[i] ^= pb[i];
        pb[i] ^= pa[i];
        pa[i] ^= pb[i];
    }
    return env.Undefined();
}

Napi::Value Poke(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    bool lossless;
    uint64_t addr = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    Napi::Array arr = info[1].As<Napi::Array>();
    size_t length = arr.Length();

    uint8_t *p = reinterpret_cast<uint8_t *>(addr);
    for (size_t i = 0; i < length; i++)
    {
        p[i] = arr.Get(i).As<Napi::Number>().Uint32Value();
    }
    return env.Undefined();
}

Napi::Value Peek(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    bool lossless;
    uint64_t addr = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    size_t size = info[1].As<Napi::Number>().Uint32Value();

    Napi::Array arr = Napi::Array::New(env, size);
    uint8_t *p = reinterpret_cast<uint8_t *>(addr);
    for (size_t i = 0; i < size; i++)
        arr.Set(i, Napi::Number::New(env, p[i]));
    return arr;
}

Napi::Value Jump(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    bool lossless;
    uint64_t addr = info[0].As<Napi::BigInt>().Uint64Value(&lossless);

    // Direct raw function call
    uint64_t (*func)() = reinterpret_cast<uint64_t (*)()>(addr);
    uint64_t result = func();
    return Napi::Number::New(env, result);
}

Napi::Value Snapshot(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    bool lossless;
    uint64_t addr = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    size_t size = info[1].As<Napi::Number>().Uint32Value();

    Napi::Object snap = Napi::Object::New(env);

    // Just memory snapshot, no fake registers
    Napi::Array memArr = Napi::Array::New(env, size);
    uint8_t *p = reinterpret_cast<uint8_t *>(addr);
    for (size_t i = 0; i < size; i++)
        memArr.Set(i, Napi::Number::New(env, p[i]));
    snap.Set("memory", memArr);

    return snap;
}

Napi::Value Realloc(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    size_t oldSize = info[0].As<Napi::Number>().Int64Value();
    size_t newSize = info[1].As<Napi::Number>().Int64Value();
    void *ptr = info[2].As<Napi::External<void>>().Data();

    void *newPtr = std::realloc(ptr, newSize);
    if (newPtr == nullptr && newSize != 0)
    {
        Napi::Error::New(env, "Memory allocation failed").ThrowAsJavaScriptException();
        return env.Null();
    }

    return Napi::External<void>::New(env, newPtr);
}

Napi::Value Syscall(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (!info[0].IsNumber()) {
        Napi::TypeError::New(env, "First Argument must be a syscall number").ThrowAsJavaScriptException();
        return env.Null();
    }
    long n = info[0].As<Napi::Number>().Int64Value();

    long args[6] = {0};
    for (size_t i=1; i<info.Length() && i<=6; i++) {
        if (info[i].IsNumber()) {
            args[i-1] = info[i].As<Napi::Number>().Int64Value();
        } else if (info[i].IsString()) {
            std::string str = info[i].As<Napi::String>().Utf8Value();
            args[i-1] = (long)str.c_str();
        }
    }
    long ret = syscall(n, args[0], args[1], args[2], args[3], args[4], args[5]);
    return Napi::Number::New(env, ret);
}

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set("alloc", Napi::Function::New(env, Alloc));
    exports.Set("writeInt", Napi::Function::New(env, WriteInt));
    exports.Set("readInt", Napi::Function::New(env, ReadInt));
    exports.Set("free", Napi::Function::New(env, Free));

    // Byte-level
    exports.Set("writeByte", Napi::Function::New(env, WriteByte));
    exports.Set("readByte", Napi::Function::New(env, ReadByte));

    // Memory ops
    exports.Set("memcpy", Napi::Function::New(env, Memcpy));
    exports.Set("memset", Napi::Function::New(env, Memset));
    exports.Set("ptrAdd", Napi::Function::New(env, PtrAdd));
    exports.Set("peek", Napi::Function::New(env, Peek));
    exports.Set("poke", Napi::Function::New(env, Poke));
    exports.Set("jump", Napi::Function::New(env, Jump));
    exports.Set("snapshot", Napi::Function::New(env, Snapshot));
    // Short / Float / Double
    exports.Set("writeShort", Napi::Function::New(env, WriteShort));
    exports.Set("readShort", Napi::Function::New(env, ReadShort));
    exports.Set("writeFloat", Napi::Function::New(env, WriteFloat));
    exports.Set("realloc", Napi::Function::New(env, Realloc));
    exports.Set("readFloat", Napi::Function::New(env, ReadFloat));
    exports.Set("writeDouble", Napi::Function::New(env, WriteDouble));
    exports.Set("readDouble", Napi::Function::New(env, ReadDouble));
    exports.Set("readString", Napi::Function::New(env, ReadString));
    exports.Set("writeString", Napi::Function::New(env, WriteString));
    // Function / memory patch / array
    exports.Set("callFunc", Napi::Function::New(env, CallFunc));
    exports.Set("patchMemory", Napi::Function::New(env, PatchMemory));
    exports.Set("readArray", Napi::Function::New(env, ReadArray));
    exports.Set("writeArray", Napi::Function::New(env, WriteArray));

    // danger low level
    exports.Set("execMachineCode", Napi::Function::New(env, ExecMachineCode));
    exports.Set("syscall", Napi::Function::New(env, Syscall));
    exports.Set("sys_values", SyscallConstants(env));

    // ----- Env.Set registrations -----
    exports.Set("readAsInt32", Napi::Function::New(env, ReadAs<int32_t, double>));
    exports.Set("writeAsInt32", Napi::Function::New(env, WriteAs<int32_t, double>));
    exports.Set("readAsFloat", Napi::Function::New(env, ReadAs<float, double>));
    exports.Set("writeAsFloat", Napi::Function::New(env, WriteAs<float, double>));

    exports.Set("randomizeMemory", Napi::Function::New(env, RandomizeMemory));
    exports.Set("xorPointers", Napi::Function::New(env, XorPointers));
    exports.Set("rotateMemory", Napi::Function::New(env, RotateMemory));
    return exports;
}

NODE_API_MODULE(pointer_addon, Init)
