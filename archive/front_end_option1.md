Yes. The frontend must be built around your backend and your six JSON files, not around generic “write a story” screens.

Best frontend stack:

```text
Next.js App Router
React
TypeScript
Tailwind CSS
shadcn/ui
TanStack Query
Zustand
React Hook Form + Zod
Monaco Editor, optional for JSON/debug view
React Flow, optional for relationship/graph map
```

Next.js App Router is a good fit because it uses file-based routing with modern React features like Server Components and Suspense. ([Next.js][1]) Tailwind is good for fast custom UI because it is utility-first. ([Tailwind CSS][2]) shadcn/ui gives you accessible, customizable components instead of locking you into a rigid component library. ([Shadcn UI][3]) TanStack Query should handle backend data fetching/caching because your app is mostly server-state: versions, JSON files, workspace state, questions, scripts, and events. ([TanStack][4])

# Frontend goal

The frontend should make the system feel simple:

```text
User sees:
“Write your idea”
“Choose story type”
“Create character”
“Write what happens next”
“Approve changes”

System handles:
JSON files
events
versions
graph DB
vector DB
continuity
patches
```

Do **not** show raw JSON to normal users unless they open “Advanced / Developer View.”

# Main UX structure

Use a left sidebar with phases:

```text
1. Dashboard
2. Story Setup
3. Characters
4. Relationship Map
5. Plot Outline
6. Writing Workspace
7. Chapter Script
8. Consequence Review
9. Versions & Memory
10. Settings / Developer View
```

The user should always know:

```text
Current story
Current version
Current phase
What is missing
What to do next
```

Top bar:

```text
Story: Manga Maker System
Version: v001
State: template_state
Current file set: synced
Continuity: clean / warnings
```

# Page 1 — Dashboard

Purpose: show project status, not editing.

Cards:

```text
Story Setup: incomplete / complete
Characters: incomplete / complete
Relationship Map: locked / ready / complete
Plot Outline: not started / active
Current Workspace: free writing
Current Chapter Script: draft
Current Version: v001
```

Buttons:

```text
Continue Setup
Go to Writing Workspace
View Version History
Run Continuity Check
```

Backend calls:

```text
GET /stories/{story_id}/status
GET /stories/{story_id}/current-version
GET /stories/{story_id}/files/current
```

# Page 2 — Story Setup Wizard

This edits `master_story.json`.

Make it step-by-step:

```text
Step 1: Title
Step 2: Basic Idea
Step 3: Story Type / Genre
Step 4: Ending Direction
Step 5: Story Foundation
Step 6: World Type
Step 7: World Master Rules
Step 8: Factions / Ruling Sides
Step 9: Major + Minor Threats
```

UI components:

```text
Text input
Textarea
Multi-select chips
Single-select cards
Custom field
Next / Back buttons
Progress bar
```

Important: do **not** show all JSON branches at once. That will overwhelm the user.

Example screen:

```text
World Master Rules

[ ] Magic Exists
[ ] Superpowers Exist
[ ] Demons Exist
[ ] Monsters Exist
[ ] Gods Exist
[ ] Advanced Technology Exists
[ ] No Supernatural Elements
[ ] Custom

Details:
Magic rules: [textarea]
Power limits: [textarea]
Custom rule details: [textarea]
```

Backend calls:

```text
GET /stories/{story_id}/master-story
PATCH /stories/{story_id}/master-story/template
POST /stories/{story_id}/master-story/validate
```

# Page 3 — Character Builder

This edits `characters.json`.

The page should be split into three panels:

```text
Left: Character structure / queue
Center: Current character form
Right: Preview card
```

Flow:

```text
1. Choose main character structure
2. Backend creates profile queue
3. User fills each major profile
4. Relationship map unlocks only after 2 real profiles
```

Important correction from the audit:

```text
Relationship map starts disabled.
Do not show relationship editor until created_major_character_profiles.length >= 2.
```

Character sections as tabs:

```text
Identity
Appearance
Faction Alignment
Backstory
Mental State
Community Place
Personality
Powers, optional
Arc & Threat Connection
```

UI behavior:

If world rules include no supernatural:

```text
Powers tab = disabled unless user enables manually/custom
```

If world rules include magic/powers:

```text
Powers tab = optional but available
```

Backend calls:

