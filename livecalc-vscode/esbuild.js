const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * Copy WASM files from livecalc-engine build output to dist/wasm/
 */
function copyWasmFiles() {
  const wasmSourceDir = path.resolve(__dirname, '../livecalc-engine/build-wasm');
  const wasmDestDir = path.resolve(__dirname, 'dist/wasm');

  // Ensure destination directory exists
  if (!fs.existsSync(wasmDestDir)) {
    fs.mkdirSync(wasmDestDir, { recursive: true });
  }

  const filesToCopy = ['livecalc.wasm', 'livecalc.mjs'];

  for (const file of filesToCopy) {
    const sourcePath = path.join(wasmSourceDir, file);
    const destPath = path.join(wasmDestDir, file);

    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, destPath);
      console.log(`Copied ${file} to dist/wasm/`);
    } else {
      console.warn(`Warning: ${file} not found at ${sourcePath}`);
    }
  }
}

/**
 * Copy node-worker.mjs from livecalc-engine/js/dist/ for parallel execution
 */
function copyWorkerFiles() {
  const jsDistDir = path.resolve(__dirname, '../livecalc-engine/js/dist');
  const wasmDestDir = path.resolve(__dirname, 'dist/wasm');

  // Ensure destination directory exists
  if (!fs.existsSync(wasmDestDir)) {
    fs.mkdirSync(wasmDestDir, { recursive: true });
  }

  // Copy the node worker file
  const workerSource = path.join(jsDistDir, 'node-worker.mjs');
  const workerDest = path.join(wasmDestDir, 'node-worker.mjs');

  if (fs.existsSync(workerSource)) {
    fs.copyFileSync(workerSource, workerDest);
    console.log('Copied node-worker.mjs to dist/wasm/');
  } else {
    console.warn(`Warning: node-worker.mjs not found at ${workerSource}`);
  }

  // Also copy the chunk files that node-worker.mjs depends on
  const files = fs.readdirSync(jsDistDir);
  for (const file of files) {
    if (file.startsWith('chunk-') && file.endsWith('.mjs')) {
      const sourcePath = path.join(jsDistDir, file);
      const destPath = path.join(wasmDestDir, file);
      fs.copyFileSync(sourcePath, destPath);
      console.log(`Copied ${file} to dist/wasm/`);
    }
  }
}

async function main() {
  // Copy WASM and worker files before build
  copyWasmFiles();
  copyWorkerFiles();

  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'info',
    plugins: [
      {
        name: 'wasm-loader',
        setup(build) {
          // Mark .wasm files as external (they'll be loaded at runtime)
          build.onResolve({ filter: /\.wasm$/ }, (args) => {
            return {
              path: args.path,
              external: true,
            };
          });
          // Mark .mjs files from wasm directory as external
          build.onResolve({ filter: /livecalc\.mjs$/ }, (args) => {
            return {
              path: args.path,
              external: true,
            };
          });
        },
      },
    ],
  });

  if (watch) {
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
