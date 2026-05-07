"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { AI_EMPTY_MESSAGE, getUsableAiOutput } from "@/lib/aiResults";
import { useHydrateOnce } from "@/lib/hooks/useHydrate";
import { Panel } from "@/components/cards/Panel";
import { Field } from "@/components/forms/Field";
import { OptionGrid } from "@/components/forms/OptionGrid";
import { AiButton } from "@/components/forms/AiButton";
import { CustomInput } from "@/components/forms/CustomInput";
import { StructuredJsonView } from "@/components/cards/StructuredJsonView";
import { ErrorBanner } from "@/components/forms/ErrorBanner";

type FactionDetail = { main_ruling_side: string; opposing_side: string; neutral_side: string; hidden_side: string; ruling_side_details: string; conflict_map: string };
const emptyFactionDetail = (): FactionDetail => ({ main_ruling_side: "", opposing_side: "", neutral_side: "", hidden_side: "", ruling_side_details: "", conflict_map: "" });
const factionKey = (faction: string) => faction.toLowerCase().replace(/[^a-z0-9]/g, "_");

const RULE_DETAIL_FIELDS: { key: string; label: string }[] = [
  { key: "magic_rules", label: "Magic rules" },
  { key: "power_rules", label: "Power rules" },
  { key: "demon_rules", label: "Demon rules" },
  { key: "monster_rules", label: "Monster rules" },
  { key: "god_rules", label: "God rules" },
  { key: "technology_rules", label: "Technology rules" },
  { key: "race_species_rules", label: "Race / species rules" },
  { key: "realm_dimension_rules", label: "Realm / dimension rules" },
  { key: "forbidden_rules", label: "Forbidden rules" },
  { key: "power_limits", label: "Power limits" },
  { key: "custom_rule_details", label: "Custom rule details" },
];

const NO_SUPERNATURAL_RULE = "No Supernatural Elements";

const RULE_DETAIL_DEPENDENCIES: Record<string, string[]> = {
  magic_rules: ["Magic Exists", "Curses Exist", "Artifacts / Relics Exist", "Summoning Exists"],
  power_rules: ["Superpowers Exist", "Power System Exists", "Soul System Exists", "Bloodline System Exists", "Transformation Exists", "Reality Bending Exists"],
  demon_rules: ["Demons Exist"],
  monster_rules: ["Monsters Exist"],
  god_rules: ["Gods Exist", "Spirits / Ghosts Exist", "Prophecies Exist"],
  technology_rules: ["Advanced Technology Exists", "Ancient Technology Exists"],
  race_species_rules: ["Different Races / Species Exist"],
  realm_dimension_rules: ["Portals / Gates Exist", "Multiple Realms Exist", "Reincarnation Exists", "Time Travel Exists"],
  forbidden_rules: ["Forbidden Knowledge Exists", "Curses Exist"],
  power_limits: ["Magic Exists", "Superpowers Exist", "Power System Exists", "Curses Exist", "Soul System Exists", "Bloodline System Exists", "Summoning Exists", "Transformation Exists", "Reality Bending Exists"],
  custom_rule_details: ["Custom"],
};
const DEFAULT_RULE_DETAIL_KEYS = new Set(["forbidden_rules", "custom_rule_details"]);

const THREAT_DETAIL_FIELDS: { key: string; label: string }[] = [
  { key: "main_threat_source", label: "Main threat source" },
  { key: "main_threat_goal", label: "Main threat goal" },
  { key: "main_threat_target", label: "Main threat target" },
  { key: "stakes_if_major_threat_wins", label: "Stakes if major threat wins" },
  { key: "time_limit", label: "Time limit" },
  { key: "hidden_truth_behind_threat", label: "Hidden truth behind threat" },
];

