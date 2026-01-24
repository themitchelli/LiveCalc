# SKIP: US-006 AC 7 - Documented deployment examples for both runtimes

## Acceptance Criterion
Documented deployment examples for both runtimes

## Reason for Skipping
This is a documentation requirement that cannot be automatically verified:
- Documentation quality is subjective
- Requires human review to assess completeness
- Examples need to be tested manually

## Manual Verification
Check documentation (README, docs folder) for:

1. **Node.js deployment example:**
   ```typescript
   import { LiveCalcEngine } from '@livecalc/engine';
   const engine = new LiveCalcEngine();
   await engine.initialize();
   ```

2. **Wasmtime deployment example:**
   ```bash
   wasmtime run --wasm-features=threads livecalc.wasm -- --input policies.bin --output results.json
   ```

3. **Docker/container deployment guidance**
4. **Memory configuration for production**
