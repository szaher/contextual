/** Bootstrap types for analyzing codebases and generating initial .ctx files */

/** Options for bootstrap analysis */
export interface BootstrapOptions {
  /** Analysis mode: quick (heuristics) or full (AI-assisted) */
  mode: 'quick' | 'full';
  /** Skip directories that already have .ctx files */
  skip_existing: boolean;
  /** Minimum number of files in a directory to generate .ctx */
  min_files: number;
  /** Only analyze (don't write), return proposals */
  dry_run: boolean;
}

/** Result of analyzing a single directory */
export interface AnalysisResult {
  /** Relative path to the analyzed directory */
  directory: string;
  /** Generated summary text */
  summary: string;
  /** Detected primary language */
  primary_language: string;
  /** All detected languages */
  languages: string[];
  /** Detected framework (if any) */
  framework: string | null;
  /** Detected entry point files (relative to repo root) */
  entry_points: string[];
  /** Detected test files (relative to repo root) */
  test_files: string[];
  /** Source files (relative to repo root, excluding tests) */
  source_files: string[];
  /** Inferred tags from directory name and file extensions */
  tags: string[];
  /** Commands extracted from config files (package.json, Makefile, etc.) */
  commands: Record<string, string>;
  /** Detected dependencies (other directories) */
  dependencies: string[];
  /** Total file count in directory */
  file_count: number;
}

/** A proposal for a .ctx file to be created (matches MCP contract output) */
export interface BootstrapProposal {
  /** Target path for the .ctx file (relative to repo root) */
  path: string;
  /** Summary text for the .ctx file */
  summary: string;
  /** Key file paths */
  key_files: string[];
  /** Tags */
  tags: string[];
  /** Commands */
  commands: Record<string, string>;
  /** Detected language */
  language: string;
  /** Detected framework */
  framework: string | null;
  /** Estimated token count */
  token_estimate: number;
  /** Internal: analysis result this proposal is based on */
  _analysis?: AnalysisResult;
  /** Internal: full CtxFile object for writing */
  _ctx?: unknown;
}

/** Default bootstrap options */
export const DEFAULT_BOOTSTRAP_OPTIONS: BootstrapOptions = {
  mode: 'quick',
  skip_existing: true,
  min_files: 3,
  dry_run: false,
};
