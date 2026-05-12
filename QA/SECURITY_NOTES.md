# Security Notes — Manga Maker System v2.1

## CRITICAL

### SEC-001: Auth Disabled by Default — Open Access
- **Location**: `apps/api/app/core/auth.py:38-47`, `apps/api/app/core/config.py:40`
- **Finding**: `MANGA_AUTH_ENABLED=false` is the default. When disabled, every request is authenticated as `dev_user` regardless of credentials. The `require_story_access` dependency passes for any story. An attacker with network access can read/write/delete all data.
- **Risk**: Anyone who can reach the API (on LAN, Docker network, or exposed port) has full control.
- **Fix**: Set `auth_enabled=true` by default in `.env.example`. Generate a non-empty `MANGA_DEV_API_KEY`.

## HIGH

### SEC-002: Entire Story Context Sent to LLM Without User Consent
- **Location**: `apps/api/app/services/llm_service.py:317-413`
- **Finding**: Every AI generation call sends ALL 5 story files (master_story, characters, plot_outline, plot_workspace, chapter_script) to the configured LLM provider. No user consent mechanism, no data minimization, no size limits.
- **Risk**: Data privacy violation. All user-created content exfiltrated to third-party LLM.
- **Fix**: Add explicit user consent before sending data. Send only relevant fields, not full context. Log what is sent externally.

### SEC-003: No Generic Exception Handler — Error Messages Leak Internals
- **Location**: `apps/api/app/main.py:56`
- **Finding**: Only `MangaMakerError` has a custom handler. Unhandled exceptions fall through to FastAPI default handler. Service-layer catch blocks convert exceptions to strings in responses (health.py:23, version_service.py:203-216).
- **Risk**: Internal paths, DB names, and exception details leak to API consumers.
- **Fix**: Add global exception handler returning sanitized `{"ok":false,"error":{"code":"INTERNAL_ERROR","message":"An internal error occurred"}}`.

### SEC-004: `profile_data: dict` Accepts Arbitrary Unvalidated JSON
- **Location**: `apps/api/app/models/api.py:99,104,109,315`
- **Finding**: `CharacterProfileCreateRequest.profile_data`, `CharacterProfileUpdateRequest.profile_data`, `SideCharacterProfileCreateRequest.profile_data`, and `AiGenerateRequest.partial_input` are all typed as `dict` with no validation. Deep-merged into character templates without schema enforcement.
- **Risk**: Arbitrary key injection into data model. Deeply nested JSON can cause stack overflow / memory exhaustion (DoS).
- **Fix**: Use typed Pydantic models. Add schema validation. Set max depth/size limits.

## MEDIUM

### SEC-005: CORS allow_credentials=True with Wildcard Methods/Headers
- **Location**: `apps/api/app/main.py:49-55`
- **Finding**: `allow_credentials=True` combined with `allow_methods=["*"]` and `allow_headers=["*"]`. While origins are restricted to localhost:3000 by default, a single misconfiguration of `MANGA_CORS_ORIGINS` would expose cross-origin access with credentials.
- **Fix**: Validate `cors_origins` env var. Reject `*` when `allow_credentials=True`.

### SEC-006: Database URL Stored as Plain String
- **Location**: `apps/api/app/core/config.py:24`
- **Finding**: `database_url` is `str`, not `SecretStr`. Contains embedded credentials (`manga:manga`). Accidental logging would leak DB password.
- **Fix**: Change to `SecretStr` or split into separate user/password fields.

### SEC-007: No Rate Limiting
- **Finding**: No rate limiting on any endpoint. Vulnerable to brute-force, DoS via rapid story creation or AI generation requests.
- **Fix**: Add `slowapi` or equivalent rate-limiting middleware.

### SEC-008: story_id in Filesystem Paths Without Sanitization
- **Location**: `apps/api/app/services/snapshot_service.py:54-55`
- **Finding**: User-provided `story_id` from URL path used directly in `pathlib.Path` operations. Currently mitigated by server-generated IDs and `require_story_access` check, but no defense-in-depth.
- **Fix**: Sanitize to `re.sub(r'[^a-zA-Z0-9_-]', '', story_id)`. Verify resolved path stays within `storage_root`.

## LOW

### SEC-009: Health Endpoint Exposes Internal Paths
- **Location**: `apps/api/app/api/v1/health.py:16-60`
- **Finding**: `/api/v1/health` returns full SQLite DB filesystem path, Neo4j/Qdrant connectivity status, and error messages. No authentication required.
- **Fix**: Protect with auth or return minimal status without internal details.

### SEC-010: openai_base_url Configurable (SSRF via Env Compromise)
- **Finding**: LLM provider URL fully configurable via env var. If compromised, all LLM calls can be redirected to malicious server.
- **Fix**: Allowlist to known OpenAI-compatible endpoints.

### SEC-011: F-String SQL in _ensure_column
- **Location**: `apps/api/app/repositories/sqlite_registry.py:205-209`
- **Finding**: Uses f-string interpolation for SQL DDL. Currently only called with hardcoded strings, but the pattern is fragile.
- **Fix**: Add docstring warning or validate against known schema.

### SEC-012: No Request Body Size Limit
- **Finding**: No middleware for max request body size. `profile_data` and `partial_input` dicts can be arbitrarily large.
- **Fix**: Add `MaximumContentLength` middleware (e.g., 10 MB limit).

## Clean/Not Vulnerable
- No `eval/exec/pickle/yaml.unsafe_load` found
- No Jinja2 template injection
- All SQLite DML uses parameterized `?` queries
- No file upload endpoints
- No user-controlled file paths for deletion (only DB operations)
