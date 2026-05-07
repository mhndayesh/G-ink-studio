Yes — we should **change the frontend experience**. A static sidebar is too boring for this project. This system is basically a **story engine**, so the frontend should feel like a **living manga production studio**, not an admin dashboard.

The backend stays the same. The frontend design changes.

## New frontend concept

Call it:

```text
Manga Studio Flow
```

Instead of a static sidebar, the user moves through a **dynamic animated story pipeline**:

```text
Story Seed → World Core → Cast Forge → Relationship Web → Plot Board → Writing Desk → Consequence Court → Manga Script → Memory Timeline
```

The user should feel like they are building a manga step by step, not filling database forms.

The tech stack still fits:

```text
Next.js + TypeScript
Tailwind + shadcn/ui
Motion for animations
TanStack Query for backend data
Zustand for local UI state
React Hook Form + Zod
React Flow for relationship/map views
Monaco Editor only for advanced JSON view
```

Motion is a good fit here because its React docs focus on production UI animations, layout transitions, gestures, and scroll/exit animations. ([Motion][1]) React Flow fits the relationship and memory graph parts because it is built for node-based editors and interactive diagrams. ([React Flow][2]) TanStack Query fits the backend-heavy app because it manages server-state data fetching, caching, and async state instead of putting official story data into frontend global state. ([TanStack][3])

---

# 1. Main UX idea: animated phase map, not sidebar

Instead of a left sidebar, use a **horizontal animated phase rail** at the top or center.

```text
[ Story Seed ] → [ World Core ] → [ Cast Forge ] → [ Web ] → [ Plot ] → [ Write ] → [ Review ] → [ Script ] → [ Timeline ]
```

Each phase is a big animated card, not a menu item.

Each card shows:

```text
status: locked / ready / in progress / complete
current JSON file
missing items
next action
```

Example:

```text
Cast Forge
Status: In Progress
File: characters.json
Missing: 2 character profiles
Next: Create Main Character 1
```

The user clicks the next glowing card.

This feels much better than a dashboard sidebar.

---

# 2. App shell design

## Top bar

Always visible:

```text
Manga Maker System      v001      template_state      Synced
```

Right side:

```text
Continuity: Clean / Warning
Memory: JSON + SQL + Graph + Vector
Advanced View
```

## Center area

The center changes based on current phase.

## Bottom “Next Step Dock”

Instead of a sidebar, use a bottom dock:

```text
Back        Current Step: Character Personality        Save Draft        Continue
```

This keeps the user moving one small step at a time.

## Background

Use subtle manga-style UI:

```text
soft paper texture
panel borders
speech-bubble helper notes
animated ink-line progress
dark/light mode
```

Not childish. Clean and professional.

---

# 3. Main screen flow

## Screen 1 — Studio Home

This is the landing page for a story.

Use big cards:

```text
Current Version: v001
State: template_state
Current Phase: Story Setup
Next Required Step: Fill Basic Idea
```

Animated “story engine status” cards:

```text
JSON Files: 6/6 ready
Characters: 0 created
Relationship Map: locked
Plot Workspace: not started
Current Chapter Script: draft
Memory Systems: ready
```

Primary button:

```text
Continue Building
```

Secondary buttons:

```text
Open Timeline
Open Developer View
Run Continuity Check
```

This replaces a boring dashboard.

---

# 4. Screen 2 — Story Seed

This handles:

```text
title
basic idea
story type
ending direction
story foundation
```

UX design:

Use **big option cards**.

Example:

```text
What type is your story?

[ Action ] [ Fantasy ] [ Horror ] [ Psychological ]
[ Shonen ] [ School Life ] [ Mystery ] [ Dark Fantasy ]
```

Selected chips animate into a “story DNA” bar:

```text
Story DNA: Shonen + Dark Fantasy + School Life
```

The user does not see `master_story.json`.

Backend:

```text
PATCH /master-story/template
```

