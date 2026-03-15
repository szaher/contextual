# Auth Module Specification

Functional requirements for the authentication module. Each requirement
is prefixed with FR-AUTH- and defines a specific behavior that the module
must implement.

## FR-AUTH-001: Password Hashing with bcrypt

**Status:** Accepted
**Date:** 2025-06-10

All user passwords MUST be hashed using bcrypt with a cost factor of at
least 12. Plaintext passwords MUST NOT be stored or logged anywhere in the
system. Password comparison MUST use constant-time comparison to prevent
timing attacks.

## FR-AUTH-002: Token Expiry Configuration

**Status:** Accepted
**Date:** 2025-06-10

Access tokens MUST expire after 15 minutes. Refresh tokens MUST expire
after 7 days. Token expiry values MUST be configurable via environment
variables (`ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL`) but the defaults
specified here MUST be the fallback values.

## FR-AUTH-003: Login Rate Limiting

**Status:** Accepted
**Date:** 2025-07-01

Failed login attempts MUST be rate-limited to a maximum of 5 attempts per
IP address per 5-minute window. After exceeding the limit, subsequent
attempts MUST receive HTTP 429 with a `Retry-After` header. Rate limit
state MUST be stored in Redis, not in application memory.
