import { resolve, relative, sep } from 'node:path';

/**
 * Score based on directory distance from working directory to .ctx source.
 * Closer = higher score. Same directory = 1.0, each level up reduces score.
 */
export function scoreLocality(
  workingDir: string,
  ctxSourcePath: string,
  repoRoot: string,
): number {
  const absWorking = resolve(workingDir);
  const absSource = resolve(repoRoot, ctxSourcePath);
  // Get the directory containing the .ctx file
  const sourceDir = absSource.endsWith('.ctx')
    ? resolve(absSource, '..')
    : absSource;

  const relPath = relative(sourceDir, absWorking);

  // If working dir IS the source dir, distance = 0
  if (relPath === '' || relPath === '.') {
    return 1.0;
  }

  // Count directory levels of separation
  const parts = relPath.split(sep).filter((p) => p !== '.');
  const upCount = parts.filter((p) => p === '..').length;
  const depth = parts.length;

  // If source is a parent of working dir (upCount === 0), it's close
  // If we need to go up (..), it's farther away
  const distance = upCount > 0 ? depth : depth;

  // Decay: 1.0 for distance=0, 0.8 for distance=1, 0.6, 0.4, etc.
  // Minimum score: 0.1
  const score = Math.max(0.1, 1.0 - distance * 0.2);

  return Math.round(score * 100) / 100;
}
