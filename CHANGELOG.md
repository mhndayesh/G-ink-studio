# Changelog

Notable changes. Newest first.

## Unreleased — `cleanup/repo-hygiene` branch

Repo-hygiene pass acting on [`docs/REPO-CRITIQUE.md`](docs/REPO-CRITIQUE.md).
No backend/frontend behavior changes in this branch unless noted.

- **Layout flattened.** `apps/api`, `apps/web`, `docs`, `QA`, `infra`, `scripts`,
  `docker-compose.yml`, `CLAUDE.md`, `WORKFLOW.md` lifted out of
  `integrated/manga_maker_integrated_v1_2/` to the repo root; the nesting layer
  removed.
- **Cruft removed:** `archive/` (old design docs/reports — still in git history),
  `.agents/` + `.n8nac/` + `.github/agents/n8n-architect.agent.md` (unrelated n8n
  automation), a stray 0-byte `manga_registry.sqlite`, the duplicate
  `apps/api/docker-compose.yml`, the contradictory bundle `README.md`, the
  duplicate root `requirements.txt` (identical to `apps/api/requirements.txt`),
  and the superseded root `docs/` copy.
- **Docs reconciled:** fixed all `integrated/manga_maker_integrated_v1_2/` path
  references; fixed the `uvicorn --reload --host 0.0.0.0 --port 8000` commands
  (the project standard is `uvicorn app.main:app --port 8080`, no `--reload`);
  dropped drifted endpoint/screen/version counts from the sub-`README`s; added a
  "Project status — local single-user tool, not production-hardened" section;
  promoted the `simple.md` scratch notes to `docs/SIMPLE-FLOW-PROPOSAL.md`.
- **`.gitignore`:** stop ignoring `package-lock.json` (now committed for
  reproducible installs); ignore `.pytest_cache/`, `.agents/`, `.n8nac/`; fixed
  the `/NUL` pattern.
- **Added:** `apps/web/package-lock.json`, `CHANGELOG.md`, `CONTRIBUTING.md`,
  `.github/workflows/ci.yml` (lint + build + smoke).

## Pre-history

See `git log` before this branch. Earlier work history was squashed into the
single "Initial project import" commit; from now on changes land as discrete
commits.
