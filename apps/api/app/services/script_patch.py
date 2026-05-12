from __future__ import annotations

"""Patch-by-path engine for chapter scripts.

``apply_patch(data, branch, op, value)`` mutates ``data`` in place at a dotted /
bracketed path (e.g. ``pages[0].panels[2].visual``) with one of:
replace, add, remove, merge_object, append_to_array. ``get_value`` reads a path;
``path_tokens`` parses one. Pure structure manipulation — no I/O, no app state.
"""

import copy
from typing import Any

from app.core.errors import MangaMakerError


def apply_patch(data: dict[str, Any], branch: str, op: str, value: Any) -> Any:
    parent, key = resolve_parent(data, branch, create=op in {"add", "merge_object", "append_to_array"})
    old = None
    if isinstance(parent, list):
        if not isinstance(key, int):
            raise MangaMakerError("PATCH_TYPE_ERROR", "List parent requires numeric index")
        if key >= len(parent):
            if op == "add":
                parent.append(value); return None
            raise MangaMakerError("PATCH_PATH_NOT_FOUND", f"Index out of range: {branch}")
        old = copy.deepcopy(parent[key])
        if op == "replace": parent[key] = value
        elif op == "remove": parent.pop(key)
        elif op == "merge_object":
            if not isinstance(parent[key], dict) or not isinstance(value, dict): raise MangaMakerError("PATCH_TYPE_ERROR", "merge_object requires object")
            parent[key].update(value)
        elif op == "add": parent.insert(key, value)
        else: raise MangaMakerError("UNSUPPORTED_PATCH_OPERATION", op)
    else:
        old = copy.deepcopy(parent.get(key))
        if op == "replace":
            if key not in parent: raise MangaMakerError("PATCH_PATH_NOT_FOUND", f"Path not found: {branch}")
            parent[key] = value
        elif op == "add": parent[key] = value
        elif op == "remove": parent.pop(key, None)
        elif op == "merge_object":
            if key not in parent or parent[key] is None: parent[key] = {}
            if not isinstance(parent[key], dict) or not isinstance(value, dict): raise MangaMakerError("PATCH_TYPE_ERROR", "merge_object requires object")
            parent[key].update(value)
        elif op == "append_to_array":
            if key not in parent or parent[key] is None: parent[key] = []
            if not isinstance(parent[key], list): raise MangaMakerError("PATCH_TYPE_ERROR", "append_to_array requires list")
            parent[key].append(value)
        else: raise MangaMakerError("UNSUPPORTED_PATCH_OPERATION", op)
    return old

def resolve_parent(data: dict[str, Any], branch: str, create: bool = False) -> tuple[Any, str | int]:
    tokens = path_tokens(branch)
    cur: Any = data
    for token in tokens[:-1]:
        if isinstance(token, int):
            if not isinstance(cur, list) or token >= len(cur): raise MangaMakerError("PATCH_PATH_NOT_FOUND", branch)
            cur = cur[token]
        else:
            if token not in cur:
                if create: cur[token] = {}
                else: raise MangaMakerError("PATCH_PATH_NOT_FOUND", branch)
            cur = cur[token]
    return cur, tokens[-1]

def get_value(data: dict[str, Any], branch: str) -> Any:
    cur: Any = data
    for token in path_tokens(branch):
        cur = cur[token] if isinstance(token, int) else cur.get(token)
    return cur

def path_tokens(branch: str) -> list[str | int]:
    parts: list[str | int] = []
    for raw in branch.replace("]", "").replace("[", ".").split("."):
        if raw == "": continue
        parts.append(int(raw) if raw.isdigit() else raw)
    return parts
