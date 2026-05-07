# Graph + Vector Integrations

Backend includes real optional connectors with safe local fallback.

## Neo4j

Set:

```env
MANGA_NEO4J_ENABLED=true
MANGA_NEO4J_URI=bolt://localhost:7687
MANGA_NEO4J_USER=neo4j
MANGA_NEO4J_PASSWORD=your_password
MANGA_NEO4J_DATABASE=neo4j
```

Endpoints:

```http
GET  /api/v1/stories/{story_id}/graph/status
POST /api/v1/stories/{story_id}/graph/project-events
GET  /api/v1/stories/{story_id}/graph/projections
GET  /api/v1/stories/{story_id}/graph/web         ← Merged JSON graph
```

If Neo4j is disabled/unreachable, the service stores a local projection log with `fallback_used: true`.

### Graph Web Endpoint

`GET /graph/web` returns merged character data from `characters.json` as nodes/edges:

```json
{
  "story_id": "story_001",
  "nodes": [
    { "id": "char_001", "name": "Kai", "class": "major", "status": "alive", "role": "Primary Main Character", "faction": "Academy" },
    { "id": "side_001", "name": "Mira", "class": "side", "status": "alive", "role": "Supporting Character", "faction": "" }
  ],
  "edges": [
    { "id": "rel_0", "source": "char_001", "target": "char_002", "type": "friend", "label": "Friends" }
  ],
  "data_source": "json_only"
}
```

The frontend `RelationshipGraph` component visualizes this with:
- Major characters = large dark nodes
- Side characters = smaller indigo nodes
- Dead characters = gray
- Edge colors by relationship type (rival=orange, enemy=red, friend=green, family=blue, mentor=purple, love=secret=pink)

## Qdrant

Set:

```env
MANGA_QDRANT_ENABLED=true
MANGA_QDRANT_URL=http://localhost:6333
MANGA_QDRANT_API_KEY=
MANGA_QDRANT_VECTOR_SIZE=384
```

Endpoints:

```http
GET  /api/v1/stories/{story_id}/vector/status
POST /api/v1/stories/{story_id}/vector/upsert-current-memory
GET  /api/v1/stories/{story_id}/vector/chunks
```

Current embedding uses deterministic local hashing vectors for testing without an external provider.

## Local safety

Both integrations always write local metadata mirrors:
- `event_projections` for graph projection logs
- `vector_chunks` for Qdrant chunk metadata

This ensures smoke tests and offline development remain stable.
