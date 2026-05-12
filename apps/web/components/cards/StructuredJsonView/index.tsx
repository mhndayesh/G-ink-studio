"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";

type StructuredJsonViewProps = {
  data: unknown;
  defaultSimple?: boolean;
};

function hasValue(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.length > 0;
  if (typeof v === "boolean") return true;
  if (typeof v === "number") return true;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0 && Object.values(v as object).some(hasValue);
  return false;
}

function isOptionsField(key: string): boolean {
  return key === "options" || key === "custom_main_character_structure" || key === "custom_structure";
}

function isSelectedField(key: string): boolean {
  return key === "selected";
}

function isCustomField(key: string): boolean {
  return key.startsWith("custom_");
}

function isEmptySelected(v: unknown): boolean {
  if (v === "" || v === null || v === undefined) return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

function detectFileType(data: Record<string, unknown>): string {
  if (data.created_major_character_profiles || data.created_side_character_profiles) return "characters";
  if (data.idea_so_far !== undefined && data.story_type !== undefined) return "master_story";
  if (data.chapter_or_episode_list || data.narrative_structure) return "plot_outline";
  const linked = data.linked_files as Record<string, unknown> | undefined;
  if (data.free_writing !== undefined || linked?.plot_outline_file) return "plot_workspace";
  if (data.pages !== undefined || data.script_format) return "chapter_script";
  const ver = data.versioning as Record<string, unknown> | undefined;
  if (ver?.official_file_names) return "memory_system";
  return "generic";
}

type ViewEntry = {
  key: string;
  value: unknown;
  path: string;
  depth: number;
};

function collectSimpleEntries(obj: Record<string, unknown>, prefix: string, depth: number, showAll: boolean): ViewEntry[] {
  const entries: ViewEntry[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (isOptionsField(key) && !showAll) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      entries.push(...collectSimpleEntries(value as Record<string, unknown>, path, depth + 1, showAll));
    } else {
      if (!showAll && isEmptySelected(value)) continue;
      entries.push({ key, value, path, depth });
    }
  }
  return entries;
}

function ValueDisplay({ value }: { value: unknown }) {
  if (typeof value === "string") {
    return <span className="text-emerald-600">{value}</span>;
  }
  if (typeof value === "boolean") {
    return <span className={cn("font-bold", value ? "text-green-600" : "text-slate-400")}>{String(value)}</span>;
  }
  if (typeof value === "number") {
    return <span className="text-amber-600">{value}</span>;
  }
  if (Array.isArray(value)) {
    return <span className="text-indigo-600">[{value.join(", ")}]</span>;
  }
  return <span className="text-slate-500">{String(value)}</span>;
}

function SimpleEntryRow({ entry, isSelected, isCustom }: { entry: ViewEntry; isSelected: boolean; isCustom: boolean }) {
  return (
    <div className="flex gap-2 text-xs" style={{ paddingLeft: `${entry.depth * 12}px` }}>
      <span className={cn("shrink-0 font-mono", isCustom ? "text-green-500" : isSelected ? "text-blue-600 font-bold" : "text-slate-500")}>
        {entry.key}:
      </span>
      <ValueDisplay value={entry.value} />
    </div>
  );
}