export default function WorldPage() {
  const { storyId } = useParams<{ storyId: string }>();
  const master = useQuery({ queryKey: ["master", storyId], queryFn: () => api.getMasterStory(storyId) });
  const content = (master.data?.content || master.data || {}) as any;

  // World type
  const [worldType, setWorldType] = useState("");
  const [customWorldType, setCustomWorldType] = useState("");

  // World rules
  const [rules, setRules] = useState<string[]>([]);
  const [customRules, setCustomRules] = useState("");
  const [ruleDetails, setRuleDetails] = useState<Record<string, string>>({});

  // Factions
  const [factions, setFactions] = useState<string[]>([]);
  const [customFactions, setCustomFactions] = useState("");
  const [expandedFactions, setExpandedFactions] = useState<Record<string, FactionDetail>>({});

  // Threats
  const [threat, setThreat] = useState("");
  const [customThreats, setCustomThreats] = useState("");
  const [minorThreats, setMinorThreats] = useState<string[]>([]);
  const [threatDetails, setThreatDetails] = useState<Record<string, string>>({});

  // Hydrate form state from saved JSON exactly once per story.
  // Without this, opening a saved story shows empty fields and Save would
  // overwrite real data with blanks for any field the user did not re-touch.
  useHydrateOnce(!!master.data, storyId, () => {
    const m = (master.data?.content || master.data || {}) as any;
    setWorldType(m.world_type?.selected || "");
    setCustomWorldType(m.world_type?.custom_world_type || "");
    setRules(Array.isArray(m.world_master_rules?.selected) ? m.world_master_rules.selected : []);
    setCustomRules(m.world_master_rules?.custom_rules || "");
    const rd = m.world_master_rules?.rule_details || {};
    setRuleDetails(Object.fromEntries(RULE_DETAIL_FIELDS.map(({ key }) => [key, rd[key] || ""])));
    setFactions(Array.isArray(m.major_factions_and_ruling_sides?.selected) ? m.major_factions_and_ruling_sides.selected : []);
    setCustomFactions(m.major_factions_and_ruling_sides?.custom_factions || "");
    const fd = m.major_factions_and_ruling_sides?.faction_details || {};
    const expanded: Record<string, FactionDetail> = {};
    for (const f of (m.major_factions_and_ruling_sides?.selected || [])) {
      if (f === "Custom") continue;
      const saved = fd[factionKey(f)] || {};
      expanded[f] = { ...emptyFactionDetail(), ...saved };
    }
    setExpandedFactions(expanded);
    setThreat(m.major_threats_and_minor_side_threats?.major_threat || "");
    setCustomThreats(m.major_threats_and_minor_side_threats?.custom_threats || "");
    setMinorThreats(Array.isArray(m.major_threats_and_minor_side_threats?.minor_side_threats) ? m.major_threats_and_minor_side_threats.minor_side_threats : []);
    const td = m.major_threats_and_minor_side_threats?.threat_details || {};
    setThreatDetails(Object.fromEntries(THREAT_DETAIL_FIELDS.map(({ key }) => [key, td[key] || ""])));
  });

  // AI
  const [aiWorld, setAiWorld] = useState<Record<string, any> | null>(null);
  const [aiWorldError, setAiWorldError] = useState<string | null>(null);
  const [aiWorldJustApplied, setAiWorldJustApplied] = useState(false);
  const aiWorldAppliedRef = useRef<Record<string, any> | null>(null);
  const aiWorldFill = useMutation({
    mutationFn: () => api.aiGenerate(storyId, {
      page: "world",
      target_fields: ["world_core_details"],
      partial_input: buildWorldAiInput(),
      generation_hints: {
        active_rule_detail_fields: activeRuleDetailFields().map(({ key }) => key),
        selected_factions: factions.filter((f) => f !== "Custom"),
        selected_minor_threats: minorThreats.filter((t) => t !== "Custom"),
      },
    }),
    onSuccess: (data) => {
      try {
        const gen = getUsableAiOutput("world", ["world_core_details"], data);
        setAiWorldError(null);
        setAiWorld(gen);
      } catch (err: any) {
        setAiWorld(null);
        setAiWorldError(err?.message || AI_EMPTY_MESSAGE);
      }
    },
    onError: (err: any) => {
      setAiWorld(null);
      setAiWorldError(err?.message || "AI request failed. Retry in a minute or fill manually.");
    },
  });

  // Run a sequence of patches against master_story.json without firing a
  // refetch after each one. Backend patches are read-modify-write, so they
  // must run sequentially — Promise.all would race and lose writes.
  async function runPatchChain(patches: Array<{ target_branch: string; operation: string; value: any }>) {
    for (const body of patches) {
      await api.patchMasterStory(storyId, body);
    }
  }
  const saveAll = useMutation({
    mutationFn: (patches: Array<{ target_branch: string; operation: string; value: any }>) => runPatchChain(patches),
    onSuccess: () => master.refetch(),
  });

  function activeRuleDetailFields(selectedRules = rules) {
    if (selectedRules.includes(NO_SUPERNATURAL_RULE)) {
      return RULE_DETAIL_FIELDS.filter(({ key }) => DEFAULT_RULE_DETAIL_KEYS.has(key));
    }
    return RULE_DETAIL_FIELDS.filter(({ key }) => {
      if (DEFAULT_RULE_DETAIL_KEYS.has(key)) return true;
      const dependencies = RULE_DETAIL_DEPENDENCIES[key] || [];
      return dependencies.some((rule) => selectedRules.includes(rule));
    });
  }

  function toggleRule(value: string) {
    setRules((old) => {
      if (old.includes(value)) return old.filter((x) => x !== value);
      if (value === NO_SUPERNATURAL_RULE) return [value];
      return [...old.filter((x) => x !== NO_SUPERNATURAL_RULE), value];
    });
  }
  function toggleFaction(value: string) {
    setFactions((old) => {
      if (old.includes(value)) {
        setExpandedFactions((ef) => { const n = { ...ef }; delete n[value]; return n; });
        return old.filter((x) => x !== value);
      }
      setExpandedFactions((ef) => ({ ...ef, [value]: { main_ruling_side: "", opposing_side: "", neutral_side: "", hidden_side: "", ruling_side_details: "", conflict_map: "" } }));
      return [...old, value];
    });
  }
  function toggleMinorThreat(value: string) { setMinorThreats((old) => old.includes(value) ? old.filter((x) => x !== value) : [...old, value]); }
  function updateFactionDetail(faction: string, field: string, value: string) {
    setExpandedFactions((ef) => ({ ...ef, [faction]: { ...ef[faction], [field]: value } }));
  }

  function buildWorldAiInput() {
    return {
      world_type: { selected: worldType, custom_world_type: customWorldType },
      world_master_rules: {
        selected: rules,
        custom_rules: customRules,
        active_rule_detail_fields: activeRuleDetailFields().map(({ key }) => key),
        rule_details: ruleDetails,
      },
      major_factions_and_ruling_sides: {
        selected: factions,
        custom_factions: customFactions,
        faction_details: Object.fromEntries(Object.entries(expandedFactions).map(([name, detail]) => [factionKey(name), detail])),
      },
      major_threats_and_minor_side_threats: {
        major_threat: threat,
        custom_threats: customThreats,
        minor_side_threats: minorThreats,
        threat_details: threatDetails,
      },
    };
  }

  function valueFrom(...values: any[]): string {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) return value.trim();
      if (Array.isArray(value) && value.some(Boolean)) return value.filter(Boolean).join(", ");
      if (value !== null && value !== undefined && typeof value !== "object") return String(value);
    }
    return "";
  }

  function pickFactionDetail(source: any, faction: string): Record<string, any> {
    if (!source || typeof source !== "object") return {};
    const key = factionKey(faction);
    const direct = source[key] || source[faction] || source[faction.toLowerCase()];
    if (direct && typeof direct === "object") return direct;
    if (Array.isArray(source)) {
      const match = source.find((item) => {
        const name = item?.faction || item?.name || item?.faction_name || item?.selected;
        return typeof name === "string" && factionKey(name) === key;
      });
      return match || {};
    }
    return {};
  }

  function applyAiWorldFill(results: Record<string, any>) {
    const generated = results?.world_core_details || results || {};
    const rulesBlock = generated.world_master_rules || generated.rules || {};
    const factionsBlock = generated.major_factions_and_ruling_sides || generated.factions || {};
    const threatsBlock = generated.major_threats_and_minor_side_threats || generated.threats || {};

    if (worldType === "Custom") {
      const custom = valueFrom(generated.custom_world_type, generated.world_type?.custom_world_type, generated.world_type);
      if (custom) setCustomWorldType(custom);
    }
    if (rules.includes("Custom")) {
      const custom = valueFrom(generated.custom_rules, rulesBlock.custom_rules);
      if (custom) setCustomRules(custom);
    }

    const generatedRuleDetails = generated.rule_details || rulesBlock.rule_details || {};
    const activeRuleKeys = new Set(activeRuleDetailFields().map(({ key }) => key));
    if (generatedRuleDetails && typeof generatedRuleDetails === "object") {
      setRuleDetails((prev) => {
        const next = { ...prev };
        for (const { key } of RULE_DETAIL_FIELDS) {
          if (!activeRuleKeys.has(key)) continue;
          const value = valueFrom(generatedRuleDetails[key]);
          if (value) next[key] = value;
        }
        return next;
      });
    }

    if (factions.includes("Custom")) {
      const custom = valueFrom(generated.custom_factions, factionsBlock.custom_factions);
      if (custom) setCustomFactions(custom);
    }
    const generatedFactionDetails = generated.faction_details || factionsBlock.faction_details || {};
    if (generatedFactionDetails && typeof generatedFactionDetails === "object") {
      setExpandedFactions((prev) => {
        const next = { ...prev };
        for (const faction of factions.filter((f) => f !== "Custom")) {
          const detail = pickFactionDetail(generatedFactionDetails, faction);
          next[faction] = {
            ...emptyFactionDetail(),
            ...(next[faction] || {}),
            main_ruling_side: valueFrom(detail.main_ruling_side) || next[faction]?.main_ruling_side || "",
            opposing_side: valueFrom(detail.opposing_side) || next[faction]?.opposing_side || "",
            neutral_side: valueFrom(detail.neutral_side) || next[faction]?.neutral_side || "",
            hidden_side: valueFrom(detail.hidden_side) || next[faction]?.hidden_side || "",
            ruling_side_details: valueFrom(detail.ruling_side_details, detail.details) || next[faction]?.ruling_side_details || "",
            conflict_map: valueFrom(detail.conflict_map, detail.conflict) || next[faction]?.conflict_map || "",
          };
        }
        return next;
      });
    }

    if (threat === "Custom") {
      const custom = valueFrom(generated.custom_threats, threatsBlock.custom_threats);
      if (custom) setCustomThreats(custom);
    }
    const generatedThreatDetails = generated.threat_details || threatsBlock.threat_details || {};
    if (generatedThreatDetails && typeof generatedThreatDetails === "object") {
      setThreatDetails((prev) => {
        const next = { ...prev };
        for (const { key } of THREAT_DETAIL_FIELDS) {
          const value = valueFrom(generatedThreatDetails[key]);
          if (value) next[key] = value;
        }
        return next;
      });
    }

    setAiWorld(null);
  }

  useEffect(() => {
    if (aiWorld && aiWorldAppliedRef.current !== aiWorld) {
      aiWorldAppliedRef.current = aiWorld;
      applyAiWorldFill(aiWorld);
      setAiWorldJustApplied(true);
      const t = setTimeout(() => setAiWorldJustApplied(false), 4000);
      return () => clearTimeout(t);
    }
  }, [aiWorld]); // eslint-disable-line react-hooks/exhaustive-deps

  function buildWorldPatches() {
    const ops: Array<{ target_branch: string; operation: string; value: any }> = [];
    // World type
    if (worldType) ops.push({ target_branch: "world_type.selected", operation: "replace", value: worldType });
    if (worldType === "Custom" && customWorldType) ops.push({ target_branch: "world_type.custom_world_type", operation: "replace", value: customWorldType });
    // World rules
    if (rules.length) ops.push({ target_branch: "world_master_rules.selected", operation: "replace", value: rules });
    if (rules.includes("Custom") && customRules) ops.push({ target_branch: "world_master_rules.custom_rules", operation: "replace", value: customRules });
    // Rule details
    const activeRuleDetailKeys = new Set(activeRuleDetailFields().map(({ key }) => key));
    const savedRuleDetails = content.world_master_rules?.rule_details || {};
    for (const { key } of RULE_DETAIL_FIELDS) {
      const value = activeRuleDetailKeys.has(key) ? (ruleDetails[key] || "") : "";
      if (value || savedRuleDetails[key] || ruleDetails[key]) {
        ops.push({ target_branch: `world_master_rules.rule_details.${key}`, operation: "replace", value });
      }
    }
    // Factions
    if (factions.length) ops.push({ target_branch: "major_factions_and_ruling_sides.selected", operation: "replace", value: factions });
    if (factions.includes("Custom") && customFactions) ops.push({ target_branch: "major_factions_and_ruling_sides.custom_factions", operation: "replace", value: customFactions });
    // Faction details
    for (const [faction, details] of Object.entries(expandedFactions)) {
      for (const [field, value] of Object.entries(details)) {
        if (value) ops.push({ target_branch: `major_factions_and_ruling_sides.faction_details.${factionKey(faction)}.${field}`, operation: "replace", value });
      }
    }
    // Threats
    if (threat) ops.push({ target_branch: "major_threats_and_minor_side_threats.major_threat", operation: "replace", value: threat });
    if (threat === "Custom" && customThreats) ops.push({ target_branch: "major_threats_and_minor_side_threats.custom_threats", operation: "replace", value: customThreats });
    if (minorThreats.length) ops.push({ target_branch: "major_threats_and_minor_side_threats.minor_side_threats", operation: "replace", value: minorThreats });
    // Threat details
    for (const { key } of THREAT_DETAIL_FIELDS) {
      if (threatDetails[key]) ops.push({ target_branch: `major_threats_and_minor_side_threats.threat_details.${key}`, operation: "replace", value: threatDetails[key] });
    }
    return ops;
  }
  function saveWorld() { saveAll.mutate(buildWorldPatches()); }

  function saveAllRules() {
    const activeRuleDetailKeys = new Set(activeRuleDetailFields().map(({ key }) => key));
    const savedRuleDetails = content.world_master_rules?.rule_details || {};
    const ops = RULE_DETAIL_FIELDS
      .filter(({ key }) => activeRuleDetailKeys.has(key) || savedRuleDetails[key] || ruleDetails[key])
      .map(({ key }) => ({
        target_branch: `world_master_rules.rule_details.${key}`,
        operation: "replace",
        value: activeRuleDetailKeys.has(key) ? (ruleDetails[key] || "") : "",
      }));
    saveAll.mutate(ops);
  }

  function saveThreatDetails() {
    const ops = THREAT_DETAIL_FIELDS
      .filter(({ key }) => threatDetails[key])
      .map(({ key }) => ({ target_branch: `major_threats_and_minor_side_threats.threat_details.${key}`, operation: "replace", value: threatDetails[key] }));
    saveAll.mutate(ops);
  }

  const factionOptions: string[] = content.major_factions_and_ruling_sides?.options || [];
  const minorThreatOptions: string[] = content.major_threats_and_minor_side_threats?.minor_threat_options || [];

  return (
    <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <Panel title="World Core" subtitle="World scale, rules, factions, threats, and big pressure.">
        {!content.world_type?.options && !content.world_master_rules?.options && (
          <div className="rounded-xl border-2 border-dashed border-slate-300 p-4 text-center text-sm font-bold text-slate-500">No world-building data yet. Use the form below to define your storys world scale, rules, factions, and threats, or run AI World Build to generate suggestions from your story context.</div>
        )}
        <div className="space-y-5">

          {/* ---- WORLD TYPE ---- */}
          <div>
            <h3 className="mb-2 font-black">World scale</h3>
            <OptionGrid options={content.world_type?.options || []} selected={worldType} onSelect={setWorldType} />
            {worldType === "Custom" && <CustomInput label="Custom world type" value={customWorldType} onChange={setCustomWorldType} placeholder="Describe your custom world type..." />}
          </div>

          {/* ---- WORLD RULES ---- */}
          <div>
            <h3 className="mb-2 font-black">World rules</h3>
            <OptionGrid options={content.world_master_rules?.options || []} selected={rules} onSelect={toggleRule} multi />
            {rules.includes("Custom") && <CustomInput label="Custom world rules" value={customRules} onChange={setCustomRules} placeholder="Describe your custom rules..." />}
          </div>

          {/* ---- RULE DETAIL TEXTAREAS ---- */}
          <div>
            <h3 className="mb-2 font-black">Rule details</h3>
            {activeRuleDetailFields().length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-bold text-slate-500">
                Select a world rule above to open only the detail fields it needs.
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {activeRuleDetailFields().map(({ key, label }) => (
                    <Field
                      key={key}
                      label={label}
                      value={ruleDetails[key] || ""}
                      onChange={(v) => setRuleDetails((prev) => ({ ...prev, [key]: v }))}
                      textarea
                    />
                  ))}
                </div>
                <button
                  className="mt-3 rounded-xl border-2 border-slate-900 bg-slate-900 px-4 py-2 text-xs font-black text-white sm:rounded-2xl sm:px-5 sm:py-2.5 sm:text-sm"
                  onClick={saveAllRules}
                  disabled={saveAll.isPending}
                >
                  Save Rule Details
                </button>
              </>
            )}
          </div>

          {/* ---- FACTIONS ---- */}
          <div>
            <h3 className="mb-2 font-black">Major factions</h3>
            <OptionGrid options={factionOptions} selected={factions} onSelect={toggleFaction} multi />
            {factions.includes("Custom") && <CustomInput label="Custom factions" value={customFactions} onChange={setCustomFactions} placeholder="List your custom factions..." />}

            {factions.filter((f) => f !== "Custom").map((faction) => {
              const details = expandedFactions[faction];
              if (!details) return null;
              return (
                <details key={faction} className="mt-2 rounded-xl border-2 border-slate-200 bg-slate-50 p-3 sm:rounded-2xl sm:p-4">
                  <summary className="cursor-pointer font-bold text-sm">{faction}</summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field label="Main ruling side" value={details.main_ruling_side} onChange={(v) => updateFactionDetail(faction, "main_ruling_side", v)} />
                    <Field label="Opposing side" value={details.opposing_side} onChange={(v) => updateFactionDetail(faction, "opposing_side", v)} />
                    <Field label="Neutral side" value={details.neutral_side} onChange={(v) => updateFactionDetail(faction, "neutral_side", v)} />
                    <Field label="Hidden side" value={details.hidden_side} onChange={(v) => updateFactionDetail(faction, "hidden_side", v)} />
                    <div className="sm:col-span-2">
                      <Field label="Ruling side details" value={details.ruling_side_details} onChange={(v) => updateFactionDetail(faction, "ruling_side_details", v)} textarea />
                    </div>
                    <div className="sm:col-span-2">
                      <Field label="Conflict map" value={details.conflict_map} onChange={(v) => updateFactionDetail(faction, "conflict_map", v)} textarea />
                    </div>
                  </div>
                </details>
              );
            })}
          </div>

          {/* ---- AI ---- */}
          <div className="rounded-xl border-2 border-violet-300 bg-violet-50 p-3 sm:rounded-2xl sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-violet-800">AI Fill World Details</h3>
                <p className="mt-1 text-xs font-bold text-violet-700">Select world scale, rules, factions, and threats first. AI fills the matching detail fields from the whole story context.</p>
              </div>
              <AiButton
                label="Fill Details"
                onClick={() => aiWorldFill.mutate()}
                loading={aiWorldFill.isPending}
                disabled={!worldType && rules.length === 0 && factions.length === 0 && !threat}
                variant="secondary"
              />
            </div>
            {(!worldType && rules.length === 0 && factions.length === 0 && !threat) && (
              <p className="mt-2 text-xs font-bold text-red-600">Choose at least one world option before using AI fill.</p>
            )}

            {aiWorldError && <div className="mt-3"><ErrorBanner error={aiWorldError} onDismiss={() => setAiWorldError(null)} /></div>}
          {aiWorld && (
            <div className="mt-3 rounded-lg border-2 border-emerald-300 bg-emerald-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-black text-emerald-700">✓ Fields filled — review and edit below</span>
                <div className="flex gap-2">
                  <button onClick={() => { aiWorldAppliedRef.current = null; applyAiWorldFill(aiWorld); }} className="text-xs font-bold text-indigo-600 underline">Re-apply</button>
                  <button onClick={() => setAiWorld(null)} className="text-xs font-bold text-emerald-600 underline">Clear</button>
                </div>
              </div>
              <pre className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-[10px] text-emerald-800">{JSON.stringify(aiWorld, null, 2)}</pre>
            </div>
          )}
          {aiWorldJustApplied && !aiWorld && !aiWorldError && (
            <div className="mt-3 rounded-lg border-2 border-emerald-300 bg-emerald-50 p-2">
              <span className="text-xs font-black text-emerald-700">✓ Fields filled — review and edit below</span>
            </div>
          )}

          </div>

          {/* ---- THREATS ---- */}
          <div>
            <h3 className="mb-2 font-black">Major threat</h3>
            <OptionGrid options={content.major_threats_and_minor_side_threats?.options || []} selected={threat} onSelect={setThreat} />
            {threat === "Custom" && <CustomInput label="Custom major threat" value={customThreats} onChange={setCustomThreats} placeholder="Describe your custom threat..." />}
          </div>

          {/* ---- MINOR THREATS ---- */}
          {minorThreatOptions.length > 0 && (
            <div>
              <h3 className="mb-2 font-black">Minor threats</h3>
              <OptionGrid options={minorThreatOptions} selected={minorThreats} onSelect={toggleMinorThreat} multi />
            </div>
          )}

          {/* ---- THREAT DETAILS ---- */}
          <div>
            <h3 className="mb-2 font-black">Threat details</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {THREAT_DETAIL_FIELDS.map(({ key, label }) => (
                <div key={key} className={key === "stakes_if_major_threat_wins" || key === "hidden_truth_behind_threat" ? "sm:col-span-2" : ""}>
                  <Field
                    label={label}
                    value={threatDetails[key] || ""}
                    onChange={(v) => setThreatDetails((prev) => ({ ...prev, [key]: v }))}
                    textarea={key === "stakes_if_major_threat_wins" || key === "hidden_truth_behind_threat"}
                  />
                </div>
              ))}
            </div>
            <button
              className="mt-3 rounded-xl border-2 border-slate-900 bg-slate-900 px-4 py-2 text-xs font-black text-white sm:rounded-2xl sm:px-5 sm:py-2.5 sm:text-sm"
              onClick={saveThreatDetails}
              disabled={saveAll.isPending}
            >
              Save Threat Details
            </button>
          </div>

          {/* ---- SAVE ALL ---- */}
          {saveAll.isError && <ErrorBanner error={saveAll.error as Error} />}
          <button
            className="w-full rounded-xl border-2 border-slate-900 bg-slate-900 px-5 py-3 text-sm font-black text-white sm:w-auto sm:rounded-2xl sm:text-base"
            onClick={saveWorld}
            disabled={saveAll.isPending}
          >
            {saveAll.isPending ? "Saving..." : "Save World Core"}
          </button>
        </div>
      </Panel>
      <Panel title="World Snapshot"><StructuredJsonView data={{ world_type: content.world_type, world_master_rules: content.world_master_rules, factions: content.major_factions_and_ruling_sides, threats: content.major_threats_and_minor_side_threats }} /></Panel>
    </div>
  );
}