File affected:

```text
master_story.json
```

---

# 5. Screen 3 — World Core

This handles:

```text
world type
world master rules
rule details
factions
major/minor threats
```

Design it as **three animated panels**:

```text
World Scale
World Rules
World Pressure
```

## World Scale

Visual cards:

```text
School
City
Kingdom
Planet
Multiverse
Custom
```

## World Rules

Toggle chips:

```text
Magic Exists
Demons Exist
Gods Exist
Power System Exists
No Supernatural Elements
```

When user selects `Magic Exists`, a rule drawer slides open:

```text
Magic Rules
Power Limits
Forbidden Rules
```

## World Pressure

This is threats/factions.

Display like:

```text
Ruling Side        Opposing Side        Hidden Side
[ input ]          [ input ]            [ input ]
```

Major threat card:

```text
What is the big danger?
[ Demon Invasion ] [ World Ending Threat ] [ Hidden Villain Plan ] [ Custom ]
```

Backend:

```text
PATCH /master-story/template
```

File affected:

```text
master_story.json
```

---

# 6. Screen 4 — Cast Forge

This is where `characters.json` becomes visual.

First screen asks:

```text
Who carries the story?
```

Cards:

```text
Single Main Character
Dual Main Characters
Team Main Characters
Family / Bloodline-Based
Location-Based Main Character
Faction-Based Main Character
Custom
```

After selection, animate a **character queue**:

```text
Profiles to create:
[ char_001 Main Character 1 ]
[ char_002 Main Character 2 ]  // only if dual/team/etc.
```

The user clicks each card to fill it.

## Character profile screen

Use a **character sheet with tabs**, but visual:

```text
Identity
Look
Faction
Past
Mind
Personality
Power
Arc
```

Each tab is a card stack.

Example `Look` tab:

```text
Silhouette
Hair
Eyes
Outfit
Color Palette
Iconic Item
AI Image Prompt Notes
```

Example `Arc` tab:

```text
Starting belief
False belief
Truth to learn
Personal goal
How major threat blocks them
Final state
```

Backend:

```text
POST /characters/profiles
PATCH /characters/profiles/{id}
```

File affected:

```text
characters.json
```

Important UI rule:

```text
Relationship Web stays locked until 2 real profiles exist.
```

This matches our correction.

---

# 7. Screen 5 — Relationship Web

This is where React Flow shines.

Use a **node canvas**:

```text
Character nodes = cards
Relationship edges = labeled lines
```

Examples:

```text
Kai —— Friendly Rivals —— Ren
Mira —— Secretly Distrusts —— Ren
Akira —— Mentor & Student —— Kai
```

Click an edge to edit:

```text
Relationship Type
How they met
Current dynamic
Secret A hides
Secret B hides
How it changes
```

Also keep a table view for precision.

Views:

```text
Graph View
Table View
Timeline View
```

Backend:

```text
POST /characters/relationships
PATCH /characters/relationships/{relationship_id}
```

File affected:

```text
characters.json.character_relationship_map
```

State rule:

```text
If created_major_character_profiles.length < 2:
  show locked screen
```

Locked message:

```text
Create at least 2 major characters before building relationship web.
```

---

# 8. Screen 6 — Plot Board

This edits official `plot_outline.json`.

Make it look like a **manga corkboard / beat board**.

Sections:

```text
Narrative Structure
Arc Overview
Chapter Cards
Scene Cards
Plot Threads
```

## Narrative Structure Selector

Big cards:

```text
Kishotenketsu
Three-Act
Hero’s Journey
Shonen Arc
Mystery Arc
Tournament Arc
Hybrid
```

When selected, the correct form appears.

If Kishotenketsu:

```text
Ki → Sho → Ten → Ketsu
```

Animated four-panel layout.

If conflict-driven:

```text
Act 1 → Act 2 → Act 3
```

## Chapter Cards

Cards like:

