import { dirname } from 'node:path';

/**
 * Tracks which directories have been modified during an agent session.
 * Accepts file paths from PostToolUse events and groups by parent directory.
 */
export class StalenessTracker {
  /** Map of directory path → set of modified file paths */
  private modifiedDirs = new Map<string, Set<string>>();
  /** Session ID associated with this tracker */
  readonly sessionId: string;
  /** Timestamp when tracking started */
  readonly startedAt: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.startedAt = new Date().toISOString();
  }

  /**
   * Record a file modification event.
   * Groups the file by its parent directory.
   */
  trackFile(filePath: string): void {
    const dir = dirname(filePath);
    if (!this.modifiedDirs.has(dir)) {
      this.modifiedDirs.set(dir, new Set());
    }
    this.modifiedDirs.get(dir)!.add(filePath);
  }

  /**
   * Record multiple file modifications at once.
   */
  trackFiles(filePaths: string[]): void {
    for (const fp of filePaths) {
      this.trackFile(fp);
    }
  }

  /**
   * Get all directories that have been modified during this session.
   */
  getStaleDirectories(): string[] {
    return [...this.modifiedDirs.keys()];
  }

  /**
   * Get modified files for a specific directory.
   */
  getModifiedFiles(directory: string): string[] {
    return [...(this.modifiedDirs.get(directory) ?? [])];
  }

  /**
   * Get a summary of all stale directories with their modified file counts.
   */
  getSummary(): StaleSummary[] {
    return [...this.modifiedDirs.entries()].map(([dir, files]) => ({
      directory: dir,
      modified_files: [...files],
      file_count: files.size,
    }));
  }

  /**
   * Check if any files have been tracked.
   */
  hasModifications(): boolean {
    return this.modifiedDirs.size > 0;
  }

  /**
   * Get total number of stale directories.
   */
  get staleCount(): number {
    return this.modifiedDirs.size;
  }

  /**
   * Clear all tracked modifications.
   */
  reset(): void {
    this.modifiedDirs.clear();
  }
}

export interface StaleSummary {
  directory: string;
  modified_files: string[];
  file_count: number;
}

/**
 * Determine if a tool event represents a file modification.
 * Returns the file path if it's a modifying tool, null otherwise.
 */
export function extractModifiedPath(
  toolName: string,
  toolInput: Record<string, unknown>,
): string | null {
  // Tools that modify files
  const modifyingTools = ['Edit', 'Write', 'NotebookEdit'];
  if (!modifyingTools.includes(toolName)) return null;

  // Extract file path from tool input
  const filePath = toolInput.file_path ?? toolInput.notebook_path;
  if (typeof filePath === 'string' && filePath.length > 0) {
    return filePath;
  }

  return null;
}
