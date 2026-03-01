# Security

ctxl is designed to handle real-world codebases where secrets exist. The security model ensures that credentials, tokens, and keys are never persisted in `.ctx` files, proposals, or logs.

## Secret Detection

ctxl detects 8 patterns of secrets:

| Pattern | Example Detected |
|---------|-----------------|
| AWS Access Key ID | `AKIAIOSFODNN7EXAMPLE` |
| AWS Secret Access Key | `aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxR...` |
| Generic API Key/Token | `api_key = sk-abcdefghijklmnop123456` |
| PEM Private Key | `-----BEGIN RSA PRIVATE KEY-----` |
| Connection String | `postgres://user:pass@host:5432/db` |
| GitHub Token | `ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg` |
| Bearer Token | `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| Base64 Secret | `password = dGhpcyBpcyBhIHNlY3JldCBwYXNzd29yZA==` |

Detection uses regular expressions tuned to minimize false positives while catching real credentials.

## Automatic Redaction

When a secret is detected in content that would be written to a diff, proposal, or log, it is automatically replaced with a `[REDACTED:<type>]` marker:

```
- api_key: sk-abcdefghijklmnop123456789012345678901234
+ api_key: [REDACTED:api_key]
```

Redaction happens before content reaches:
- Proposal diffs (`generateDiff` function)
- CLI output
- Dashboard display
- Audit log entries

## Usage in Code

### Check for Secrets

```typescript
import { containsSecrets } from '@ctxl/core'

if (containsSecrets(someContent)) {
  // Content has potential secrets
}
```

### Detect Specific Secrets

```typescript
import { detectSecrets } from '@ctxl/core'

const matches = detectSecrets(fileContent)
for (const match of matches) {
  console.log(`Found ${match.name} at line ${match.line}`)
}
```

Returns an array of `SecretMatch` objects:

```typescript
interface SecretMatch {
  name: string;    // Pattern name (e.g., "aws_access_key", "github_token")
  index: number;   // Character index in the line
  length: number;  // Length of the matched text
  line: number;    // Line number (1-based)
}
```

### Redact Secrets

```typescript
import { redactSecrets } from '@ctxl/core'

const safe = redactSecrets(unsafeContent)
// All detected secrets replaced with [REDACTED:<type>]
```

## Diff Safety

The `generateDiff` function automatically scans both old and new content for secrets before producing the unified diff:

```typescript
import { generateDiff } from '@ctxl/core'

const result = generateDiff(oldContent, newContent, '.ctx')

console.log(result.diff)              // Safe diff with secrets redacted
console.log(result.hasChanges)        // Whether any changes exist
console.log(result.secretsRedacted)   // Whether secrets were found and redacted
```

This means:
- If the old `.ctx` content accidentally contained a secret, it is redacted in the diff
- If a proposed update would introduce a secret, it is caught and redacted
- The `secretsRedacted` flag tells the reviewer that redaction occurred

## Ignore Policies

Ignore policies provide path-level protection:

### never_read

Paths matching `never_read` patterns are excluded from context assembly entirely. ctxl will not read these files, include them as key files, or reference them in Context Packs.

```yaml
ignore:
  never_read:
    - ".env"
    - ".env.*"
    - "secrets/**"
    - "*.pem"
    - ".ssh/*"
    - "credentials.json"
```

### never_log

Paths matching `never_log` patterns are excluded from event recording and audit logs. Even if a file is touched during a session, its path will not appear in logged data.

```yaml
ignore:
  never_log:
    - ".env"
    - "*.key"
    - ".aws/credentials"
```

### Deny-List Semantics

Ignore policies use deny-list semantics that grow monotonically through the hierarchy:

- Global profile adds `.env` and `*.pem` to `never_read`
- Workspace profile adds `secrets/**` to `never_read`
- Result: `.env`, `*.pem`, AND `secrets/**` are all blocked

A child profile cannot remove a parent's ignore rule. This prevents accidental exposure.

## Data Locality

All ctxl data stays on the local machine:

| Data | Location |
|------|----------|
| `.ctx` files | In the repository (git-tracked) |
| Session data | `~/.ctxl/data.db` (SQLite) |
| Daemon logs | `~/.ctxl/daemon.log` |
| PID file | `~/.ctxl/daemon.pid` |
| Configuration | `~/.ctxl/config.yaml` (global), `.ctxl/config.yaml` (workspace) |

No data is sent to external services. The daemon binds to `127.0.0.1:3742` by default and is not accessible from other machines.

## Best Practices

### 1. Set Up Ignore Rules Early

Add ignore rules to your workspace profile before team members start using ctxl:

```yaml
# .ctxl/config.yaml
ignore:
  never_read:
    - ".env*"
    - "secrets/**"
    - "*.pem"
    - "*.key"
    - ".aws/*"
```

### 2. Review Proposals Carefully

Even though ctxl redacts detected secrets, the patterns are not exhaustive. Always review proposals before applying them, especially those touching configuration files.

### 3. Lock Security-Related Entries

Mark security contracts and decisions as locked with an explicit owner:

```yaml
contracts:
  - name: security-policy
    locked: true
    owner: security-team
    content: "..."
```

This prevents automated modifications and ensures human review.

### 4. Audit Regularly

Check the audit log for unexpected changes:

```bash
curl "http://localhost:3742/api/v1/audit?limit=50"
```

Or use the dashboard's audit log view with date range filtering.

### 5. Exclude Sensitive Directories from .ctx

Do not create `.ctx` files in directories that primarily contain secrets. Instead, reference the directory from a parent `.ctx` without including sensitive content:

```yaml
# BAD: .ctx inside secrets/
# secrets/.ctx  <-- Don't do this

# GOOD: Reference from parent with appropriate scope
# root .ctx
ignore:
  never_read: ["secrets/**"]
```

## Next Steps

- Configure [Profiles](/guide/profiles) with ignore rules
- Set up [Contracts](/guide/contracts) with locked security policies
- Learn about [Proposals](/guide/proposals) and the review workflow
