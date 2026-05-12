from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.core.config import Settings
from app.core.errors import MangaMakerError
from app.repositories.sqlite_registry import SQLiteRegistry


_ALLOWED_NODE_LABELS = {
    "Story", "Version", "JsonFile", "Arc", "Chapter", "Scene", "Character",
    "CharacterProfile", "Relationship", "Faction", "Location", "Threat", "Power",
    "WorldRule", "Event", "Secret", "Object", "Prophecy", "PlotThread",
}
_ALLOWED_EDGE_TYPES = {
    "HAS_VERSION", "CONTAINS_FILE", "HAS_CHAPTER", "HAS_SCENE", "CONTAINS_EVENT",
    "AFFECTS", "MEMBER_OF", "HAS_POWER", "HAS_RELATIONSHIP", "CONNECTS",
    "DIED_IN", "BETRAYED", "DESTROYED", "CAUSED", "OPPOSES", "TARGETS",
    "CHANGED_IN", "CREATED_BY", "REVEALED_IN",
}


class GraphService:
    """Graph projection service.

    If Neo4j is enabled and reachable, official story events are projected into
    Neo4j. A local SQLite projection log is always written, so smoke tests and
    offline development keep working.
    """

    def __init__(self, *, registry: SQLiteRegistry, settings: Settings):
        self.registry = registry
        self.settings = settings

    def status(self) -> dict[str, Any]:
        enabled = bool(self.settings.neo4j_enabled)
        driver_available = self._neo4j_driver_available()
        can_connect = False
        error = ""
        if enabled and driver_available:
            try:
                with self._driver() as driver:
                    driver.verify_connectivity()
                can_connect = True
            except Exception as exc:  # pragma: no cover - depends on external service
                error = str(exc)
        return {
            "enabled": enabled,
            "driver_available": driver_available,
            "can_connect": can_connect,
            "uri": self.settings.neo4j_uri,
            "database": self.settings.neo4j_database,
            "fallback_mode": not (enabled and driver_available and can_connect),
            "error": error,
        }

    def project_events(self, story_id: str) -> dict[str, Any]:
        story = self.registry.get_story(story_id)
        if not story:
            raise MangaMakerError("STORY_NOT_FOUND", f"Story {story_id} not found", status_code=404)

        events = self.registry.get_story_events(story_id)
        projections: list[dict[str, Any]] = []
        nodes: list[dict[str, Any]] = []
        edges: list[dict[str, Any]] = []
        now = datetime.now(timezone.utc).isoformat()

        real_projection_enabled = self.settings.neo4j_enabled and self._neo4j_driver_available()
        real_projection_ok = False
        real_projection_error = ""

        payloads = []
        for event in events:
            payload = self._projection_payload(event, story_id=story_id)
            payloads.append((event, payload))
            nodes.extend(payload.get("nodes", []))
            edges.extend(payload.get("edges", []))

        if real_projection_enabled and payloads:
            try:  # pragma: no cover - external integration path
                self._write_to_neo4j(story_id=story_id, events_payloads=payloads)
                real_projection_ok = True
            except Exception as exc:
                real_projection_error = str(exc)

        target_system = "neo4j" if real_projection_ok else "neo4j_local"
        status = "success" if real_projection_ok or not self.settings.neo4j_enabled else "fallback"

        for event, payload in payloads:
            projections.append({
                "projection_id": f"graphproj_{target_system}_{event['event_id']}",
                "story_id": story_id,
                "event_id": event["event_id"],
                "target_system": target_system,
                "projection_payload": payload,
                "status": status,
                "created_at": now,
                "applied_at": now,
            })
        self.registry.create_event_projections(projections)

        return {
            "story_id": story_id,
            "current_version_id": story["current_version_id"],
            "projected_events": len(projections),
            "nodes": nodes,
            "edges": edges,
            "target_system": target_system,
            "neo4j_enabled": bool(self.settings.neo4j_enabled),
            "neo4j_projected": real_projection_ok,
            "fallback_used": not real_projection_ok,
            "error": real_projection_error,
            "validation_status": "passed",
        }

    def list_projections(self, story_id: str) -> dict[str, Any]:
        rows = self.registry.list_event_projections(story_id, target_system=None)
        return {"story_id": story_id, "target_system": "neo4j_or_local", "projections": rows, "count": len(rows)}

    def get_web_graph(self, story_id: str) -> dict[str, Any]:
        nodes: list[dict[str, Any]] = []
        edges: list[dict[str, Any]] = []

        char_rec = self.registry.get_current_file(story_id, "characters")
        if char_rec:
            char_data = char_rec.get("json_copy", {})
            for p in char_data.get("created_major_character_profiles", []):
                nodes.append({
                    "id": p.get("profile_id", ""),
                    "name": p.get("character_name", ""),
                    "class": "major",
                    "status": p.get("status", {}).get("selected", "alive"),
                    "role": p.get("character_role_level", {}).get("selected", ""),
                    "faction": p.get("main_character_faction_alignment", {}).get("alignment_details", {}).get("linked_master_faction", "") or "",
                })
            for p in char_data.get("created_side_character_profiles", []):
                nodes.append({
                    "id": p.get("profile_id", f"side_{len(nodes)}"),
                    "name": p.get("character_name", ""),
                    "class": "side",
                    "status": p.get("status", {}).get("selected", "alive"),
                    "role": p.get("character_role_level", {}).get("selected", "Supporting"),
                    "faction": "",
                })

            rel_map = char_data.get("character_relationship_map", {})
            for i, r in enumerate(rel_map.get("relationships", [])):
                parts = (r.get("characters_involved") or "?/?").split("/")
                src = parts[0].strip() if len(parts) > 0 else ""
                tgt = parts[1].strip() if len(parts) > 1 else ""
                src_node = next((n for n in nodes if n["name"] == src), None)
                tgt_node = next((n for n in nodes if n["name"] == tgt), None)
                if src_node and tgt_node:
                    edges.append({
                        "id": r.get("id", f"rel_{i}"),
                        "source": src_node["id"],
                        "target": tgt_node["id"],
                        "type": (r.get("relationship_change_type") or "friend").lower().replace(" ", "_"),
                        "label": r.get("relationship_change_type", ""),
                    })

        return {
            "story_id": story_id,
            "nodes": nodes,
            "edges": edges,
            "data_source": "json_only",  # Neo4j merge optional in future
        }

    def _neo4j_driver_available(self) -> bool:
        try:
            import neo4j  # noqa: F401
            return True
        except Exception:
            return False

    def _driver(self):
        from neo4j import GraphDatabase

        password = self.settings.neo4j_password.get_secret_value() if self.settings.neo4j_password else ""
        return GraphDatabase.driver(
            self.settings.neo4j_uri,
            auth=(self.settings.neo4j_user, password),
            connection_timeout=self.settings.neo4j_timeout_seconds,
            max_connection_lifetime=30,
        )

    def _write_to_neo4j(self, *, story_id: str, events_payloads: list[tuple[dict[str, Any], dict[str, Any]]]) -> None:
        with self._driver() as driver:
            with driver.session(database=self.settings.neo4j_database) as session:
                session.execute_write(self._ensure_story_node, story_id)
                for event, payload in events_payloads:
                    session.execute_write(self._write_payload, story_id, event, payload)

    @staticmethod
    def _ensure_story_node(tx, story_id: str) -> None:  # pragma: no cover - external integration path
        tx.run("MERGE (s:Story {id: $story_id}) SET s.id = $story_id", story_id=story_id)

    @staticmethod
    def _write_payload(tx, story_id: str, event: dict[str, Any], payload: dict[str, Any]) -> None:  # pragma: no cover
        # Always create the story-event link first.
        tx.run(
            """
            MERGE (s:Story {id: $story_id})
            MERGE (e:Event {id: $event_id})
            SET e.story_id = $story_id,
                e.event_type = $event_type,
                e.summary = $summary,
                e.target_file = $target_file
            MERGE (s)-[:CONTAINS_EVENT]->(e)
            """,
            story_id=story_id,
            event_id=event["event_id"],
            event_type=event.get("event_type", ""),
            summary=event.get("summary", ""),
            target_file=event.get("target_file", ""),
        )
        for node in payload.get("nodes", []):
            label = node.get("label", "Object")
            if label not in _ALLOWED_NODE_LABELS:
                label = "Object"
            node_id = str(node.get("id") or "unknown")
            props = {k: v for k, v in node.items() if k not in {"label", "id"}}
            query = f"MERGE (n:{label} {{id: $node_id}}) SET n += $props, n.story_id = $story_id"
            tx.run(query, node_id=node_id, props=props, story_id=story_id)
        for edge in payload.get("edges", []):
            edge_type = edge.get("type", "AFFECTS")
            if edge_type not in _ALLOWED_EDGE_TYPES:
                edge_type = "AFFECTS"
            src = str(edge.get("from") or event["event_id"])
            dst = str(edge.get("to") or "unknown")
            query = f"""
            MERGE (a {{id: $src}})
            MERGE (b {{id: $dst}})
            MERGE (a)-[r:{edge_type} {{story_id: $story_id, event_id: $event_id}}]->(b)
            SET r.updated_at = $updated_at
            """
            tx.run(
                query,
                src=src,
                dst=dst,
                story_id=story_id,
                event_id=event["event_id"],
                updated_at=datetime.now(timezone.utc).isoformat(),
            )

    def _projection_payload(self, event: dict[str, Any], *, story_id: str) -> dict[str, Any]:
        etype = event.get("event_type", "")
        target = event.get("target_entity_id") or event.get("payload", {}).get("target_entity_name", "") or "unknown"
        base_node = {"label": "Event", "id": event["event_id"], "event_type": etype, "story_id": story_id}
        nodes = [base_node]
        edges = [{"from": story_id, "to": event["event_id"], "type": "CONTAINS_EVENT"}]
        if etype.startswith("CHARACTER_"):
            nodes.append({"label": "Character", "id": target, "status_hint": etype, "story_id": story_id})
            edge_type = "DIED_IN" if etype == "CHARACTER_DIED" else "AFFECTS"
            edges.append({"from": event["event_id"], "to": target, "type": edge_type})
        elif etype.startswith("RELATIONSHIP_"):
            nodes.append({"label": "Relationship", "id": target or event["event_id"], "status_hint": etype, "story_id": story_id})
            edges.append({"from": event["event_id"], "to": target or event["event_id"], "type": "CHANGED_IN"})
        elif etype.startswith("WORLD_") or etype.startswith("LOCATION_"):
            label = "Location" if etype.startswith("LOCATION_") else "WorldRule"
            nodes.append({"label": label, "id": target or "world", "status_hint": etype, "story_id": story_id})
            edge_type = "DESTROYED" if etype == "LOCATION_DESTROYED" else "CHANGED_IN"
            edges.append({"from": event["event_id"], "to": target or "world", "type": edge_type})
        elif etype.startswith("FACTION_"):
            nodes.append({"label": "Faction", "id": target or "faction", "status_hint": etype, "story_id": story_id})
            edges.append({"from": event["event_id"], "to": target or "faction", "type": "CHANGED_IN"})
        elif etype.startswith("THREAT_"):
            nodes.append({"label": "Threat", "id": target or "threat", "status_hint": etype, "story_id": story_id})
            edges.append({"from": event["event_id"], "to": target or "threat", "type": "REVEALED_IN" if "REVEALED" in etype else "AFFECTS"})
        else:
            nodes.append({"label": "PlotThread", "id": target or "plot", "status_hint": etype, "story_id": story_id})
            edges.append({"from": event["event_id"], "to": target or "plot", "type": "AFFECTS"})
        return {"nodes": nodes, "edges": edges, "source_event": event["event_id"]}