```text
Chapter 1
Purpose:
Characters:
Threat:
Ending Hook:
```

Drag-and-drop optional later.

Backend:

```text
PATCH /plot-outline/narrative-structure
PATCH /plot-outline/arc-overview
POST /plot-outline/chapters
POST /plot-outline/scenes
```

File affected:

```text
plot_outline.json
```

---

# 9. Screen 7 — Writing Desk

This is the heart.

It edits `plot_workspace.json`.

Design it like a writing studio.

Layout:

```text
Left: Story Context Drawer
Center: Free Writing Desk
Right: AI Assistant / Change Detector
Bottom: Review Dock
```

## Center

A large beautiful editor:

```text
Write what happens next...
```

Controls:

```text
[ ] AI Completion / Expand Writing
Expansion Mode: Light / Medium / Heavy / Manga Visual / Dialogue / Emotion / Action
[ Expand ]
[ Analyze Consequences ]
```

User writes freely.

Example:

```text
Kai fights Ren. Ren badly injures Kai. Mira later discovers Ren was a spy.
```

If AI Completion toggle is on:

```text
AI expands text
User can Accept / Edit / Reject
```

Then mandatory analysis runs.

## Right panel — Change Detector

Animated cards appear:

```text
Detected: Kai is injured
Needs decision

Detected: Ren attacked Kai
Relationship impact likely

Detected: Ren may be spy
Needs decision
```

Each card has status:

```text
pending / answered / ignored / approved
```

Backend:

```text
PATCH /plot-workspace/{id}/free-writing
POST /plot-workspace/{id}/ai-complete
POST /plot-workspace/{id}/analyze
```

File affected:

```text
plot_workspace.json
```

---

# 10. Screen 8 — Consequence Court

This is more interesting than “review page.”

Call it:

```text
Consequence Court
```

The system presents each detected consequence like a case.

Example card:

```text
Case 1: Serious Injury

Evidence:
“Kai was badly injured.”

Question:
What happens to Kai?

Choices:
[ Heals Quickly ]
[ Heals Slowly ]
[ Loses Power Temporarily ]
[ Dies ]
[ Custom ]
```

Another:

```text
Case 2: Spy Reveal

Evidence:
“Ren was a spy.”

Question:
Was Ren always a spy?

Choices:
[ Spy From Beginning ]
[ Changed Sides Now ]
[ Forced To Spy ]
[ Double Agent ]
[ Custom ]
```

After all cases are answered, show final verdict:

```text
Official changes to apply:
- Kai becomes seriously injured.
- Kai loses right-arm power temporarily for 3 chapters.
- Ren is marked as enemy spy.
- Kai/Ren trust decreases.
- v002 will be created.
```

Buttons:

```text
Approve All
Edit Specific Case
Reject All
Back to Writing
```

Backend:

```text
GET /plot-workspace/{id}/questions
POST /plot-workspace/{id}/questions/{qid}/answer
GET /plot-workspace/{id}/confirmation
POST /plot-workspace/{id}/approve
```

This is much more user-friendly and dramatic.

---

# 11. Screen 9 — Manga Script Studio

This edits `chapter_script.json`.

Design as a **page/panel builder**, not a form.

Views:

```text
Scene View
Page View
Panel View
Dialogue View
```

## Page board

Show pages as cards:

```text
Page 1
[ Panel 1 ][ Panel 2 ]
[ Panel 3 large ]
```

Click panel:

```text
Visual
Camera Shot
Action
Dialogue
SFX
Mood
Continuity Notes
```

Use compact panel cards:

```text
Panel 1 — Wide Shot
Visual: Academy courtyard at sunset...
Dialogue: Kai: “Something feels wrong.”
SFX: WHOOSH
```

Backend:

```text
POST /chapters/{chapter_id}/script/generate
PATCH /chapters/{chapter_id}/script
POST /chapters/{chapter_id}/script/approve
```

File affected:

