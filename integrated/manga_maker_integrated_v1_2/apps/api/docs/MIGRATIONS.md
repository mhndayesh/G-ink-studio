# PostgreSQL migration notes

This backend still runs locally with the SQLite dev registry for smoke testing, but PostgreSQL is the production target.

## Production target

- PostgreSQL schema snapshot: `infra/postgres/schema.sql`
- Alembic config: `alembic.ini`
- Alembic env: `migrations/env.py`
- Initial migration: `migrations/versions/0001_initial_story_state_engine.py`

## Commands

```bash
pip install -r requirements.txt
alembic upgrade head
```

Override the database URL with:

```bash
export MANGA_DATABASE_URL="postgresql+psycopg://manga:manga@localhost:5432/manga_maker"
```

## Important rules preserved by the schema

- `stories.official_plot_outline_filename` must be `plot_outline.json`.
- `story_files` rejects a plot outline file named anything other than `plot_outline.json`.
- `story_events` is append-only through a database trigger.
- Official state is represented by synchronized `story_versions` and `story_files` rows.
- Working/draft systems use `plot_workspaces`, `chapter_scripts`, detected events, questions, and approvals before official events/patches are applied.


## 0002_auth_user_ownership

Adds explicit upgrade history for auth/user ownership v0.1. The v1.0 schema already includes `users` and `stories.user_id`; this migration is idempotent for environments created before auth was added.
