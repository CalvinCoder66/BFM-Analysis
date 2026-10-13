# BFM-Analysis

This project aims to build an interactive web-based dashboard that bridges the gap between raw War Thunder flight data and practical, real-time Basic Fighter Manoeuvres (BFM) decision-making post-merge. It translates complex Energy-Manoeuvrability theory and turn performance across 1-circle (radius) and 2-circle (rate) fights into intuitive, slider-driven visual comparisons for 4th-generation aircraft.

There are ways to configure aircraft states on both sides. Parameters such as:

- Merge speed
- Altitude
- Fuel and loadout
- Flight path angle relative to the horizontal plane (vertical loop vs flat horizontal turn)
- Turn duration
- G-limiter toggles (War Thunder instructor on/off) and pilot style (yanking vs smooth)

> **Status:** the UI is built and runs against **mock** aircraft data. Replacing it with datamined War Thunder values is the next phase (see [Backend (planned)](#backend-planned)).

New to the jargon? See the [glossary](docs/GLOSSARY.md).

## Justification for development

1. As far as I'm aware, no such tooling exists. Dogfighting is a nerd's game, with physics and matchups being an integral part of understanding required to win. Being a nerd that plays War Thunder, I'd like to know more about the various matchups in different scenarios.
2. The charts that are used to represent data such as sustained turn rates and radius at various airspeeds are extremely difficult to understand for the average person. Not only this, but the data isn't all that useful in isolation. So the proposed solution would give an analysis of 1-circle and 2-circle performance, and how much of a gap a pilot would have against their opponent if they were to choose a 1-circle or 2-circle fight.

## Running locally

### Prerequisites

- [mise](https://mise.jdx.dev/getting-started.html): installs the right tool versions (Bun 1.3, Node 24, Python 3.14, uv) and runs every project task.
- Git.

### First run

```bash
git clone https://github.com/CalvinCoder66/BFM-Analysis.git
cd BFM-Analysis
mise trust          # allow this repo's .mise.toml
mise install        # install Bun, Node, Python and uv at the pinned versions
mise run setup      # install dependencies and the pre-commit hook
mise run dev        # start the dashboard at http://localhost:5173
```

The dev server hot-reloads as you edit files in `apps/frontend/src` or `data/aircraft`.

### Everyday commands

| Command | What it does |
| --- | --- |
| `mise run dev` | Start the Vite dev server |
| `mise run build` | Production build into `apps/frontend/dist` |
| `mise run test` | Unit and component tests (Vitest) |
| `mise run test:e2e` | Browser tests (Playwright) against a production build |
| `mise run check` | Lint, format check and type check, as CI runs them |
| `mise run format` | Auto-format and fix lint issues |
| `mise run data:roster` | Rebuild the aircraft roster ([data/ROSTER.md](data/ROSTER.md)) from the pinned War Thunder datamine |

Before the first `mise run test:e2e`, install the test browser once:

```bash
cd apps/e2e && bunx playwright install chromium
```

Run `mise tasks` to list every task.

## Architecture

```
┌──────────────────────────── Browser (static site) ────────────────────────────┐
│                                                                                │
│  data/aircraft/*.json ──▶ data/ (zod validation) ──▶ physics/ (pure TS maths)  │
│                                                          │                     │
│                                                          ▼                     │
│  scenario/ (sidebar) ──▶ comparison/matchup.ts ──▶ focus/ (hotbar + views)     │
│                                                          │                     │
│                                                          ▼                     │
│                                       charts/ (Plotly figures, turn circles)   │
└────────────────────────────────────────────────────────────────────────────────┘
          ▲
          │  versioned JSON, committed to the repo
┌─────────┴──────────────── Backend (planned) ───────────────────────────────────┐
│  War Thunder datamine ──▶ Python pipeline (parse + validate) ──▶ aircraft JSON │
└────────────────────────────────────────────────────────────────────────────────┘
```

### Frontend (built)

A single-page app with no server: everything is calculated in the browser from versioned JSON.

| Layer | Tech |
| --- | --- |
| UI | React 19, TypeScript, Tailwind CSS 4, built with Vite |
| Charts | Plotly.js (basic bundle) and a hand-drawn 3D SVG (orthographic, drag to orbit) for the turn circles |
| Data | One JSON file per aircraft in `data/aircraft/`, validated with zod when the app loads |
| Tests | Vitest + Testing Library for units and components; Playwright for end-to-end |
| Tooling | mise (versions and tasks), Bun workspaces, Biome (lint and format), GitHub Actions |

How the code in `apps/frontend/src` is organised:

- **`physics/`**: pure TypeScript with no React. It covers the standard atmosphere, table interpolation, the turn-performance model (G limits, turn rate and radius, Ps) and a turn-from-the-merge simulation. Everything is in SI units and covered by unit tests with hand-checked values.
- **`data/`**: loads and validates every aircraft JSON file. Adding an aircraft means adding one file.
- **`features/scenario/`**: the sidebar controls (altitude, merge speed, turn duration, and per-side aircraft, own merge speed (optional override), loadout, fuel, G limiter, pilot style and turn plane).
- **`features/comparison/`**: turns a scenario into a matchup. It works out each side's performance at full pull and as flown, decides who wins each fight, and defines the stats shown.
- **`features/focus/`**: the hotbar and its four views (Summary, 1-circle, 2-circle and Energy). Each view shows only its own charts and key stats, with the rest behind "show more".
- **`features/charts/`**: pure functions that build Plotly figures, the turn-circle geometry, and the thin components that draw them.

### Backend (planned)

The detailed implementation plan is in [docs/plans/backend-pipeline.md](docs/plans/backend-pipeline.md). Scope: Realistic Battles only, covering every fixed-wing aircraft at BR 12.0–14.7 with a unique flight model.

The backend's job is to replace the mock values with real War Thunder flight-model data and keep it up to date as Gaijin patches the game. The frontend stays a static site; the backend produces data rather than serving requests.

**Phase A: data pipeline (next)**

| Concern | Choice | Why |
| --- | --- | --- |
| Language | Python 3.14, managed by [uv](https://docs.astral.sh/uv/) | The datamine community tooling is Python, and it matches our other project; every tool we use supports 3.14 |
| Location | `apps/pipeline/`, run through mise (e.g. `mise run data:update -- --patch <version>`) | Same workflow as the frontend |
| Source | [gszabi99/War-Thunder-Datamine](https://github.com/gszabi99/War-Thunder-Datamine) flight-model files (`gamedata/flightmodels/fm/*.blkx`) for a chosen game patch | The community-standard datamine, already in JSON |
| Parsing and validation | Pydantic v2 models, mirroring the frontend's aircraft schema | Bad or changed datamine fields fail loudly instead of producing wrong charts |
| Output | `data/aircraft/<id>.json` with `source: "datamine"` and the `gamePatch`, committed to git | Every patch's data is reviewable in a diff and reversible |
| Quality | pytest, ruff (lint and format), ty (types), all in CI | Same bar as the frontend |
| Updates | A scheduled GitHub Action that runs the pipeline and opens a PR when a new patch changes the data | Data refreshes go through review |

The pipeline maps datamine fields to our schema: wing panel areas to wing area, `EmptyMass` and `MaxFuelMass0` to masses, `Strength.CritOverload` to the wing-break load, the instructor's `overloadMult`, fly-by-wire limits, lift/drag polars and thrust tables. To keep the Python and TypeScript schemas in sync, the Pydantic models export a JSON Schema and both sides test against the same fixtures.

**Phase B: API (only if needed)**

We'll only add a FastAPI service if a feature needs a server. Examples are comparing performance across game patches, shareable saved scenarios, or community corrections to the data. It would use FastAPI and Pydantic, generate a TypeScript client from its OpenAPI spec, and run in a container. Until then, static JSON is simpler, faster and free to host.

## Project plan & contributing

- The full product plan and phased roadmap live in [docs/PROJECT-PLAN.md](docs/PROJECT-PLAN.md).
- Terms used throughout the project are defined in [docs/GLOSSARY.md](docs/GLOSSARY.md).
- What in-game test flights have shown about the datamine is tracked in
  [docs/FINDINGS.md](docs/FINDINGS.md).
- AI agent guidance (Amp, Claude Code, Copilot, Cursor, Codex) is generated from `.rulesync/` by [rulesync](https://github.com/dyoshikawa/rulesync). Edit `.rulesync/rules/overview.md`, then run `mise run rules:sync`. CI fails if the generated files are out of date.

## Credits

- Flight-model data comes from War Thunder © Gaijin Entertainment, as extracted by the community [War-Thunder-Datamine](https://github.com/gszabi99/War-Thunder-Datamine) project. This project is not affiliated with or endorsed by Gaijin Entertainment.
