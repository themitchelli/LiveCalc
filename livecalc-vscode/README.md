# LiveCalc for VS Code

Instant actuarial model feedback with an embedded WASM engine.

## Features

- **MGA Syntax Highlighting** - Full syntax support for .mga model files
- **Instant Execution** - Run projections directly in VS Code without external dependencies
- **Progress Tracking** - Real-time progress updates during execution
- **Configurable** - JSON configuration with IntelliSense support

## Quick Start

1. Install the LiveCalc extension
2. Open a folder containing your actuarial model
3. Run **LiveCalc: Initialize Project** from the Command Palette (Cmd+Shift+P)
4. Press **Cmd+Shift+R** (Mac) or **Ctrl+Shift+R** (Windows/Linux) to run

## Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| LiveCalc: Run | Cmd+Shift+R | Run valuation with current config |
| LiveCalc: Run in Cloud | - | Submit to cloud for large runs |
| LiveCalc: Initialize Project | - | Create default config and sample files |
| LiveCalc: Open Results Panel | - | Show results visualization |

## Configuration

Create a `livecalc.config.json` file in your workspace root:

```json
{
  "$schema": "./node_modules/livecalc-vscode/schemas/livecalc.config.schema.json",
  "model": "model.mga",
  "assumptions": {
    "mortality": "local://assumptions/mortality.csv",
    "lapse": "local://assumptions/lapse.csv",
    "expenses": "local://assumptions/expenses.json"
  },
  "scenarios": {
    "count": 1000,
    "seed": 42,
    "interestRate": {
      "initial": 0.04,
      "drift": 0.001,
      "volatility": 0.02
    }
  }
}
```

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `livecalc.autoRunOnSave` | `true` | Auto-run on file save |
| `livecalc.logLevel` | `info` | Logging level (error/warn/info/debug) |
| `livecalc.maxWorkers` | `0` | Max worker threads (0 = auto) |
| `livecalc.timeout` | `300` | Execution timeout in seconds |

## MGA Language

MGA (Model Grammar for Actuaries) is a domain-specific language for actuarial projections:

```mga
PRODUCT TermLife
  TERM 20
  SUM_ASSURED 100000
  PREMIUM 1200
END

PROJECTION
  survival = 1.0
  FOR year IN 1..TERM
    deaths = survival * MORTALITY[AGE + year]
    survival = survival - deaths
  END
  RETURN npv
END
```

## Requirements

- VS Code 1.85.0 or later
- No external dependencies (WASM engine is embedded)

## Known Issues

- Results panel not yet implemented (coming in next release)
- Cloud execution not yet implemented

## Release Notes

See [CHANGELOG.md](CHANGELOG.md) for release notes.

## License

MIT