function CollapsibleSection({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  return (
    <div className="border-l-2 border-slate-200 pl-2">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs font-bold text-slate-700 hover:text-slate-900">
        <span className="text-[10px]">{open ? "▼" : "▶"}</span>
        {title}
      </button>
      {open && <div className="mt-1 space-y-0.5">{children}</div>}
    </div>
  );
}

function safeRole(p: Record<string, unknown>): string {
  const rl = p.character_role_level;
  if (!rl) return "";
  if (typeof rl === "string") return rl;
  if (typeof rl === "object") {
    const obj = rl as Record<string, unknown>;
    if (typeof obj.selected === "string") return obj.selected;
    if (obj.selected && typeof obj.selected === "object") return String((obj.selected as Record<string, unknown>).selected || "");
  }
  return "";
}

function safeStatus(p: Record<string, unknown>): string {
  const st = p.status;
  if (!st) return "";
  if (typeof st === "string") return st;
  if (typeof st === "object") {
    const obj = st as Record<string, unknown>;
    if (typeof obj.selected === "string") return obj.selected;
    if (obj.selected && typeof obj.selected === "object") return String((obj.selected as Record<string, unknown>).selected || "");
  }
  return "";
}

function renderCharacterProfile(profile: Record<string, unknown>, idx: number): React.ReactNode {
  const name = (profile.character_name as string) || `Profile ${idx + 1}`;
  const pid = profile.profile_id as string;
  const role = safeRole(profile);
  const status = safeStatus(profile);
  const label = `${name} (${pid})${role ? ` — ${role}` : ""}${status ? ` • ${status}` : ""}`;

  return (
    <CollapsibleSection key={pid || idx} title={label} defaultOpen={false}>
      {Object.entries(profile).map(([key, value]) => {
        if (["profile_id", "profile_label", "character_name", "character_role_level", "status"].includes(key)) return null;
        if (key === "options" || (typeof value === "object" && value !== null && !Array.isArray(value) && "options" in (value as object))) return null;
        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
          return <SimpleObjectView key={key} label={key} obj={value as Record<string, unknown>} depth={1} />;
        }
        if (!hasValue(value)) return null;
        return (
          <div key={key} className="flex gap-2 text-xs" style={{ paddingLeft: "12px" }}>
            <span className="shrink-0 font-mono text-slate-500">{key}:</span>
            <ValueDisplay value={value} />
          </div>
        );
      })}
    </CollapsibleSection>
  );
}

function SimpleObjectView({ label, obj, depth }: { label: string; obj: Record<string, unknown>; depth: number }): React.ReactNode {
  const entries = collectSimpleEntries(obj, "", depth, false);
  if (entries.length === 0) return null;
  return (
    <CollapsibleSection title={label} defaultOpen={depth < 2}>
      {entries.map((entry) => (
        <SimpleEntryRow key={entry.path} entry={entry} isSelected={isSelectedField(entry.key)} isCustom={isCustomField(entry.key)} />
      ))}
    </CollapsibleSection>
  );
}

