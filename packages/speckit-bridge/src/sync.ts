import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as yaml from 'js-yaml';
import type { SyncState, SyncResult, SyncDirection } from './types.js';
import { importConstitution, importSpecs } from './importer.js';
import { exportToSpecKit } from './exporter.js';

const SYNC_STATE_FILE = '.ctxl.speckit-sync.yaml';

/**
 * Load the sync state file from the repository root.
 */
export function loadSyncState(repoRoot: string): SyncState[] {
  const statePath = join(repoRoot, SYNC_STATE_FILE);
  if (!existsSync(statePath)) {
    return [];
  }

  const content = readFileSync(statePath, 'utf-8');
  const data = yaml.load(content);
  if (!Array.isArray(data)) return [];
  return data as SyncState[];
}

/**
 * Save the sync state file to the repository root.
 */
export function saveSyncState(repoRoot: string, states: SyncState[]): void {
  const statePath = join(repoRoot, SYNC_STATE_FILE);
  writeFileSync(statePath, yaml.dump(states), 'utf-8');
}

/**
 * Bidirectional sync between spec-kit artifacts and .ctx files.
 * Compares modification times and syncs newer to older.
 * Detects both-modified conflicts.
 */
export function syncBidirectional(
  repoRoot: string,
  options: {
    constitutionPath?: string;
    specsDir?: string;
    outputDir?: string;
    dryRun?: boolean;
    forceDirection?: 'spec-to-ctx' | 'ctx-to-spec';
  } = {},
): SyncResult {
  const constitutionPath = options.constitutionPath || '.specify/memory/constitution.md';
  const specsDir = options.specsDir || 'specs/';
  const outputDir = options.outputDir || 'specs/exported/';

  const result: SyncResult = {
    synced: 0,
    conflicts: 0,
    direction_used: 'bidirectional',
    files_updated: [],
    specs_updated: [],
  };

  const existingStates = loadSyncState(repoRoot);
  const newStates: SyncState[] = [];
  const now = new Date().toISOString();

  // Determine sync direction for constitution
  const constFullPath = join(repoRoot, constitutionPath);
  const rootCtxPath = join(repoRoot, '.ctx');

  if (existsSync(constFullPath)) {
    const direction = determineDirection(
      constFullPath,
      rootCtxPath,
      existingStates.find((s) => s.spec_path === constitutionPath),
      options.forceDirection,
    );

    if (direction === 'conflict') {
      result.conflicts++;
    } else if (direction === 'spec-to-ctx' || direction === 'import_only') {
      if (!options.dryRun) {
        const importResult = importConstitution(repoRoot, constitutionPath, false);
        result.files_updated.push(...importResult.files_updated);
      }
      result.synced++;
      result.direction_used = 'import_only';
    } else if (direction === 'ctx-to-spec' || direction === 'export_only') {
      if (!options.dryRun) {
        const exportResult = exportToSpecKit(repoRoot, outputDir);
        result.specs_updated.push(...exportResult.exported_files);
      }
      result.synced++;
      result.direction_used = 'export_only';
    }

    newStates.push({
      spec_path: constitutionPath,
      ctx_path: '.ctx',
      spec_mtime: getMtime(constFullPath),
      ctx_mtime: existsSync(rootCtxPath) ? getMtime(rootCtxPath) : now,
      last_synced: now,
      direction: direction === 'conflict' ? 'bidirectional' : (direction as SyncDirection),
    });
  }

  // Determine sync direction for specs directory
  const specsFullDir = join(repoRoot, specsDir);
  if (existsSync(specsFullDir)) {
    const specsMtime = getLatestMtime(specsFullDir);
    const ctxMtime = existsSync(rootCtxPath) ? getMtime(rootCtxPath) : '1970-01-01T00:00:00Z';
    const existingState = existingStates.find((s) => s.spec_path === specsDir);

    const direction = determineDirectionFromTimes(
      specsMtime,
      ctxMtime,
      existingState?.last_synced,
      options.forceDirection,
    );

    if (direction === 'conflict') {
      result.conflicts++;
    } else if (direction === 'spec-to-ctx') {
      if (!options.dryRun) {
        const importResult = importSpecs(repoRoot, specsDir, false);
        result.files_updated.push(...importResult.files_updated);
      }
      result.synced++;
    } else if (direction === 'ctx-to-spec') {
      if (!options.dryRun) {
        const exportResult = exportToSpecKit(repoRoot, outputDir);
        result.specs_updated.push(...exportResult.exported_files);
      }
      result.synced++;
    }

    newStates.push({
      spec_path: specsDir,
      ctx_path: '.ctx',
      spec_mtime: specsMtime,
      ctx_mtime: ctxMtime,
      last_synced: now,
      direction: direction === 'conflict' ? 'bidirectional' : (direction as SyncDirection),
    });
  }

  // Save sync state
  if (!options.dryRun) {
    saveSyncState(repoRoot, newStates);
  }

  return result;
}

function determineDirection(
  specPath: string,
  ctxPath: string,
  existingState: SyncState | undefined,
  forceDirection?: 'spec-to-ctx' | 'ctx-to-spec',
): SyncDirection | 'conflict' | 'spec-to-ctx' | 'ctx-to-spec' {
  if (forceDirection) {
    return forceDirection;
  }

  if (!existsSync(ctxPath)) {
    return 'import_only';
  }

  const specMtime = getMtime(specPath);
  const ctxMtime = getMtime(ctxPath);

  return determineDirectionFromTimes(specMtime, ctxMtime, existingState?.last_synced, forceDirection);
}

function determineDirectionFromTimes(
  specMtime: string,
  ctxMtime: string,
  lastSynced: string | undefined,
  forceDirection?: 'spec-to-ctx' | 'ctx-to-spec',
): SyncDirection | 'conflict' | 'spec-to-ctx' | 'ctx-to-spec' {
  if (forceDirection) {
    return forceDirection;
  }

  const specTime = new Date(specMtime).getTime();
  const ctxTime = new Date(ctxMtime).getTime();
  const syncTime = lastSynced ? new Date(lastSynced).getTime() : 0;

  const specModified = specTime > syncTime;
  const ctxModified = ctxTime > syncTime;

  if (specModified && ctxModified) {
    return 'conflict';
  }

  if (specModified) {
    return 'spec-to-ctx';
  }

  if (ctxModified) {
    return 'ctx-to-spec';
  }

  // Neither modified — no sync needed, return bidirectional as no-op
  return 'bidirectional';
}

function getMtime(filePath: string): string {
  try {
    const stat = statSync(filePath);
    return stat.mtime.toISOString();
  } catch {
    return '1970-01-01T00:00:00Z';
  }
}

function getLatestMtime(dirPath: string): string {
  let latest = '1970-01-01T00:00:00Z';

  try {
    const entries = readdirSync(dirPath);
    for (const entry of entries) {
      if (entry.endsWith('.md')) {
        const mtime = getMtime(join(dirPath, entry));
        if (mtime > latest) latest = mtime;
      }
    }
  } catch { /* skip */ }

  return latest;
}
