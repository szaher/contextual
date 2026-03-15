# Project Constitution

This document defines the project-wide architectural decisions that all
modules and contributors must adhere to. Each decision is prefixed with
CONST- and is considered immutable once accepted.

## CONST-001: All APIs use REST

**Status:** Accepted
**Date:** 2025-06-01

All public-facing APIs MUST use RESTful conventions with JSON request and
response bodies. Endpoints MUST follow the pattern `/api/v{N}/{resource}`.
Breaking changes MUST increment the version number.

**Rationale:** REST is well-understood by the team and the ecosystem of
tools (Postman, OpenAPI, client generators) is mature. GraphQL was
considered but rejected due to the added complexity for our use case.

## CONST-002: Authentication via JWT

**Status:** Accepted
**Date:** 2025-06-01

All authenticated API requests MUST use JWT bearer tokens. Access tokens
expire after 15 minutes. Refresh tokens expire after 7 days and are
stored server-side. Token secrets MUST be loaded from environment
variables, never hardcoded.

**Rationale:** JWT enables stateless authentication which simplifies
horizontal scaling. Session cookies would require a shared session store.

## CONST-003: Input Validation with Zod

**Status:** Accepted
**Date:** 2025-06-15

All user input MUST be validated using zod schemas before processing.
Validation errors MUST return HTTP 400 with a structured error body
containing field-level error messages. Schema definitions MUST be
co-located with the handler that uses them.

**Rationale:** Zod provides TypeScript-native schema validation with
excellent type inference. Runtime validation catches issues that TypeScript
types alone cannot (e.g., string format, range constraints).
