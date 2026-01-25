/**
 * Model Asset Packaging for Cloud Execution
 *
 * Bundles all model files (config, WASM binaries, Python scripts, assumptions)
 * into a single .zip archive with integrity verification.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import JSZip from 'jszip';
import { LiveCalcConfig } from '../types';
import { Logger } from '../logging/logger';

/**
 * Represents a file to be included in the package
 */
export interface PackageAsset {
  /** Relative path within the package */
  relativePath: string;
  /** Absolute path on the file system */
  absolutePath: string;
  /** SHA-256 hash of the file content */
  hash?: string;
  /** File size in bytes */
  size?: number;
  /** File type category */
  type: 'config' | 'wasm' | 'python' | 'assumption' | 'policy' | 'model';
}

/**
 * Manifest of all assets in the package
 */
export interface PackageManifest {
  /** Package format version */
  version: string;
  /** Package creation timestamp */
  createdAt: string;
  /** List of all assets with hashes */
  assets: PackageAsset[];
  /** SHA-256 hash of the entire package (excluding manifest itself) */
  packageHash?: string;
  /** Config file content for validation */
  config: LiveCalcConfig;
}

/**
 * Packaging options
 */
export interface PackageOptions {
  /** Include policy data in the package (default: false, prefer cloud data sources) */
  includePolicies?: boolean;
  /** Include local assumption files (default: true) */
  includeAssumptions?: boolean;
  /** Validate all referenced files exist (default: true) */
  validateAssets?: boolean;
  /** Output file path (default: workspace/model-package.zip) */
  outputPath?: string;
}

/**
 * Packaging result
 */
export interface PackageResult {
  /** Success flag */
  success: boolean;
  /** Path to the created package file */
  packagePath?: string;
  /** Package manifest */
  manifest?: PackageManifest;
  /** Total package size in bytes */
  packageSize?: number;
  /** Asset count */
  assetCount?: number;
  /** Error message if packaging failed */
  error?: string;
  /** List of missing assets (if validation failed) */
  missingAssets?: string[];
}

/**
 * ModelPackager: Bundles all model files for cloud execution
 */