function MasterStoryView({ data }: { data: Record<string, unknown> }) {
  const topMeta = ["story_id", "version_id", "file_type", "state_type", "created_at", "title"];
  return (
    <div className="space-y-2">
      {topMeta.map((k) => {
        const v = data[k];
        if (!hasValue(v)) return null;
        return (
          <div key={k} className="flex gap-2 text-xs">
            <span className="font-mono text-slate-400">{k}:</span>
            <ValueDisplay value={v} />
          </div>
        );
      })}
      {Object.entries(data).map(([key, value]) => {
        if (topMeta.includes(key)) return null;
        if (key === "options") return null;
        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
          const inner = value as Record<string, unknown>;
          if ("selected" in inner || "options" in inner) {
            const sel = inner.selected;
            const customKey = `custom_${key}`;
            const custom = inner[customKey] as string;
            const detailsKey = `${key}_details`;
            const details = (inner[detailsKey] || inner.details || {}) as Record<string, unknown>;
            if (!hasValue(sel) && !hasValue(custom) && !hasValue(details)) return null;
            return (
              <CollapsibleSection key={key} title={key} defaultOpen={false}>
                {!isEmptySelected(sel) && <div className="flex gap-2 text-xs"><span className="font-mono text-blue-600 font-bold">selected:</span><ValueDisplay value={sel} /></div>}
                {custom && <div className="flex gap-2 text-xs"><span className="font-mono text-green-600">custom:</span><ValueDisplay value={custom} /></div>}
                {typeof details === "object" && details !== null && <SimpleObjectView label="details" obj={details as Record<string, unknown>} depth={2} />}
              </CollapsibleSection>
            );
          }
          return <SimpleObjectView key={key} label={key} obj={inner} depth={1} />;
        }
        if (Array.isArray(value) && value.length > 0) {
          return (
            <CollapsibleSection key={key} title={`${key} [${value.length}]`} defaultOpen={false}>
              {value.map((item, i) => {
                if (typeof item === "object" && item !== null) {
                  return <SimpleObjectView key={i} label={`#${i + 1}`} obj={item as Record<string, unknown>} depth={2} />;
                }
                return <ValueDisplay key={i} value={item} />;
              })}
            </CollapsibleSection>
          );
        }
        if (hasValue(value)) {
          return (
            <div key={key} className="flex gap-2 text-xs">
              <span className="font-mono text-slate-500">{key}:</span>
              <ValueDisplay value={value} />
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

function CharactersView({ data }: { data: Record<string, unknown> }) {
  const topMeta = ["story_id", "version_id", "file_type", "state_type", "master_story_file", "created_at"];
  const majorProfiles = (data.created_major_character_profiles as Record<string, unknown>[]) || [];
  const sideProfiles = (data.created_side_character_profiles as Record<string, unknown>[]) || [];
  const relMap = (data.character_relationship_map as Record<string, unknown>) || {};
  const relEnabled = relMap.is_enabled as boolean | undefined;
  const rels = relMap.relationships as unknown[] | undefined;
  const hasStructure = !!data.main_character_structure;

  return (
    <div className="space-y-2">
      {topMeta.map((k) => {
        const v = data[k];
        if (!hasValue(v)) return null;
        return <div key={k} className="flex gap-2 text-xs"><span className="font-mono text-slate-400">{k}:</span><ValueDisplay value={v} /></div>;
      })}
      <div className="flex gap-2 text-xs"><span className="font-mono text-slate-400">major_profiles:</span><span className="text-indigo-600 font-bold">{majorProfiles.length}</span></div>
      {majorProfiles.length > 0 && (
        <CollapsibleSection title={`Major Characters (${majorProfiles.length})`} defaultOpen={false}>
          {majorProfiles.map((p, i) => renderCharacterProfile(p, i))}
        </CollapsibleSection>
      )}
      {sideProfiles.length > 0 && (
        <CollapsibleSection title={`Side Characters (${sideProfiles.length})`} defaultOpen={false}>
          {sideProfiles.map((p, i) => renderCharacterProfile(p, i))}
        </CollapsibleSection>
      )}
      <CollapsibleSection title="Relationship Map" defaultOpen={false}>
        <div className="flex gap-2 text-xs"><span className="font-mono text-slate-500">enabled:</span><ValueDisplay value={relEnabled} /></div>
        {relEnabled && rels && rels.length > 0 && (
          <div className="pl-3 text-xs text-slate-600">{rels.length} relationship(s)</div>
        )}
      </CollapsibleSection>
      {hasStructure && (
        <CollapsibleSection title="Main Character Structure" defaultOpen={false}>
          <div className="flex gap-2 text-xs"><span className="font-mono text-blue-600 font-bold">selected:</span><ValueDisplay value={(data.main_character_structure as Record<string, unknown>).selected} /></div>
        </CollapsibleSection>
      )}
    </div>
  );
}

function PlotOutlineView({ data }: { data: Record<string, unknown> }) {
  const topMeta = ["story_id", "version_id", "file_type", "state_type", "master_story_file", "characters_file"];
  const chapters = (data.chapter_or_episode_list as Record<string, unknown>[]) || [];
  const scenes = (data.scene_cards as Record<string, unknown>[]) || [];
  const hasNarrative = !!data.narrative_structure;
  const hasWorkflow = !!data.story_start_workflow;

  return (
    <div className="space-y-2">
      {topMeta.map((k) => {
        const v = data[k];
        if (!hasValue(v)) return null;
        return <div key={k} className="flex gap-2 text-xs"><span className="font-mono text-slate-400">{k}:</span><ValueDisplay value={v} /></div>;
      })}
      {hasNarrative && (
        <CollapsibleSection title="Narrative Structure" defaultOpen={false}>
          <div className="flex gap-2 text-xs"><span className="font-mono text-blue-600 font-bold">selected:</span><ValueDisplay value={(data.narrative_structure as Record<string, unknown>).selected} /></div>
        </CollapsibleSection>
      )}
      {hasWorkflow && (
        <CollapsibleSection title="Story Start Workflow" defaultOpen={false}>
          <div className="flex gap-2 text-xs"><span className="font-mono text-blue-600 font-bold">selected:</span><ValueDisplay value={(data.story_start_workflow as Record<string, unknown>).selected} /></div>
        </CollapsibleSection>
      )}
      {chapters.length > 0 && (
        <CollapsibleSection title={`Chapters (${chapters.length})`} defaultOpen={false}>
          {chapters.map((ch, i) => {
            const title = (ch.chapter_title as string) || `Chapter ${i + 1}`;
            return (
              <CollapsibleSection key={(ch.chapter_id as string) || i} title={title} defaultOpen={false}>
                {Object.entries(ch).map(([k, v]) => {
                  if (k === "chapter_title") return null;
                  if (Array.isArray(v) && v.length > 0) {
                    return <div key={k} className="flex gap-2 text-xs" style={{ paddingLeft: "12px" }}><span className="font-mono text-slate-500">{k}:</span><span className="text-indigo-600">[{v.join(", ")}]</span></div>;
                  }
                  if (typeof v === "string" && v) {
                    return <div key={k} className="flex gap-2 text-xs" style={{ paddingLeft: "12px" }}><span className="font-mono text-slate-500">{k}:</span><ValueDisplay value={v} /></div>;
                  }
                  return null;
                })}
              </CollapsibleSection>
            );
          })}
        </CollapsibleSection>
      )}
      {scenes.length > 0 && (
        <CollapsibleSection title={`Scenes (${scenes.length})`} defaultOpen={false}>
          {scenes.map((sc, i) => {
            const loc = (sc.location as string) || `Scene ${i + 1}`;
            return (
              <CollapsibleSection key={(sc.scene_id as string) || i} title={loc} defaultOpen={false}>
                <SimpleObjectView label="" obj={sc as Record<string, unknown>} depth={2} />
              </CollapsibleSection>
            );
          })}
        </CollapsibleSection>
      )}
    </div>
  );
}

function GenericView({ data }: { data: Record<string, unknown> }) {
  const topMeta = ["story_id", "version_id", "file_type", "state_type", "created_at"];
  return (
    <div className="space-y-2">
      {topMeta.map((k) => {
        const v = data[k];
        if (!hasValue(v)) return null;
        return <div key={k} className="flex gap-2 text-xs"><span className="font-mono text-slate-400">{k}:</span><ValueDisplay value={v} /></div>;
      })}
      {Object.entries(data).map(([key, value]) => {
        if (topMeta.includes(key)) return null;
        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
          return <SimpleObjectView key={key} label={key} obj={value as Record<string, unknown>} depth={1} />;
        }
        if (Array.isArray(value) && value.length > 0) {
          return (
            <CollapsibleSection key={key} title={`${key} [${value.length}]`} defaultOpen={false}>
              {value.map((item, i) => {
                if (typeof item === "object" && item !== null) {
                  return <SimpleObjectView key={i} label={`#${i + 1}`} obj={item as Record<string, unknown>} depth={2} />;
                }
                return <div key={i} className="text-xs pl-3"><ValueDisplay value={item} /></div>;
              })}
            </CollapsibleSection>
          );
        }
        if (hasValue(value)) {
          return <div key={key} className="flex gap-2 text-xs"><span className="font-mono text-slate-500">{key}:</span><ValueDisplay value={value} /></div>;
        }
        return null;
      })}
    </div>
  );
}

export function StructuredJsonView({ data }: StructuredJsonViewProps) {
  const [showAll, setShowAll] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const fileType = useMemo(() => {
    if (!data || typeof data !== "object") return "generic";
    return detectFileType(data as Record<string, unknown>);
  }, [data]);

  if (showRaw || !data || typeof data !== "object") {
    return (
      <div>
        <pre className="max-h-[520px] max-w-full overflow-auto rounded-2xl border-2 border-slate-900 bg-slate-950 p-4 text-xs text-lime-100">
          {JSON.stringify(data, null, 2)}
        </pre>
        {typeof data === "object" && (
          <button onClick={() => setShowRaw(false)} className="mt-2 text-xs text-violet-600 underline">Switch to simplified view</button>
        )}
      </div>
    );
  }

  const dataObj = data as Record<string, unknown>;

  const rendered = (() => {
    switch (fileType) {
      case "characters": return <CharactersView data={dataObj} />;
      case "master_story": return <MasterStoryView data={dataObj} />;
      case "plot_outline": return <PlotOutlineView data={dataObj} />;
      default: return <GenericView data={dataObj} />;
    }
  })();

  return (
    <div>
      <div className={cn(
        "max-h-[520px] max-w-full overflow-auto rounded-2xl border-2 border-slate-900 p-3",
        "bg-white text-slate-800"
      )}>
        {rendered}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 cursor-pointer">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="rounded" />
          Show template structure
        </label>
        <button onClick={() => setShowRaw(true)} className="text-[10px] font-bold text-violet-600 underline">Show raw JSON</button>
      </div>
    </div>
  );
}