```text
chapter_script.json
```

---

# 12. Screen 10 — Memory Timeline

This replaces boring version history.

Display versions as an animated timeline:

```text
v001 — Story setup
v002 — Chapter 1 approved
v003 — Kai injured / Ren spy reveal
v004 — Demon gate opened
```

Each version expands:

```text
Files:
master_story.json
characters.json
plot_outline.json
memory_system.json

Events:
CHARACTER_INJURED
RELATIONSHIP_TRUST_CHANGED
CHARACTER_ALLEGIANCE_CHANGED

Systems updated:
PostgreSQL ✓
Neo4j ✓
Qdrant ✓
Continuity ✓
```

Buttons:

```text
Compare with previous
View event log
View JSON snapshot
View graph impact
```

Backend:

```text
GET /versions
GET /versions/{version_id}
GET /versions/{version_id}/manifest
```

---

# 13. Screen 11 — Continuity Radar

Make continuity visual.

Instead of just list:

```text
Continuity Radar
```

Sections:

```text
Character State
Relationship Logic
World Rules
Faction Logic
Power Rules
Timeline
Version Sync
```

Each has status:

```text
Clean
Warning
Broken
Needs Review
```

Example:

```text
Character State: Warning
Kai is marked injured but used full power in Chapter 3.
```

Actions:

```text
Fix with AI
Create explanation event
Mark as flashback
Ignore for now
```

Backend:

```text
POST /continuity/check-workspace
POST /continuity/check-script
POST /continuity/check-version-candidate
GET /continuity/reports
```

---

# 14. Screen 12 — Advanced Control Room

For developers only.

Tabs:

```text
JSON Snapshots
Event Store
Graph DB Preview
Vector Memory Chunks
Raw API Logs
Validation Reports
```

Raw JSON viewer:

```text
master_story.json
characters.json
plot_outline.json
memory_system.json
plot_workspace.json
chapter_script.json
```

Use Monaco.

Rules:

```text
Read-only by default
Unlock edit with confirmation
Cannot edit frozen versions
Validate before save
```

---

# 15. New route structure

Use routes that match the experience:

```text
app/
  page.tsx

  studio/
    page.tsx

  studio/[storyId]/
    layout.tsx
    home/page.tsx
    seed/page.tsx
    world/page.tsx
    cast/page.tsx
    web/page.tsx
    board/page.tsx
    desk/page.tsx
    court/page.tsx
    script/page.tsx
    timeline/page.tsx
    radar/page.tsx
    control/page.tsx
```

Better than:

```text
/setup
/characters
/plot
```

Because this project should feel like a studio.

---

# 16. Component design

```text
components/
  studio-shell/
    StudioShell.tsx
    PhaseRail.tsx
    BottomStepDock.tsx
    VersionStatusPill.tsx
    ContinuityPill.tsx
    FileSyncIndicator.tsx

  motion/
    PageTransition.tsx
    StepCard.tsx
    AnimatedPanel.tsx
    InkReveal.tsx

  seed/
    StorySeedWizard.tsx
    StoryTypeChips.tsx
    EndingDirectionCards.tsx
    FoundationSelector.tsx

  world/
    WorldScaleSelector.tsx
    WorldRuleGrid.tsx
    RuleDetailDrawer.tsx
    FactionBoard.tsx
    ThreatBuilder.tsx

  cast/
    CastStructureSelector.tsx
    CharacterQueueRail.tsx
    CharacterSheet.tsx
    AppearanceSheet.tsx
    PowerSheet.tsx
    ArcThreatSheet.tsx

  web/
    RelationshipCanvas.tsx
    RelationshipEdgeEditor.tsx
    RelationshipTable.tsx
    LockedRelationshipState.tsx

  board/
    NarrativeStructureCards.tsx
    KishotenketsuBoard.tsx
    ConflictArcBoard.tsx
    ChapterCardBoard.tsx
    SceneCardBoard.tsx
    PlotThreadPanel.tsx

  desk/
    FreeWritingDesk.tsx
    AICompletionToggle.tsx
    ExpansionPreview.tsx
    DetectedChangeRail.tsx
    ContextDrawer.tsx

  court/
    ConsequenceCaseCard.tsx
    ConsequenceChoiceGrid.tsx
    FinalVerdictPanel.tsx

  script/
    MangaPageBoard.tsx
    MangaPanelCard.tsx
    PanelInspector.tsx
    DialogueBubbleEditor.tsx
    SFXEditor.tsx

  timeline/
    VersionTimeline.tsx
    EventImpactCard.tsx
    VersionComparePanel.tsx

  radar/
    ContinuityRadar.tsx
    ContinuityIssueCard.tsx
```

