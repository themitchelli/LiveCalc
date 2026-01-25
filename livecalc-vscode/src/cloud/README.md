# Cloud Execution Module

This module handles packaging, validating, and preparing model assets for execution on cloud infrastructure.

## Components

### ModelPackager

Bundles all model files into a single `.zip` archive with integrity verification.

**Key Features:**
- Collects all required assets: config, model, WASM binaries, Python scripts, assumptions
- Computes SHA-256 hashes for each asset
- Creates a manifest file with asset metadata
- Supports both local files and Assumptions Manager references
- Validates assets before packaging

**Usage:**
```typescript
import { ModelPackager } from './cloud';

const packager = new ModelPackager(workspaceRoot);
const result = await packager.packageModel(config, configPath, {
  includePolicies: false,        // Prefer cloud data sources
  includeAssumptions: true,       // Include local assumption files
  validateAssets: true,           // Validate all files exist
  outputPath: 'model-package.zip' // Output path
});

if (result.success) {
  console.log(`Package created: ${result.packagePath}`);
  console.log(`Size: ${result.packageSize} bytes`);
  console.log(`Assets: ${result.assetCount}`);
  console.log(`Hash: ${result.manifest.packageHash}`);
} else {
  console.error(`Packaging failed: ${result.error}`);
  console.error(`Missing assets: ${result.missingAssets}`);
}
```

### PackageValidator

Validates package configuration and asset structure before packaging.

**Key Features:**
- Validates config structure (required fields, types)
- Validates pipeline structure (node IDs, engine formats, outputs)
- Validates mandatory assets are present (config, model, WASM/Python binaries)
- Warns about Assumptions Manager references requiring cloud access

**Usage:**
```typescript
import { PackageValidator } from './cloud';

const validator = new PackageValidator();

// Validate config structure
const configResult = validator.validateConfig(config);
if (!configResult.valid) {
  console.error('Config errors:', configResult.errors);
  console.warn('Config warnings:', configResult.warnings);
}

// Validate mandatory assets
const assetsResult = validator.validateMandatoryAssets(assetPaths, config);
if (!assetsResult.valid) {
  console.error('Missing assets:', assetsResult.errors);
}
```

## Package Structure

### Archive Contents
```
model-package.zip
├── manifest.json                    # Package metadata and asset hashes
├── livecalc.config.json            # Configuration file
├── model.mga                        # Model file
├── wasm/
│   ├── livecalc.wasm               # WASM binary
│   └── livecalc.mjs                # WASM JavaScript wrapper
├── python/
│   └── processor.py                # Python scripts (if any)
├── assumptions/
│   ├── mortality.csv               # Local assumption files
│   ├── lapse.csv
│   └── expenses.json
└── data/
    └── policies.csv                # Policy data (optional)
```

### Manifest Format

```json
{
  "version": "1.0",
  "createdAt": "2026-01-24T12:34:56.789Z",
  "assets": [
    {
      "relativePath": "livecalc.config.json",
      "absolutePath": "/path/to/livecalc.config.json",
      "hash": "abc123...",
      "size": 1234,
      "type": "config"
    },
    {
      "relativePath": "wasm/livecalc.wasm",
      "absolutePath": "/path/to/livecalc.wasm",
      "hash": "def456...",
      "size": 102285,
      "type": "wasm"
    }
  ],
  "packageHash": "fedcba...",
  "config": { ... }
}
```

## Validation Rules

### Config Validation
- **Required fields**: `model`, `assumptions` (mortality, lapse, expenses), `scenarios`
- **Scenarios**: `count` must be positive number
- **Pipeline** (if present):
  - Each node must have `id`, `engine`, `outputs`
  - Node IDs must be unique
  - Engine format must be `wasm://name` or `python://name`

### Asset Validation
- Config file must be present in package
- Model file must be present
- For each pipeline node:
  - WASM node: corresponding `.wasm` file must exist
  - Python node: corresponding `.py` file must exist
- Assumptions Manager references generate warnings (cloud worker needs access)

## Error Handling

The packager provides detailed error information:

```typescript
interface PackageResult {
  success: boolean;
  packagePath?: string;
  manifest?: PackageManifest;
  packageSize?: number;
  assetCount?: number;
  error?: string;
  missingAssets?: string[];  // List of missing file paths
}
```

Common errors:
- Missing required assets (WASM binaries, Python scripts)
- Invalid config structure
- Invalid pipeline node definitions
- File read errors

## Performance Considerations

- **Asset discovery**: Uses synchronous file existence checks for WASM/Python binaries
- **Hashing**: SHA-256 computed for each asset (~1ms per MB)
- **Compression**: DEFLATE level 9 for maximum compression
- **Memory**: Entire package built in-memory before writing to disk

For large packages (>100MB), consider:
- Excluding policy data (use cloud data sources instead)
- Streaming large WASM binaries
- Progress callbacks during packaging

## Cloud Worker Integration

The package format is designed to match the cloud worker's expectations:

```typescript
// Cloud worker unpacks to:
interface ModelAssets {
  wasmBinaries: Map<string, Uint8Array>;     // Name → binary
  pythonScripts: Map<string, string>;         // Name → source code
  config: PipelineConfig;
  assumptionRefs: string[];                   // Assumptions Manager references
}
```

The cloud worker:
1. Validates package integrity (SHA-256 hash)
2. Validates asset structure
3. Loads WASM modules and Python scripts
4. Reconstructs the SharedArrayBuffer pipeline
5. Resolves Assumptions Manager references
6. Executes the pipeline

## Testing

See `tests/cloud/model-packager.test.ts` for comprehensive test coverage:
- Config validation (valid, invalid, warnings)
- Pipeline validation (engine formats, duplicate IDs)
- Mandatory asset validation (WASM, Python, config)
- Edge cases (missing assumptions, large files, etc.)

## Future Enhancements

- Streaming large file uploads to cloud
- Delta packaging (only upload changed assets)
- Package compression optimization
- Progress callbacks for packaging operation
- Package verification API
