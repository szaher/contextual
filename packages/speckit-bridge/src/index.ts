// @ctxkit/speckit-bridge — Bidirectional sync between spec-kit and .ctx files

// Types
export type {
  MappingRule,
  SyncState,
  ImportResult,
  ExportResult,
  ValidationResult,
  SyncResult,
  ConstitutionViolation,
  TransformType,
  SyncDirection,
} from './types.js';

// Importer
export {
  parseConstitution,
  parseComponentSpec,
  importConstitution,
  importSpecs,
} from './importer.js';

// Exporter
export { exportToSpecKit } from './exporter.js';

// Validator
export { validateConstitution } from './validator.js';

// Sync
export {
  syncBidirectional,
  loadSyncState,
  saveSyncState,
} from './sync.js';
