type AnyRecord = Record<string, any>;

export type StoryReaderChapter = {
  id: string;
  number: number;
  title: string;
  arcTitle: string;
  structureBeat: string;
  storyParagraphs: string[];
  review: {
    characters: string[];
    relationshipMovement: string[];
    threatMovement: string[];
    worldRules: string[];
    sceneCoverage: string[];
    openHooks: string[];
  };
};

export type StoryReaderDocument = {
  title: string;
  arcTitle: string;
  arcMeta: string[];
  overview: string[];
  chapters: StoryReaderChapter[];
  currentDraft?: string;
};

function asArray(value: any): any[] {
  return Array.isArray(value) ? value : [];
}

function compact(values: any[]): string[] {
  return values
    .flatMap((value) => {
      if (Array.isArray(value)) return value;
      return [value];
    })
    .map(toText)
    .map((value) => value.trim())
    .filter(Boolean);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function selected(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value.selected === "string") return value.selected;
  return "";
}

function toText(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value.name === "string") return value.name;
  if (typeof value.character_name === "string") return value.character_name;
  if (typeof value.profile_name === "string") return value.profile_name;
  if (typeof value.title === "string") return value.title;
  if (typeof value.label === "string") return value.label;
  if (typeof value.summary === "string") return value.summary;
  if (typeof value.description === "string") return value.description;
  return "";
}

function sentence(value: any): string {
  return toText(value).trim();
}

