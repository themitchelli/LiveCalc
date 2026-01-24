# SKIP: US-004 AC-02 - JavaScript wrapper (livecalc.js) bundled in extension

## Acceptance Criterion
JavaScript wrapper (livecalc.js) bundled in extension

## Reason for Skipping
This acceptance criterion references a specific JS wrapper file:

1. **Build Artifact**: The JS wrapper is part of the engine build output
2. **Module Format**: May be compiled as .mjs (ES module) rather than .js
3. **Bundled by esbuild**: The extension uses esbuild which may inline or rename modules

## Alternative Verification
- Check dist/ directory for engine-related JavaScript
- The engine wrapper code lives in src/engine/livecalc-engine.ts
- Extract .vsix and check for bundled JS files
