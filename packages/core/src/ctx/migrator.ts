import { readFileSync, writeFileSync } from 'node:fs';
import { parseCtxFile, serializeCtxFile } from './parser.js';
import type { CtxFile } from '../types/ctx.js';
import { CURRENT_CTX_VERSION } from '../types/ctx.js';

export interface MigrationResult {
  /** Whether any migration was applied */
  migrated: boolean;
  /** Version before migration */
  fromVersion: number;
  /** Version after migration */
  toVersion: number;
  /** Description of changes applied */
  changes: string[];
}

/**
 * Registry of migration functions: from version N to N+1.
 * Each function receives the raw parsed ctx and returns the migrated version.
 */
const migrations: Record<number, (ctx: CtxFile) => { ctx: CtxFile; changes: string[] }> = {
  // Example: When version 2 is introduced, add:
  // 1: (ctx) => {
  //   // migrate from v1 to v2
  //   return { ctx: { ...ctx, version: 2 }, changes: ['Added new_field'] };
  // },
};

/**
 * Migrate a CtxFile object to the current version.
 * Applies migrations sequentially from the file's version to CURRENT_CTX_VERSION.
 */
export function migrateCtx(ctx: CtxFile): MigrationResult {
  const fromVersion = ctx.version;
  const allChanges: string[] = [];
  let current = { ...ctx };

  let version = fromVersion;
  while (version < CURRENT_CTX_VERSION) {
    const migrationFn = migrations[version];
    if (!migrationFn) {
      throw new Error(
        `No migration path from version ${version} to ${version + 1}. ` +
        `Cannot migrate .ctx file from v${fromVersion} to v${CURRENT_CTX_VERSION}.`
      );
    }
    const result = migrationFn(current);
    current = result.ctx;
    allChanges.push(...result.changes);
    version++;
  }

  return {
    migrated: fromVersion !== CURRENT_CTX_VERSION,
    fromVersion,
    toVersion: CURRENT_CTX_VERSION,
    changes: allChanges,
  };
}

/**
 * Migrate a .ctx file on disk in-place.
 * Reads the file, migrates if needed, and writes back only if changes occurred.
 * Returns the migration result.
 */
export function migrateCtxFile(filePath: string): MigrationResult {
  const content = readFileSync(filePath, 'utf-8');
  const ctx = parseCtxFile(content);

  if (ctx.version >= CURRENT_CTX_VERSION) {
    return {
      migrated: false,
      fromVersion: ctx.version,
      toVersion: ctx.version,
      changes: [],
    };
  }

  const result = migrateCtx(ctx);

  // Only write if actually migrated
  if (result.migrated) {
    // Re-apply all migrations to get the fully migrated object
    let current = { ...ctx };
    let version = ctx.version;
    while (version < CURRENT_CTX_VERSION) {
      const migrationFn = migrations[version];
      if (migrationFn) {
        current = migrationFn(current).ctx;
      }
      version++;
    }
    writeFileSync(filePath, serializeCtxFile(current), 'utf-8');
  }

  return result;
}

/**
 * Check if a .ctx file needs migration without modifying it.
 */
export function needsMigration(ctx: CtxFile): boolean {
  return ctx.version < CURRENT_CTX_VERSION;
}