```text
GET /stories/{story_id}/characters
PATCH /stories/{story_id}/characters/structure
POST /stories/{story_id}/characters/profiles
PATCH /stories/{story_id}/characters/profiles/{character_id}
POST /stories/{story_id}/characters/relationship-map/activate
```

# Page 4 — Relationship Map

This page unlocks after at least two created major character profiles.

Use two views:

```text
Table view
Graph view
```

Table view:

```text
Character A | Relationship Type | Character B | Trust | Conflict | Change Arc
```

Graph view:

```text
Nodes = characters
Edges = relationship type
Edge color/status = friend/rival/enemy/family/etc.
```

Use React Flow for graph if you want visual nodes. Keep table as the main reliable editor.

Backend calls:

```text
GET /stories/{story_id}/characters
POST /stories/{story_id}/characters/relationships
PATCH /stories/{story_id}/characters/relationships/{relationship_id}
```

UX rule:

```text
No fake placeholder relationships.
Only real profiles can be selected.
```

# Page 5 — Plot Outline

This edits official `plot_outline.json`.

This is **not** the free writing screen.

Sections:

```text
Story Start Workflow
Narrative Structure
Arc Overview
Kishotenketsu Outline
Conflict-Driven Outline
Chapter List
Scene Cards
Plot Threads
Continuity Checks
```

Smart UI:

If user selects `Kishotenketsu`:

```text
Show Ki / Sho / Ten / Ketsu form
Hide conflict-driven form unless Hybrid
```

If user selects `Three-Act`, `Shonen`, `War`, etc.:

```text
Show Act 1 / Act 2 / Act 3 form
```

Backend calls:

```text
GET /stories/{story_id}/plot-outline
PATCH /stories/{story_id}/plot-outline/story-start-workflow
PATCH /stories/{story_id}/plot-outline/narrative-structure
PATCH /stories/{story_id}/plot-outline/arc-overview
POST /stories/{story_id}/plot-outline/chapters
POST /stories/{story_id}/plot-outline/scenes
```

# Page 6 — Writing Workspace

This is the most important UX page.

It edits `plot_workspace.json`.

Layout:

```text
Left: Current context
Center: Free writing editor
Right: AI/analysis panel
Bottom: Detected changes / questions
```

Center editor:

```text
Write what happens next...
[large free text box]
```

Controls:

```text
[ ] AI Completion / Expand Writing
Expansion mode: Light / Medium / Heavy / Add Manga Visual Detail / Add Dialogue
Button: Expand
Button: Analyze Consequences
```

Mandatory rule:

```text
AI expansion optional.
Consequence detection mandatory.
Confirmation mandatory.
```

Workflow on screen:

```text
1. User writes
2. Optional AI expands
3. User accepts/rejects expanded text
4. Analyze consequences
5. Show detected events
6. Ask follow-up questions
7. Build final confirmation
8. Approve official changes
```

Detected event cards:

```text
Possible event: CHARACTER_INJURED
Evidence: “Kai was badly injured”
Needs decision: yes
Question: What should happen?
Options:
- Heals quickly
- Heals slowly
- Loses power temporarily
- Dies
- Custom
```

Buttons:

```text
Apply
Ignore
Custom Edit
Ask Later
```

Backend calls:

```text
POST /stories/{story_id}/plot-workspace
PATCH /stories/{story_id}/plot-workspace/{workspace_id}/free-writing
POST /stories/{story_id}/plot-workspace/{workspace_id}/ai-complete
POST /stories/{story_id}/plot-workspace/{workspace_id}/analyze
GET /stories/{story_id}/plot-workspace/{workspace_id}/questions
POST /stories/{story_id}/plot-workspace/{workspace_id}/questions/{question_id}/answer
GET /stories/{story_id}/plot-workspace/{workspace_id}/confirmation
POST /stories/{story_id}/plot-workspace/{workspace_id}/approve
```

This is the user’s main creative space.

# Page 7 — Consequence Review

This can be a separate page or a modal from Writing Workspace.

Show four sections:

```text
Detected Changes
User Decisions
Proposed Official Events
Proposed JSON Patches
```

Keep it understandable:

Instead of showing raw patch first, show plain English:

```text
Kai will be marked as seriously injured.
Kai will temporarily lose his right-arm power for 3 chapters.
Ren will be marked as spy/revealed enemy-aligned.
Kai and Ren relationship trust will decrease.
A new version bundle v002 will be created.
```

