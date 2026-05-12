# Auth / User Ownership v0.1

This backend step adds lightweight ownership protection without changing the story-state engine flow.

## Modes

### Local/dev mode

Default:

```env
MANGA_AUTH_ENABLED=false
MANGA_DEV_USER_ID=dev_user
```

Requests are assigned to `dev_user` unless `X-Manga-User-Id` is provided. This is useful for smoke tests and local development.

### API-key mode

Enable with:

```env
MANGA_AUTH_ENABLED=true
MANGA_DEV_API_KEY=change-me
MANGA_DEV_USER_ID=dev_user
```

Then call protected endpoints with either:

```http
Authorization: Bearer change-me
```

or:

```http
X-Manga-API-Key: change-me
```

## Ownership rules

- `POST /api/v1/stories` assigns the created story to the current user.
- Every `/api/v1/stories/{story_id}/...` route checks ownership before executing.
- Another user cannot read, patch, approve, version, project, or inspect someone else's story.
- `/api/v1/health`, `/api/v1/auth/me`, `/api/v1/db/migration-info`, and `/api/v1/llm/status` remain utility/system endpoints.

## Endpoint added

```http
GET /api/v1/auth/me
```

Returns the current resolved user and auth mode.

## Important

This is v0.1 auth. It is intentionally simple. Production auth later should replace the single dev API key with real users, sessions/JWT, hashed API keys, org/team membership, and permission roles.