---

# 17. Animation rules

Animations should help, not annoy.

Use Motion for:

```text
page transitions
phase rail progress
card enter/exit
detected event cards appearing
relationship graph edge highlight
version timeline expansion
final confirmation reveal
```

Do not animate:

```text
large text editor typing
every form field
raw JSON editor
```

Good animation examples:

```text
When user completes Story Seed:
World Core card glows and unlocks.

When relationship map unlocks:
nodes animate into view.

When event is detected:
case card slides into Consequence Court.

When approval happens:
version timeline creates v002 node.
```

---

# 18. Frontend state rules

## Server state

Use TanStack Query for:

```text
current story
current version
current files
workspace
questions
confirmation
chapter script
versions
continuity reports
```

## Local UI state

Use Zustand for:

```text
active phase
drawer open/closed
selected character card
selected relationship edge
selected panel
animation preferences
```

Never put official story state in Zustand.

---

# 19. Exact frontend flow

```text
Studio Home
↓
Story Seed
↓
World Core
↓
Cast Forge
↓
Relationship Web
↓
Plot Board
↓
Writing Desk
↓
Consequence Court
↓
Manga Script Studio
↓
Memory Timeline
↓
Continuity Radar
```

But the user can jump around only if the phase is unlocked.

Unlock rules:

```text
Story Seed → always unlocked
World Core → after title/basic idea
Cast Forge → after master story basic setup
Relationship Web → after 2 major character profiles
Plot Board → after character phase minimum complete
Writing Desk → after plot outline has at least one chapter target
Consequence Court → after detected events/questions exist
Manga Script Studio → after scene cards or workspace approval
Timeline → always visible
Radar → always visible after story created
Control Room → advanced only
```

---

# 20. Key UX: user writes freely, system handles logic

The most important user experience:

```text
The user writes:
“Kai fights Ren. Ren badly injures Kai. Mira discovers Ren was a spy.”

The frontend shows:
- AI Completion optional
- Detected consequences
- Necessary questions
- Final official changes
- Approve version update
```

The user should never think:

```text
I need to update characters.json and relationship map manually.
```

The frontend should say:

```text
I found story consequences. Choose what becomes official.
```

---

# Final recommendation

Use this frontend identity:

```text
Manga Studio Flow
```

Not a sidebar admin app.

Use dynamic pages:

```text
Story Seed
World Core
Cast Forge
Relationship Web
Plot Board
Writing Desk
Consequence Court
Manga Script Studio
Memory Timeline
Continuity Radar
Advanced Control Room
```

The frontend should feel like an animated production workflow, while the backend stays strict:

```text
LLM proposes
backend validates
user confirms
events save
versions update
graph/vector/sql sync
```

That is the best experience for this project.

[1]: https://motion.dev/docs/react?utm_source=chatgpt.com "Get started - React Animation Library - Motion.dev"
[2]: https://reactflow.dev/?utm_source=chatgpt.com "React Flow: Node-Based UIs in React"
[3]: https://tanstack.com/query/latest/docs/framework/react/overview?utm_source=chatgpt.com "Overview | TanStack Query React Docs"