Advanced dropdown:

```text
Show raw events
Show raw JSON patches
Show graph updates
Show vector chunks
```

Final buttons:

```text
Approve All
Reject All
Edit Specific Change
Go Back To Questions
```

Backend calls:

```text
GET /stories/{story_id}/plot-workspace/{workspace_id}/confirmation
POST /stories/{story_id}/plot-workspace/{workspace_id}/approve
POST /stories/{story_id}/plot-workspace/{workspace_id}/reject
```

# Page 8 — Chapter Script Editor

This edits `chapter_script.json`.

Layout:

```text
Left: Scene list
Center: Page/panel editor
Right: Context and continuity
```

Script structure:

```text
Chapter
  Scenes
    Pages
      Panels
        Visual
        Action
        Dialogue
        SFX
        Narration
        Mood
```

Panel editor should have fields:

```text
Panel size
Camera shot
Visual
Character action
Background details
Dialogue
SFX
Mood
Continuity notes
```

Do not make the user write raw JSON.

Show manga preview as cards:

```text
Page 1
Panel 1 — Wide shot
Visual: ...
Dialogue: ...
SFX: ...
```

Backend calls:

```text
POST /stories/{story_id}/chapters/{chapter_id}/script/generate
GET /stories/{story_id}/chapters/{chapter_id}/script
PATCH /stories/{story_id}/chapters/{chapter_id}/script
POST /stories/{story_id}/chapters/{chapter_id}/script/extract-events
POST /stories/{story_id}/chapters/{chapter_id}/script/approve
```

# Page 9 — Version History & Memory

This page is for trust.

Show:

```text
v001 — template_state
v002 — after Chapter 1
v003 — after Arc 1
```

Each version card:

```text
Version ID
Created from events
Files included
Continuity status
View snapshots
Compare to previous version
```

Buttons:

```text
Open version
Compare with previous
View events
View continuity report
```

Backend calls:

```text
GET /stories/{story_id}/versions
GET /stories/{story_id}/versions/{version_id}
GET /stories/{story_id}/versions/{version_id}/manifest
```

Advanced views:

```text
Graph memory
Vector memory chunks
Event log
JSON snapshots
```

# Page 10 — Continuity Dashboard

Show warnings clearly:

```text
High severity:
- Akira is marked dead but appears alive in Chapter 4.

Medium:
- City A was destroyed but listed as active location.

Low:
- Relationship tension changed but relationship map not updated.
```

Buttons:

```text
Fix with AI
Mark as intentional
Create event to explain
Ignore for now
```

Backend calls:

```text
POST /stories/{story_id}/continuity/check-workspace
POST /stories/{story_id}/continuity/check-script
POST /stories/{story_id}/continuity/check-version-candidate
GET /stories/{story_id}/continuity/reports
```

# Page 11 — Developer / JSON View

Hidden under advanced mode.

Show tabs:

```text
master_story.json
characters.json
plot_outline.json
memory_system.json
plot_workspace.json
chapter_script.json
```

Use Monaco Editor for raw JSON viewing/editing, but normal users should not need it.

Rules:

```text
Read-only by default
Edit requires advanced unlock
Validate before save
Never edit frozen versions
```

# Frontend routes

Use this route structure:

```text
app/
  page.tsx

  stories/
    page.tsx
    new/page.tsx

  stories/[storyId]/
    layout.tsx
    dashboard/page.tsx
    setup/page.tsx
    characters/page.tsx
    relationships/page.tsx
    plot/page.tsx
    workspace/page.tsx
    review/page.tsx
    script/page.tsx
    versions/page.tsx
    continuity/page.tsx
    developer/page.tsx
```

# Frontend component structure

