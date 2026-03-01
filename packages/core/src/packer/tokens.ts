/**
 * Token estimator interface for pluggable implementations.
 */
export interface TokenEstimator {
  estimate(text: string): number;
}

/**
 * Default token estimator: chars/4 approximation.
 * ~80% accuracy, zero dependencies, instant execution.
 */
export class CharsPerFourEstimator implements TokenEstimator {
  estimate(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

/** Singleton default estimator */
const defaultEstimator = new CharsPerFourEstimator();

/**
 * Estimate token count for text using the default estimator.
 */
export function estimateTokens(text: string): number {
  return defaultEstimator.estimate(text);
}

/**
 * Create a custom token estimator.
 */
export function createEstimator(estimateFn: (text: string) => number): TokenEstimator {
  return { estimate: estimateFn };
}
