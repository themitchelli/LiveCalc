# SIMD 16-Byte Alignment Requirements

This document describes the alignment requirements for WASM SIMD128 operations and how to ensure data structures are properly aligned.

## Overview

WebAssembly SIMD128 uses 128-bit (16-byte) vector registers. While WASM allows unaligned loads and stores, aligned access is significantly faster on most architectures:

- **Aligned access**: Data address is a multiple of 16 bytes
- **Unaligned access**: Data address is not aligned - works but slower

For optimal SIMD performance, ensure data is 16-byte aligned.

## C++ Alignment

### Using alignas Specifier

```cpp
// Align a struct to 16 bytes
struct alignas(16) SimdPolicy {
    double sum_assured;   // 8 bytes
    double premium;       // 8 bytes
    // Total: 16 bytes, naturally aligned
};

// Align an array
alignas(16) double rates[1000];

// Align a buffer
alignas(16) uint8_t buffer[4096];
```

### Aligned Allocation

For dynamic allocation, use aligned_alloc (C++17):

```cpp
#include <cstdlib>

// Allocate 16-byte aligned memory
void* ptr = std::aligned_alloc(16, size);

// Remember to free with std::free
std::free(ptr);
```

### STL Container Alignment

For std::vector with aligned elements:

```cpp
#include <memory>

// Custom allocator for 16-byte alignment
template<typename T>
struct AlignedAllocator {
    using value_type = T;
    static constexpr std::size_t alignment = 16;

    T* allocate(std::size_t n) {
        return static_cast<T*>(std::aligned_alloc(alignment, n * sizeof(T)));
    }

    void deallocate(T* p, std::size_t) {
        std::free(p);
    }
};

// Use with std::vector
std::vector<double, AlignedAllocator<double>> aligned_rates;
```

## WASM/Emscripten Considerations

### Memory Alignment in Emscripten

Emscripten's malloc already provides 8-byte alignment. For 16-byte alignment:

```cpp
// In C++ compiled to WASM
alignas(16) static float simd_buffer[4];
```

### JavaScript Side

When passing data to WASM from JavaScript, ensure buffer alignment:

```typescript
// Create aligned buffer
function createAlignedBuffer(size: number, alignment: number = 16): ArrayBuffer {
    // Create slightly larger buffer to allow alignment
    const buffer = new ArrayBuffer(size + alignment - 1);
    const view = new Uint8Array(buffer);

    // Find aligned offset
    const address = view.byteOffset;
    const alignedOffset = (alignment - (address % alignment)) % alignment;

    // Return view starting at aligned offset
    return buffer.slice(alignedOffset, alignedOffset + size);
}

// For SharedArrayBuffer
function createAlignedSharedBuffer(size: number, alignment: number = 16): SharedArrayBuffer {
    // SharedArrayBuffer size must be multiple of alignment
    const alignedSize = Math.ceil(size / alignment) * alignment;
    return new SharedArrayBuffer(alignedSize);
}
```

### TypedArray Alignment

TypedArrays are automatically aligned to their element size:
- Float32Array: 4-byte aligned
- Float64Array: 8-byte aligned

For 16-byte alignment with Float64Array, ensure the byte offset is a multiple of 16:

```typescript
const buffer = new SharedArrayBuffer(size);
const offset = 0; // Must be multiple of 16 for SIMD
const array = new Float64Array(buffer, offset, count);
```

## Data Structure Guidelines

### Policy Data

Current Policy struct (32 bytes, naturally aligned):
```cpp
struct Policy {
    uint32_t policy_id;   // 4 bytes
    uint8_t age;          // 1 byte
    uint8_t gender;       // 1 byte
    uint8_t product_type; // 1 byte
    uint8_t padding;      // 1 byte (implicit)
    double sum_assured;   // 8 bytes
    double premium;       // 8 bytes
    uint16_t term;        // 2 bytes
    uint8_t padding2[6];  // 6 bytes (implicit to 32)
};
```

For SIMD processing, consider reorganizing to SoA (Structure of Arrays):
```cpp
struct alignas(16) PolicyArrays {
    double* sum_assured;  // Array of sum_assured values
    double* premium;      // Array of premium values
    // ... other arrays
};
```

### Mortality/Lapse Tables

Tables are already contiguous double arrays, just need 16-byte alignment:
```cpp
alignas(16) double mortality_qx[121 * 2];  // 121 ages * 2 genders
alignas(16) double lapse_rates[50];         // 50 years
```

### Scenario Data

Interest rates per scenario (50 doubles = 400 bytes):
```cpp
struct alignas(16) Scenario {
    double rates[50];  // 400 bytes, aligned to 16
};
```

## Verification

### Runtime Alignment Check

```cpp
template<typename T>
bool is_aligned(const T* ptr, std::size_t alignment = 16) {
    return reinterpret_cast<std::uintptr_t>(ptr) % alignment == 0;
}

// Usage
double* rates = ...;
assert(is_aligned(rates));
```

### Compile-Time Alignment Check

```cpp
static_assert(alignof(SimdPolicy) >= 16, "SimdPolicy must be 16-byte aligned");
```

## Performance Impact

Benchmarks show SIMD with proper alignment can achieve:
- 2-4x speedup for vectorizable loops
- Significant improvement when processing arrays of doubles

Without alignment:
- Unaligned loads/stores work but may be 20-50% slower
- Cross-cache-line access causes additional latency

## Browser/Runtime Support

SIMD128 is supported in:
- Chrome 91+ (May 2021)
- Firefox 89+ (June 2021)
- Safari 16.4+ (March 2023)
- Node.js 16+ (native support)

Use feature detection before loading SIMD modules:
```typescript
import { isSimdSupported, selectSimdModule } from '@livecalc/engine';

const selection = selectSimdModule({
    simdModule: './livecalc-simd.mjs',
    scalarModule: './livecalc.mjs',
});
```

## References

- [WebAssembly SIMD Proposal](https://github.com/WebAssembly/simd)
- [Emscripten SIMD Documentation](https://emscripten.org/docs/porting/simd.html)
- [V8 SIMD Blog Post](https://v8.dev/features/simd)