```text
components/
  layout/
    AppShell.tsx
    Sidebar.tsx
    Topbar.tsx
    VersionBadge.tsx
    StateTypeBadge.tsx

  story/
    StoryStatusCards.tsx
    SetupWizard.tsx
    OptionCardGrid.tsx
    CustomField.tsx

  characters/
    CharacterStructureSelector.tsx
    CharacterQueue.tsx
    CharacterProfileForm.tsx
    AppearanceForm.tsx
    FactionAlignmentForm.tsx
    BackstoryForm.tsx
    PersonalityForm.tsx
    PowersForm.tsx
    ArcThreatForm.tsx

  relationships/
    RelationshipTable.tsx
    RelationshipGraph.tsx
    RelationshipEditor.tsx

  plot/
    NarrativeStructureSelector.tsx
    ArcOverviewForm.tsx
    KishotenketsuForm.tsx
    ConflictDrivenForm.tsx
    ChapterListEditor.tsx
    SceneCardEditor.tsx

  workspace/
    FreeWritingEditor.tsx
    AICompletionPanel.tsx
    DetectedEventCard.tsx
    ConsequenceQuestionCard.tsx
    FinalConfirmationPanel.tsx

  script/
    ChapterScriptEditor.tsx
    SceneList.tsx
    PageEditor.tsx
    PanelEditor.tsx
    DialogueEditor.tsx

  memory/
    VersionTimeline.tsx
    EventLog.tsx
    ContinuityReport.tsx
    JsonSnapshotViewer.tsx
```

# Frontend state design

Use TanStack Query for backend data:

```text
story status
current JSON files
workspace
questions
confirmation
chapter script
versions
continuity reports
```

Use Zustand only for local UI state:

```text
sidebar open
active tab
draft unsaved UI state
modal state
selected node in graph
```

Do not store official story state in Zustand. Official state lives in backend.

# UX rules

## Rule 1 — Never show everything at once

Each phase should show one step or one form section.

Bad:

```text
Huge JSON form with 300 fields
```

Good:

```text
Step 1: Choose story type
Step 2: Choose world scale
Step 3: Choose rules
```

## Rule 2 — Always show “why this matters”

Small helper text under important fields:

```text
Major threat tells the system what danger pushes the plot.
Relationship map helps dialogue and scene tension.
Power limits prevent broken overpowered characters.
```

## Rule 3 — Use locked/unlocked states

Example:

```text
Relationship Map: locked
Reason: Create at least 2 major characters first.
```

## Rule 4 — Keep JSON hidden

Normal user sees:

```text
Kai is injured.
Ren is revealed as a spy.
Create version v002?
```

Advanced user can open raw JSON.

## Rule 5 — Every official change needs confirmation

Before backend writes official events:

```text
Here are the changes I will apply.
Approve?
```

# MVP frontend build order

Build in this exact order:

```text
1. App shell: sidebar, topbar, version badge
2. Dashboard
3. Story Setup Wizard
4. Character Builder
5. Relationship Map locked/unlocked logic
6. Plot Outline page
7. Writing Workspace
8. Consequence Review
9. Chapter Script Editor
10. Version History
11. Continuity Dashboard
12. Developer JSON View
```

Do not start with fancy graph visuals. Start with the writing workspace and approval flow.

# Most important screen: Writing Workspace

This screen must feel like:

```text
“Write freely. I’ll help you detect what changes.”
```

Minimal layout:

```text
------------------------------------------------
Topbar: Story | Version | State | Continuity
------------------------------------------------
Left: Context
- Current arc
- Current chapter
- Main characters
- Active threats

Center:
[ Free writing textarea ]

[ ] AI Completion / Expand Writing
Expansion mode: Light / Medium / Heavy
[Analyze Consequences]

Right:
Detected changes
Questions
Warnings

Bottom:
Final confirmation panel
------------------------------------------------
```

This is the heart of the product.

# Final frontend answer

Your frontend should be:

```text
Next.js + TypeScript + Tailwind + shadcn/ui
TanStack Query for backend data
Zustand for local UI only
React Hook Form + Zod for forms
React Flow for relationship/graph view
Monaco Editor for advanced JSON view
```

And the app flow should be:

```text
Dashboard
→ Story Setup
→ Character Builder
→ Relationship Map
→ Plot Outline
→ Writing Workspace
→ Consequence Review
→ Chapter Script
→ Version History / Continuity
```

That frontend fits the backend exactly. It keeps the user experience simple while the backend handles the heavy memory system.

[1]: https://nextjs.org/docs/app?utm_source=chatgpt.com "Next.js Docs: App Router"
[2]: https://tailwindcss.com/?utm_source=chatgpt.com "Tailwind CSS - Rapidly build modern websites without ever ..."
[3]: https://ui.shadcn.com/docs?utm_source=chatgpt.com "Introduction - Shadcn UI"
[4]: https://tanstack.com/query/latest/docs/framework/react/overview?utm_source=chatgpt.com "Overview | TanStack Query React Docs"
