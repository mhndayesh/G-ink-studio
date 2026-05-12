from __future__ import annotations

import io
import json
import zipfile
from typing import Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from app.core.auth import require_story_access
from app.core.errors import ok
from app.main_dependencies import get_registry
from app.repositories.sqlite_registry import SQLiteRegistry
from app.services.export_service import (
    story_safe_title,
    _ai_prompt_files,
    _all_chapter_scripts,
    _assemble_scenes_lines,
    _assemble_story_lines,
    _assemble_visuals_lines,
    _character_sheet_files,
    _format_validation_lines,
    _get_all_files,
    _lines_to_docx,
    _lines_to_markdown,
    _lines_to_text,
    _panels_csv,
    _safe,
    _validate_export,
)

router = APIRouter(
    dependencies=[Depends(require_story_access)],
    prefix="/stories/{story_id}/export",
    tags=["export"],
)


@router.get("/story")
def export_story(
    story_id: str,
    fmt: Literal["txt", "md", "docx"] = Query(default="md"),
    registry: SQLiteRegistry = Depends(get_registry),
):
    files = _get_all_files(story_id, registry)
    title, safe_title = story_safe_title(files)
    all_scripts = _all_chapter_scripts(story_id, registry)
    lines = _assemble_story_lines(files, all_scripts=all_scripts)

    if fmt == "txt":
        content = _lines_to_text(lines).encode("utf-8")
        media = "text/plain; charset=utf-8"
        filename = f"{safe_title}.txt"
    elif fmt == "md":
        content = _lines_to_markdown(lines).encode("utf-8")
        media = "text/markdown; charset=utf-8"
        filename = f"{safe_title}.md"
    else:  # docx
        content = _lines_to_docx(lines, title)
        media = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        filename = f"{safe_title}.docx"

    return Response(
        content=content,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/scenes")
def export_scenes(
    story_id: str,
    fmt: Literal["txt", "md"] = Query(default="md"),
    registry: SQLiteRegistry = Depends(get_registry),
):
    files = _get_all_files(story_id, registry)
    title, safe_title = story_safe_title(files)
    all_scripts = _all_chapter_scripts(story_id, registry)
    lines = _assemble_scenes_lines(files, all_scripts=all_scripts)

    if fmt == "txt":
        content = _lines_to_text(lines).encode("utf-8")
        media = "text/plain; charset=utf-8"
        filename = f"{safe_title}_scenes.txt"
    else:
        content = _lines_to_markdown(lines).encode("utf-8")
        media = "text/markdown; charset=utf-8"
        filename = f"{safe_title}_scenes.md"

    return Response(
        content=content,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/visuals")
def export_visuals(
    story_id: str,
    fmt: Literal["txt", "md"] = Query(default="md"),
    registry: SQLiteRegistry = Depends(get_registry),
):
    files = _get_all_files(story_id, registry)
    title, safe_title = story_safe_title(files)
    all_scripts = _all_chapter_scripts(story_id, registry)
    lines = _assemble_visuals_lines(files, all_scripts=all_scripts)

    if fmt == "txt":
        content = _lines_to_text(lines).encode("utf-8")
        media = "text/plain; charset=utf-8"
        filename = f"{safe_title}_visuals.txt"
    else:
        content = _lines_to_markdown(lines).encode("utf-8")
        media = "text/markdown; charset=utf-8"
        filename = f"{safe_title}_visuals.md"

    return Response(
        content=content,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/visuals-bundle")
def export_visuals_bundle(
    story_id: str,
    registry: SQLiteRegistry = Depends(get_registry),
):
    """Production-ready ZIP bundle for the artist:
        visuals.md            — full reference document (all chapters)
        panels.csv            — one row per panel for spreadsheet workflows
        character_sheets/*.md — per-character visual sheet
        prompts/*.txt         — per-character AI image prompts (positive + negative)
    """
    files = _get_all_files(story_id, registry)
    characters = files.get("characters", {}) or {}
    title = _safe(
        (files.get("master_story", {}) or {}).get("title")
        or (files.get("master_story", {}) or {}).get("story_title"),
        "story",
    )
    safe_title = safe_title or story_id
    all_scripts = _all_chapter_scripts(story_id, registry)

    visuals_md = _lines_to_markdown(_assemble_visuals_lines(files, all_scripts=all_scripts))
    panels_csv = _panels_csv(all_scripts)
    sheet_files = _character_sheet_files(characters)
    prompt_files = _ai_prompt_files(characters)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("visuals.md", visuals_md)
        zf.writestr("panels.csv", panels_csv)
        readme = (
            f"# {title} — Visual Production Bundle\n\n"
            "- visuals.md: full per-chapter panel breakdown\n"
            "- panels.csv: one row per panel (open in Excel / Sheets)\n"
            "- character_sheets/: per-character visual reference\n"
            "- prompts/: AI image prompts per character (paste into your generator)\n"
        )
        zf.writestr("README.md", readme)
        for name, content in sheet_files.items():
            zf.writestr(f"character_sheets/{name}", content)
        for name, content in prompt_files.items():
            zf.writestr(f"prompts/{name}", content)

    buf.seek(0)
    return Response(
        content=buf.read(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{safe_title}_visuals_bundle.zip"'},
    )


@router.get("/validate")
def export_validate(
    story_id: str,
    registry: SQLiteRegistry = Depends(get_registry),
):
    """Surface data-quality issues that the export tool cannot fix on its own.

    Returns a list of warnings (level, category, message, where) so the frontend
    can render them above the download buttons. Mirrors the same checks that
    populate validation_report.md inside the triple-zip.
    """
    files = _get_all_files(story_id, registry)
    all_scripts = _all_chapter_scripts(story_id, registry)
    report = _validate_export(files, all_scripts)
    return ok(report)


@router.get("/triple-zip")
def export_triple_zip(
    story_id: str,
    registry: SQLiteRegistry = Depends(get_registry),
):
    """ZIP bundle containing the three G-Ink Studio asset files:
        {title}-story.md   — narrative structure, characters, arc overview, faction visuals
        {title}-visuals.md — character sheets, locations section, per-chapter panel breakdown
        {title}-scenes.md  — scene cards with dialogue injected from all chapter scripts
    """
    files = _get_all_files(story_id, registry)
    title, safe_title = story_safe_title(files)
    safe_title = safe_title or story_id
    all_scripts = _all_chapter_scripts(story_id, registry)

    story_md = _lines_to_markdown(_assemble_story_lines(files, all_scripts=all_scripts))
    visuals_md = _lines_to_markdown(_assemble_visuals_lines(files, all_scripts=all_scripts))
    scenes_md = _lines_to_markdown(_assemble_scenes_lines(files, all_scripts=all_scripts))
    validation_md = _lines_to_markdown(_format_validation_lines(_validate_export(files, all_scripts)))

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{safe_title}-story.md", story_md)
        zf.writestr(f"{safe_title}-visuals.md", visuals_md)
        zf.writestr(f"{safe_title}-scenes.md", scenes_md)
        zf.writestr("validation_report.md", validation_md)
        readme = (
            f"# {title} — G-Ink Studio Asset Bundle\n\n"
            f"- {safe_title}-story.md: narrative structure, characters, arc overview\n"
            f"- {safe_title}-visuals.md: character visual sheets, location prompts, panel breakdowns\n"
            f"- {safe_title}-scenes.md: scene cards with dialogue scripts for all chapters\n"
            f"- validation_report.md: data-quality issues to address before importing\n\n"
            "Import the three asset files into G-Ink Studio to populate the project.\n"
        )
        zf.writestr("README.md", readme)

    buf.seek(0)
    return Response(
        content=buf.read(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{safe_title}_gink_bundle.zip"'},
    )


@router.get("/raw-zip")
def export_raw_zip(
    story_id: str,
    registry: SQLiteRegistry = Depends(get_registry),
):
    """Stream a ZIP archive containing all current official story JSON files."""
    file_types = ["master_story", "characters", "plot_outline", "memory_system", "plot_workspace", "chapter_script"]
    filename_map = {
        "master_story": "master_story.json",
        "characters": "characters.json",
        "plot_outline": "plot_outline.json",
        "memory_system": "memory_system.json",
        "plot_workspace": "plot_workspace.json",
        "chapter_script": "chapter_script.json",
    }

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for ft in file_types:
            rec = registry.get_current_file(story_id, ft)
            data = rec.get("json_copy", {}) if rec else {}
            zf.writestr(filename_map[ft], json.dumps(data, indent=2, ensure_ascii=False))

    buf.seek(0)
    return Response(
        content=buf.read(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{story_id}_raw_files.zip"'},
    )
