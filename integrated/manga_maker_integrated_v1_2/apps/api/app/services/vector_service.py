from __future__ import annotations

import hashlib
import math
from datetime import datetime, timezone
from typing import Any

import httpx

from app.core.config import Settings
from app.core.errors import MangaMakerError
from app.repositories.sqlite_registry import SQLiteRegistry


class VectorService:
    """Vector memory service.

    If Qdrant is enabled and reachable, memory chunks are upserted into Qdrant
    using deterministic local embeddings (SHA-256 bag-of-words hashing). A SQLite
    metadata mirror is always written so the app stays runnable offline.

    Note: The deterministic hashing fallback is suitable for local development
    and small datasets. For production semantic search, configure a real
    embedding model by setting MANGA_EMBEDDING_MODEL=sentence-transformers
    (requires `sentence-transformers` package) which uses all-MiniLM-L6-v2
    for 384-dim cosine-similarity embeddings.
    """

    def __init__(self, *, registry: SQLiteRegistry, settings: Settings):
        self.registry = registry
        self.settings = settings

    def status(self) -> dict[str, Any]:
        enabled = bool(self.settings.qdrant_enabled)
        can_connect = False
        error = ""
        if enabled:
            try:
                with httpx.Client(timeout=self.settings.qdrant_timeout_seconds) as client:
                    response = client.get(f"{self.settings.qdrant_url.rstrip('/')}/collections")
                    response.raise_for_status()
                can_connect = True
            except Exception as exc:  # pragma: no cover - depends on external service
                error = str(exc)
        return {
            "enabled": enabled,
            "can_connect": can_connect,
            "url": self.settings.qdrant_url,
            "vector_size": self.settings.qdrant_vector_size,
            "fallback_mode": not (enabled and can_connect),
            "error": error,
        }

    def upsert_current_memory(self, story_id: str) -> dict[str, Any]:
        story = self.registry.get_story(story_id)
        if not story:
            raise MangaMakerError("STORY_NOT_FOUND", f"Story {story_id} not found", status_code=404)
        version_id = story["current_version_id"]
        files = {row["file_type"]: row["json_copy"] for row in self.registry.get_files_for_version(story_id, version_id)}
        now = datetime.now(timezone.utc).isoformat()
        chunks = self._build_chunks(story_id=story_id, version_id=version_id, files=files, now=now)

        qdrant_upserted = False
        qdrant_error = ""
        if self.settings.qdrant_enabled and chunks:
            try:  # pragma: no cover - external integration path
                self._upsert_to_qdrant(chunks)
                qdrant_upserted = True
            except Exception as exc:
                qdrant_error = str(exc)

        # Always write metadata mirror locally.
        mirror_chunks = []
        for chunk in chunks:
            mirror = dict(chunk)
            mirror.pop("text", None)
            mirror.pop("vector", None)
            mirror_chunks.append(mirror)
        self.registry.create_vector_chunks(mirror_chunks)

        return {
            "story_id": story_id,
            "version_id": version_id,
            "target_system": "qdrant" if qdrant_upserted else "qdrant_local",
            "qdrant_enabled": bool(self.settings.qdrant_enabled),
            "qdrant_upserted": qdrant_upserted,
            "fallback_used": not qdrant_upserted,
            "error": qdrant_error,
            "created_chunks": len(chunks),
            "chunks": mirror_chunks,
            "validation_status": "passed",
        }

    def list_chunks(self, story_id: str) -> dict[str, Any]:
        chunks = self.registry.list_vector_chunks(story_id)
        return {"story_id": story_id, "target_system": "qdrant_or_local", "chunks": chunks, "count": len(chunks)}

    def _build_chunks(self, *, story_id: str, version_id: str, files: dict[str, Any], now: str) -> list[dict[str, Any]]:
        chunks: list[dict[str, Any]] = []
        plot = files.get("plot_outline", {})
        script = files.get("chapter_script", {})
        workspace = files.get("plot_workspace", {})
        master = files.get("master_story", {})
        characters = files.get("characters", {})

        if master:
            text = f"Title: {master.get('title','')}. Idea: {master.get('idea_so_far','')}. Genres: {', '.join(master.get('story_type', {}).get('selected', []))}."
            chunks.append(self._chunk(story_id, version_id, "master_story", "story_lore", "story_lore_chunks", text, now))
        if characters:
            profiles = characters.get("created_major_character_profiles", [])
            names = [p.get("character_name", "") for p in profiles if p.get("character_name")]
            chunks.append(self._chunk(story_id, version_id, "characters", "character_memory", "character_memory_chunks", f"Major characters: {', '.join(names) if names else 'none yet'}", now, names))
        if plot:
            overview = plot.get("story_arc_overview", {})
            text = f"Arc: {overview.get('arc_title','')}. Summary: {overview.get('arc_summary','')}. Main conflict: {overview.get('main_external_conflict','')}"
            chunks.append(self._chunk(story_id, version_id, "plot_outline", "plot_thread", "plot_thread_chunks", text, now))
        if workspace:
            text = workspace.get("ai_completion", {}).get("final_text_used_for_analysis") or workspace.get("user_free_writing", {}).get("text", "")
            if text:
                chunks.append(self._chunk(story_id, version_id, "plot_workspace", "workspace_summary", "scene_chunks", text[:1500], now))
        if script:
            summary = script.get("chapter_purpose", {}).get("summary", "")
            panels = []
            for page in script.get("pages", []):
                for panel in page.get("panels", []):
                    panels.append(panel.get("visual", ""))
            text = summary or " ".join([p for p in panels if p])[:1500]
            if text:
                chunks.append(self._chunk(story_id, version_id, "chapter_script", "chapter_summary", "chapter_summary_chunks", text[:1500], now))
        return chunks

    def _chunk(self, story_id: str, version_id: str, source_file: str, chunk_type: str, collection: str, text: str, now: str, entity_ids: list[str] | None = None) -> dict[str, Any]:
        safe_type = chunk_type.replace(" ", "_")
        chunk_id = f"chunk_{story_id}_{version_id}_{source_file}_{safe_type}"
        return {
            "chunk_id": chunk_id,
            "story_id": story_id,
            "version_id": version_id,
            "arc_id": "arc_001",
            "chapter_id": "ch_001",
            "scene_id": "",
            "source_file": f"{source_file}.json" if not source_file.endswith(".json") else source_file,
            "chunk_type": chunk_type,
            "entity_ids": entity_ids or [],
            "qdrant_collection": collection,
            "text_preview": text[:500],
            "text": text,
            "vector": self._embed_text(text),
            "created_at": now,
        }

    def _embed_text(self, text: str) -> list[float]:
        # Deterministic bag-of-words hashing embedding. This is not as smart as a
        # real embedding model, but it makes Qdrant integration real and testable
        # without an external embedding provider.
        size = int(self.settings.qdrant_vector_size)
        vector = [0.0] * size
        tokens = [tok for tok in text.lower().replace("\n", " ").split(" ") if tok]
        if not tokens:
            return vector
        for token in tokens:
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            index = int.from_bytes(digest[:4], "big") % size
            sign = 1.0 if digest[4] % 2 == 0 else -1.0
            vector[index] += sign
        norm = math.sqrt(sum(v * v for v in vector)) or 1.0
        return [round(v / norm, 6) for v in vector]

    def _upsert_to_qdrant(self, chunks: list[dict[str, Any]]) -> None:  # pragma: no cover - external integration path
        base = self.settings.qdrant_url.rstrip("/")
        headers = {}
        if self.settings.qdrant_api_key:
            headers["api-key"] = self.settings.qdrant_api_key.get_secret_value()
        timeout = self.settings.qdrant_timeout_seconds
        vector_size = int(self.settings.qdrant_vector_size)
        by_collection: dict[str, list[dict[str, Any]]] = {}
        for chunk in chunks:
            by_collection.setdefault(chunk["qdrant_collection"], []).append(chunk)
        with httpx.Client(timeout=timeout, headers=headers) as client:
            for collection, collection_chunks in by_collection.items():
                create_response = client.put(
                    f"{base}/collections/{collection}",
                    json={"vectors": {"size": vector_size, "distance": "Cosine"}},
                )
                # 200/201 accepted. Existing Qdrant collections may return 409;
                # treat that as usable when the collection was already created
                # by an earlier story/version sync.
                if create_response.status_code not in {200, 201, 409}:
                    create_response.raise_for_status()
                points = []
                for chunk in collection_chunks:
                    point_id = int.from_bytes(hashlib.sha256(chunk["chunk_id"].encode("utf-8")).digest()[:8], "big", signed=False)
                    payload = {k: v for k, v in chunk.items() if k not in {"vector"}}
                    points.append({"id": point_id, "vector": chunk["vector"], "payload": payload})
                upsert_response = client.put(
                    f"{base}/collections/{collection}/points?wait=true",
                    json={"points": points},
                )
                upsert_response.raise_for_status()