function normalizeBeat(value: any): string {
  const text = sentence(value).replace(/_/g, " ");
  if (!text) return "Not marked";
  return text.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function chapterTitle(chapter: AnyRecord): string {
  return sentence(chapter.chapter_title) || sentence(chapter.title) || "Untitled Chapter";
}

function isMeaningfulChapter(chapter: AnyRecord): boolean {
  return Boolean(
    sentence(chapter.chapter_id) ||
      sentence(chapter.chapter_title) ||
      sentence(chapter.summary) ||
      sentence(chapter.chapter_purpose)
  );
}

function isMeaningfulScene(scene: AnyRecord): boolean {
  return Boolean(
    sentence(scene.scene_goal) ||
      sentence(scene.scene_conflict) ||
      sentence(scene.new_information_revealed) ||
      sentence(scene.visual_manga_moment) ||
      sentence(scene.ending_beat) ||
      sentence(scene.location)
  );
}

function chapterScriptParagraphs(chapter: AnyRecord, scenes: AnyRecord[], pages: AnyRecord[]): string[] {
  const sceneIds = new Set(scenes.map((scene) => sentence(scene.scene_id)).filter(Boolean));
  const matchingPages = pages.filter((page) => {
    const pageChapterId = sentence(page.chapter_id);
    const pageSceneId = sentence(page.scene_id);
    return pageChapterId === sentence(chapter.chapter_id) || (pageSceneId && sceneIds.has(pageSceneId));
  });

  const lines = matchingPages.flatMap((page) => {
    const pageLines = compact([page.page_purpose, page.page_mood]);
    const panelLines = asArray(page.panels).flatMap((panel) => {
      const dialogue = asArray(panel.dialogue)
        .map((line) => {
          const speaker = sentence(line.speaker_name || line.speaker || line.speaker_id);
          const text = sentence(line.text);
          if (!text) return "";
          return speaker ? `${speaker}: ${text}` : text;
        })
        .filter(Boolean);
      return compact([
        panel.visual,
        panel.character_action,
        panel.narration,
        panel.continuity_notes,
        ...dialogue,
      ]);
    });
    return [...pageLines, ...panelLines];
  });

  return unique(lines).slice(0, 8);
}

function fallbackStoryParagraphs(chapter: AnyRecord, scenes: AnyRecord[]): string[] {
  const core = compact([
    chapter.chapter_purpose,
    chapter.summary,
    chapter.main_conflict ? `Conflict: ${chapter.main_conflict}` : "",
    chapter.emotional_beat ? `Emotional beat: ${chapter.emotional_beat}` : "",
    chapter.custom_chapter_details,
  ]);

  const sceneLines = scenes
    .filter(isMeaningfulScene)
    .sort((a, b) => Number(a.scene_order || 0) - Number(b.scene_order || 0))
    .slice(0, 4)
    .map((scene) => {
      const pieces = compact([
        scene.location ? `Scene ${scene.scene_order || "?"} at ${scene.location}` : `Scene ${scene.scene_order || "?"}`,
        scene.scene_goal,
        scene.new_information_revealed,
        scene.visual_manga_moment,
        scene.ending_beat,
      ]);
      return pieces.join(". ");
    })
    .filter(Boolean);

  return unique([...core, ...sceneLines]).slice(0, 8);
}

function openHooks(chapter: AnyRecord, scenes: AnyRecord[]): string[] {
  const sceneHooks = scenes
    .filter(isMeaningfulScene)
    .sort((a, b) => Number(a.scene_order || 0) - Number(b.scene_order || 0))
    .slice(-3)
    .flatMap((scene) => compact([scene.ending_beat, scene.new_information_revealed]));
  return unique(compact([chapter.twist_or_hook, chapter.ending_cliffhanger, ...sceneHooks])).slice(0, 4);
}

function sceneCoverage(scenes: AnyRecord[]): string[] {
  const meaningful = scenes.filter(isMeaningfulScene).sort((a, b) => Number(a.scene_order || 0) - Number(b.scene_order || 0));
  if (meaningful.length === 0) return ["No scene cards yet."];
  const highlights = meaningful.slice(0, 5).map((scene) => {
    const label = `Scene ${scene.scene_order || "?"}`;
    const main = sentence(scene.scene_goal) || sentence(scene.visual_manga_moment) || sentence(scene.ending_beat);
    return main ? `${label}: ${main}` : label;
  });
  const remaining = meaningful.length - highlights.length;
  return remaining > 0 ? [...highlights, `${remaining} more scene card${remaining === 1 ? "" : "s"}.`] : highlights;
}

function threadMatchesChapter(thread: AnyRecord, chapter: AnyRecord): boolean {
  const haystack = JSON.stringify(thread || {}).toLowerCase();
  const title = chapterTitle(chapter).toLowerCase();
  const chapterId = sentence(chapter.chapter_id).toLowerCase();
  return Boolean((title && haystack.includes(title)) || (chapterId && haystack.includes(chapterId)));
}

function relatedThreadNotes(plotThreads: AnyRecord, chapter: AnyRecord): string[] {
  const relationshipThreads = asArray(plotThreads.relationship_threads)
    .filter((thread) => threadMatchesChapter(thread, chapter))
    .flatMap((thread) => compact([thread.relationship_id, thread.start_dynamic, thread.breaking_point, thread.final_dynamic, thread.change_beats]));
  const characterThreads = asArray(plotThreads.character_arc_threads)
    .filter((thread) => threadMatchesChapter(thread, chapter))
    .flatMap((thread) => compact([thread.character_id, thread.starting_state, thread.lowest_point, thread.final_state, thread.growth_beats]));
  return unique([...relationshipThreads, ...characterThreads]).slice(0, 5);
}

function characterNameMap(characters: AnyRecord): Map<string, string> {
  const profiles = [
    ...asArray(characters.created_major_character_profiles),
    ...asArray(characters.created_side_character_profiles),
    ...asArray(characters.major_profiles),
    ...asArray(characters.side_profiles),
    ...asArray(characters.profiles),
  ];
  const map = new Map<string, string>();
  profiles.forEach((profile) => {
    const name = sentence(profile.character_name || profile.name || profile.profile_name || profile.full_name);
    if (!name) return;
    compact([profile.character_id, profile.profile_id, profile.id, name]).forEach((key) => map.set(key, name));
  });
  return map;
}

function namedValues(values: any[], names: Map<string, string>): string[] {
  return unique(compact(values).map((value) => names.get(value) || value));
}

function storyTitle(masterStory: AnyRecord, plotOutline: AnyRecord): string {
  return (
    sentence(masterStory.story_title) ||
    sentence(masterStory.story_foundation?.story_title) ||
    sentence(masterStory.title) ||
    sentence(plotOutline.story_title) ||
    "Untitled Story"
  );
}

export function assembleStoryReader(input: {
  plotOutline?: AnyRecord;
  chapterScript?: AnyRecord;
  characters?: AnyRecord;
  masterStory?: AnyRecord;
  workspace?: AnyRecord;
}): StoryReaderDocument {
  const plotOutline = input.plotOutline || {};
  const chapterScript = input.chapterScript || {};
  const masterStory = input.masterStory || {};
  const characters = input.characters || {};
  const workspace = input.workspace || {};
  const arc = plotOutline.story_arc_overview || {};
  const chapters = asArray(plotOutline.chapter_or_episode_list?.chapters).filter(isMeaningfulChapter);
  const allScenes = asArray(plotOutline.scene_cards?.scenes);
  const pages = asArray(chapterScript.pages);
  const plotThreads = plotOutline.plot_threads || {};
  const characterNames = characterNameMap(characters);
  const currentDraft = sentence(workspace.user_free_writing?.text || workspace.ai_completion?.expanded_text);

  const readerChapters = chapters
    .slice()
    .sort((a, b) => Number(a.chapter_number || 0) - Number(b.chapter_number || 0))
    .map((chapter, index) => {
      const chapterId = sentence(chapter.chapter_id);
      const scenes = allScenes.filter((scene) => sentence(scene.chapter_id) === chapterId);
      const scriptParagraphs = chapterScriptParagraphs(chapter, scenes, pages);
      const storyParagraphs = scriptParagraphs.length > 0 ? scriptParagraphs : fallbackStoryParagraphs(chapter, scenes);
      const threadNotes = relatedThreadNotes(plotThreads, chapter);

      return {
        id: chapterId || `chapter_${index + 1}`,
        number: Number(chapter.chapter_number) || index + 1,
        title: chapterTitle(chapter),
        arcTitle: sentence(chapter.arc_title) || sentence(arc.arc_title) || "Current Arc",
        structureBeat: normalizeBeat(chapter.structure_section),
        storyParagraphs: storyParagraphs.length > 0 ? storyParagraphs : ["No story text has been written for this chapter yet."],
        review: {
          characters: namedValues([chapter.characters_present], characterNames).slice(0, 8),
          relationshipMovement: unique(compact([chapter.relationships_used, ...threadNotes])).slice(0, 8),
          threatMovement: unique(compact([chapter.threats_used, chapter.factions_used])).slice(0, 8),
          worldRules: unique(compact([chapter.world_rules_shown, chapter.power_system_shown])).slice(0, 8),
          sceneCoverage: sceneCoverage(scenes),
          openHooks: openHooks(chapter, scenes),
        },
      };
    });

  const arcTitle = sentence(arc.arc_title) || "Current Arc";
  const arcLength = selected(arc.arc_length_type);
  const structure = selected(plotOutline.narrative_structure);
  const arcType = sentence(arc.arc_type);
  const chapterCount = readerChapters.length;

  return {
    title: storyTitle(masterStory, plotOutline),
    arcTitle,
    arcMeta: compact([structure, arcType, arcLength, chapterCount ? `${chapterCount} chapter${chapterCount === 1 ? "" : "s"} planned` : "No chapters planned"]),
    overview: compact([
      arc.arc_summary,
      arc.main_story_question ? `Story question: ${arc.main_story_question}` : "",
      arc.central_emotional_question ? `Emotional question: ${arc.central_emotional_question}` : "",
      arc.main_external_conflict ? `External conflict: ${arc.main_external_conflict}` : "",
      arc.main_internal_conflict ? `Internal conflict: ${arc.main_internal_conflict}` : "",
      arc.ending_type_target ? `Ending target: ${arc.ending_type_target}` : "",
    ]),
    chapters: readerChapters,
    currentDraft,
  };
}
