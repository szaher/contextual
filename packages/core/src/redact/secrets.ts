const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  // AWS Access Key ID
  { name: 'aws_access_key', pattern: /(?:AKIA|ASIA)[A-Z0-9]{16}/ },
  // AWS Secret Access Key (40 chars base64-like)
  { name: 'aws_secret_key', pattern: /(?:aws_secret_access_key|secret_key)\s*[:=]\s*["']?[A-Za-z0-9/+=]{40}["']?/i },
  // Generic API key/token patterns (high entropy hex or base64)
  { name: 'api_key', pattern: /(?:api[_-]?key|api[_-]?token|auth[_-]?token|access[_-]?token|secret[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9_\-/.+=]{20,}["']?/i },
  // PEM private keys
  { name: 'private_key', pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/ },
  // Connection strings (postgres, mysql, mongodb, redis)
  { name: 'connection_string', pattern: /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"']+@[^\s"']+/ },
  // GitHub personal access tokens
  { name: 'github_token', pattern: /gh[ps]_[A-Za-z0-9_]{36,}/ },
  // Generic bearer tokens
  { name: 'bearer_token', pattern: /Bearer\s+[A-Za-z0-9_\-/.+=]{20,}/i },
  // Base64-encoded secrets (long, high-entropy)
  { name: 'base64_secret', pattern: /(?:password|passwd|secret|token)\s*[:=]\s*["']?[A-Za-z0-9+/]{40,}={0,2}["']?/i },
];

export interface SecretMatch {
  name: string;
  index: number;
  length: number;
  line: number;
}

/**
 * Scan text for potential secrets.
 */
export function detectSecrets(text: string): SecretMatch[] {
  const matches: SecretMatch[] = [];
  const lines = text.split('\n');

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    for (const { name, pattern } of SECRET_PATTERNS) {
      const match = pattern.exec(line);
      if (match) {
        matches.push({
          name,
          index: match.index,
          length: match[0].length,
          line: lineNum + 1,
        });
      }
    }
  }

  return matches;
}

/**
 * Redact detected secrets from text, replacing with [REDACTED:<type>].
 */
export function redactSecrets(text: string): string {
  let result = text;
  for (const { name, pattern } of SECRET_PATTERNS) {
    const globalPattern = new RegExp(pattern.source, pattern.flags.includes('i') ? 'gi' : 'g');
    result = result.replace(globalPattern, `[REDACTED:${name}]`);
  }
  return result;
}

/**
 * Check if text contains any potential secrets.
 */
export function containsSecrets(text: string): boolean {
  return SECRET_PATTERNS.some(({ pattern }) => pattern.test(text));
}
