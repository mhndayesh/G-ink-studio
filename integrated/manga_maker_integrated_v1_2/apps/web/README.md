# Manga Maker Frontend — Studio Flow v1.3

This is the frontend for the Manga Maker System, designed around the backend story-state engine.

## What this includes

- Next.js App Router + React 19 + TypeScript
- Tailwind CSS + `cn()` utility (`clsx` + `tailwind-merge`)
- TanStack React Query (API client)
- Zustand (studio store)
- Framer Motion (page transitions)
- Lucide React (icons)
- react-force-graph-2d (relationship graph)

### 15 Screens (6 Stages)

- **Foundation**: Studio Home, Story Seed, World Core
- **Characters**: Cast Forge (7-tab ProfileTabs, 150+ fields), Side Cast (auto-ID), Relationship Web (force-directed graph)
- **Plot**: Plot Board (structure, arc, chapters), Scene Cards, Plot Threads (5 tabs)
- **Write**: Writing Desk (free writing, AI expansion, priority, intent notes, protected sections), Consequence Court (Q&A, approve)
- **Produce**: Manga Script Studio (edit mode, panels, dialogue, SFX)
- **Review**: Memory Timeline, Continuity Radar, Control Room

## Backend expected

Use Backend Foundation v1.3 or newer.

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_MANGA_USER_ID=dev_user
NEXT_PUBLIC_MANGA_API_KEY=
```

## Run

```bash
npm install
npm run dev
```

## Key Components

| Component | Purpose |
|-----------|---------|
| StudioShell | Stage-grouped nav bar with status pills |
| NextStep | Prev/next footer with stage dots |
| ProfileTabs | 7-tab character editor (150+ fields) |
| RelationshipGraph | D3 force graph with edge coloring |
| AiFillPanel | Field-level AI generation |
| Panel, Field, OptionGrid, CustomInput | Reusable UI |

## API Client

39 methods in `lib/api.ts`, mapping 1:1 to backend routes.