export class ModelPackager {
  private logger: Logger;
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.logger = Logger.getInstance();
  }

  /**
   * Package all model assets into a .zip bundle
   */
  async packageModel(
    config: LiveCalcConfig,
    configPath: string,
    options: PackageOptions = {}
  ): Promise<PackageResult> {
    try {
      this.logger.info('Starting model packaging...');

      // Set defaults
      const opts: Required<PackageOptions> = {
        includePolicies: options.includePolicies ?? false,
        includeAssumptions: options.includeAssumptions ?? true,
        validateAssets: options.validateAssets ?? true,
        outputPath: options.outputPath ?? path.join(this.workspaceRoot, 'model-package.zip'),
      };

      // Collect all assets
      const assets: PackageAsset[] = [];
      const configDir = path.dirname(configPath);

      // Add config file
      assets.push({
        relativePath: 'livecalc.config.json',
        absolutePath: configPath,
        type: 'config',
      });

      // Add model file
      const modelPath = this.resolveAssetPath(config.model, configDir);
      assets.push({
        relativePath: path.basename(config.model),
        absolutePath: modelPath,
        type: 'model',
      });

      // Add WASM binaries from pipeline nodes
      if (config.pipeline?.nodes) {
        for (const node of config.pipeline.nodes) {
          if (node.engine.startsWith('wasm://')) {
            const wasmName = node.engine.replace('wasm://', '');
            const wasmPath = this.findWasmBinary(wasmName, configDir);
            if (wasmPath) {
              assets.push({
                relativePath: `wasm/${path.basename(wasmPath)}`,
                absolutePath: wasmPath,
                type: 'wasm',
              });
              // Also include .mjs wrapper if exists
              const mjsPath = wasmPath.replace('.wasm', '.mjs');
              if (await this.fileExists(mjsPath)) {
                assets.push({
                  relativePath: `wasm/${path.basename(mjsPath)}`,
                  absolutePath: mjsPath,
                  type: 'wasm',
                });
              }
            }
          } else if (node.engine.startsWith('python://')) {
            const pyName = node.engine.replace('python://', '');
            const pyPath = this.findPythonScript(pyName, configDir);
            if (pyPath) {
              assets.push({
                relativePath: `python/${path.basename(pyPath)}`,
                absolutePath: pyPath,
                type: 'python',
              });
            }
          }
        }
      }

      // Add policy data if requested
      if (opts.includePolicies && config.policies) {
        const policyPath = this.resolveAssetPath(config.policies, configDir);
        assets.push({
          relativePath: `data/${path.basename(config.policies)}`,
          absolutePath: policyPath,
          type: 'policy',
        });
      }

      // Add assumption files if requested
      if (opts.includeAssumptions) {
        if (config.assumptions.mortality && this.isLocalFile(config.assumptions.mortality)) {
          const mortalityPath = this.resolveAssetPath(config.assumptions.mortality, configDir);
          assets.push({
            relativePath: `assumptions/${path.basename(config.assumptions.mortality)}`,
            absolutePath: mortalityPath,
            type: 'assumption',
          });
        }
        if (config.assumptions.lapse && this.isLocalFile(config.assumptions.lapse)) {
          const lapsePath = this.resolveAssetPath(config.assumptions.lapse, configDir);
          assets.push({
            relativePath: `assumptions/${path.basename(config.assumptions.lapse)}`,
            absolutePath: lapsePath,
            type: 'assumption',
          });
        }
        if (config.assumptions.expenses && this.isLocalFile(config.assumptions.expenses)) {
          const expensesPath = this.resolveAssetPath(config.assumptions.expenses, configDir);
          assets.push({
            relativePath: `assumptions/${path.basename(config.assumptions.expenses)}`,
            absolutePath: expensesPath,
            type: 'assumption',
          });
        }
      }

      // Validate assets exist
      if (opts.validateAssets) {
        const missing = await this.validateAssets(assets);
        if (missing.length > 0) {
          this.logger.error(`Missing ${missing.length} required assets`);
          return {
            success: false,
            error: `Missing ${missing.length} required assets`,
            missingAssets: missing,
          };
        }
      }

      // Compute hashes for all assets
      await this.computeAssetHashes(assets);

      // Create manifest
      const manifest: PackageManifest = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        assets,
        config,
      };

      // Create ZIP bundle
      const zip = new JSZip();

      // Add manifest
      zip.file('manifest.json', JSON.stringify(manifest, null, 2));

      // Add all assets
      for (const asset of assets) {
        const content = await vscode.workspace.fs.readFile(vscode.Uri.file(asset.absolutePath));
        zip.file(asset.relativePath, content);
      }

      // Generate ZIP content
      const zipContent = await zip.generateAsync({
        type: 'uint8array',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 },
      });

      // Write to file
      await vscode.workspace.fs.writeFile(vscode.Uri.file(opts.outputPath), zipContent);

      // Compute package hash
      const packageHash = this.computeHash(zipContent);
      manifest.packageHash = packageHash;

      this.logger.info(`Package created: ${opts.outputPath} (${zipContent.length} bytes, hash: ${packageHash.substring(0, 8)}...)`);

      return {
        success: true,
        packagePath: opts.outputPath,
        manifest,
        packageSize: zipContent.length,
        assetCount: assets.length,
      };
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to package model', errorObj);
      return {
        success: false,
        error: errorObj.message,
      };
    }
  }

  /**
   * Resolve asset path relative to config directory
   */
  private resolveAssetPath(assetRef: string, configDir: string): string {
    // Handle local:// prefix
    if (assetRef.startsWith('local://')) {
      assetRef = assetRef.replace('local://', '');
    }

    // Resolve relative to config directory
    if (!path.isAbsolute(assetRef)) {
      return path.resolve(configDir, assetRef);
    }

    return assetRef;
  }

  /**
   * Check if a reference is a local file (not assumptions:// or other protocol)
   */
  private isLocalFile(ref: string): boolean {
    return !ref.startsWith('assumptions://') && !ref.startsWith('blob://');
  }

  /**
   * Find WASM binary by name
   */
  private findWasmBinary(name: string, configDir: string): string | null {
    // Common locations for WASM binaries
    const candidates = [
      path.join(configDir, `${name}.wasm`),
      path.join(configDir, 'wasm', `${name}.wasm`),
      path.join(configDir, 'dist', 'wasm', `${name}.wasm`),
      path.join(this.workspaceRoot, 'dist', 'wasm', `${name}.wasm`),
    ];

    for (const candidate of candidates) {
      if (this.fileExistsSync(candidate)) {
        return candidate;
      }
    }

    this.logger.warn(`WASM binary not found: ${name}`);
    return null;
  }

  /**
   * Find Python script by name
   */
  private findPythonScript(name: string, configDir: string): string | null {
    // Common locations for Python scripts
    const candidates = [
      path.join(configDir, `${name}.py`),
      path.join(configDir, 'python', `${name}.py`),
      path.join(configDir, 'scripts', `${name}.py`),
    ];

    for (const candidate of candidates) {
      if (this.fileExistsSync(candidate)) {
        return candidate;
      }
    }

    this.logger.warn(`Python script not found: ${name}`);
    return null;
  }

  /**
   * Validate that all assets exist on the file system
   */
  private async validateAssets(assets: PackageAsset[]): Promise<string[]> {
    const missing: string[] = [];

    for (const asset of assets) {
      const exists = await this.fileExists(asset.absolutePath);
      if (!exists) {
        missing.push(asset.relativePath);
        this.logger.warn(`Asset not found: ${asset.absolutePath}`);
      }
    }

    return missing;
  }

  /**
   * Compute SHA-256 hashes for all assets
   */
  private async computeAssetHashes(assets: PackageAsset[]): Promise<void> {
    for (const asset of assets) {
      try {
        const content = await vscode.workspace.fs.readFile(vscode.Uri.file(asset.absolutePath));
        asset.hash = this.computeHash(content);
        asset.size = content.length;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed to hash asset: ${asset.absolutePath} - ${msg}`);
      }
    }
  }

  /**
   * Compute SHA-256 hash of content
   */
  private computeHash(content: Uint8Array): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Check if file exists (async)
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if file exists (sync)
   */
  private fileExistsSync(filePath: string): boolean {
    try {
      const fs = require('fs');
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }
}
