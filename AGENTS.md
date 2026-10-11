# BFM Analysis

Interactive web dashboard that turns War Thunder flight-model data into practical Basic Fighter
Manoeuvres (BFM) decisions for 4th-generation jets. It compares two aircraft (attacker vs.
defender) across 1-circle (radius) and 2-circle (rate) fights using Energy-Manoeuvrability (E-M)
theory, driven by sliders for altitude, fuel/loadout, airspeed, flight path angle, turn duration,
and G-limiter state.

Built by Calvin Cheung as a portfolio/learning project. The full plan lives in
`docs/PROJECT-PLAN.md`; read it before starting a new phase.

## Current Status

**UI design complete (phases 1–3 and the phase 4 HUD polish); the data is still mock.** The dashboard has
scenario controls (altitude, merge speed, turn duration; per side aircraft, loadout, fuel,
G limiter, pilot style, turn plane), and a **hotbar** of four focus views: Summary (who wins
each fight, E-M diagram), 1-circle, 2-circle and Energy. Each view shows only its own charts and
a few key stats, with the rest behind "show more". Keep it that way: add new stats to a focus view's
`more` list rather than to the always-visible ones. What remains is phase 4's real data, which means
replacing mock JSON with datamined values. The app is built in phases:

1. **Foundation & mock data** — React + Tailwind dashboard, charting library, 2–3 hardcoded
   matchups (e.g. F-16C vs. MiG-29) with mock E-M curves in JSON.
2. **Interactive controls** — sliders for altitude, speed, and loadout; TypeScript interpolation
   layer that shifts the curves.
3. **1-circle vs. 2-circle visualiser** — scorecards, turn-circle graphics, flight path angle and
   G-limiter modifiers.
4. **Real data** — replace mock values with community datamine data; dark-mode aviation HUD
   polish. HUD styling lives in `styles.css` (`.hud-panel`, background grid).

UI-first: build the layout and interactions against mock data before any data pipeline.

When you scaffold or restructure the project, update the structure, commands, and stack sections
below in the same change.

## Repository Structure

```
BFM-Analysis/
├── apps/
│   ├── frontend/              # React + Vite + Tailwind dashboard
│   │   ├── src/
│   │   │   ├── app.tsx        # Root component
│   │   │   ├── data/          # Aircraft JSON loader + zod schema (validated at load)
│   │   │   ├── features/
│   │   │   │   ├── scenario/   # Sidebar: altitude, merge speed, unit, per-side aircraft/loadout/fuel
│   │   │   │   ├── comparison/ # matchup.ts (pure: computeMatchup, verdicts), metrics.ts, StatsPanel
│   │   │   │   ├── focus/      # focus.ts (focus views: charts + stats), Hotbar, FocusView
│   │   │   │   └── charts/     # series.ts (Plotly figures), circles.ts (merge geometry), ChartArea
│   │   │   ├── physics/       # Pure TS: ISA atmosphere, interpolation, performance model, turn timeline
│   │   │   ├── shared/        # format.ts (display units), ui/ (Slider, Segmented)
│   │   │   └── test/          # Vitest setup + shared scenario fixtures (sideConfig, testScenario)
│   │   └── vite.config.ts     # Vite + Vitest config
│   └── e2e/                   # Playwright tests against the production build
├── data/aircraft/             # Version-controlled aircraft performance JSON (one file per aircraft)
├── docs/
│   └── PROJECT-PLAN.md        # Product plan, feature blueprint, phased roadmap
├── .rulesync/                 # AI config source of truth → generates AGENTS.md, CLAUDE.md, etc.
│   ├── rules/overview.md      # This file
│   └── mcp.json               # MCP servers shared by all agents
├── .amp/
│   ├── settings.json          # Amp workspace settings; rulesync owns `amp.mcpServers`
│   ├── services.yaml          # Dev server definition for Amp orbs (`amp orb services ensure`)
│   └── plugins/               # Amp plugins; rulesync-hooks.ts is generated from .rulesync/hooks.json
├── .githooks/                 # Pre-commit hook (lint-staged: biome)
├── scripts/                   # Repo maintenance scripts
├── biome.json                 # JS/TS/CSS/JSON lint + format config
├── package.json               # Bun workspace root (apps/*)
└── .mise.toml                 # Tool versions + tasks
```

## Essential Commands

All commands are run via [mise](https://mise.jdx.dev/) from the repo root:

```bash
# Setup & development
mise run setup              # Install dependencies (bun) + git hooks
mise run dev                # Vite dev server for the frontend
mise run build              # Production build of the frontend

# Quality
mise run format             # Format + auto-fix (biome)
mise run check              # Lint, format check, type check (read-only, for CI)
mise run typecheck          # Type check only (subset of check)
mise run test               # Unit + component tests (vitest)
mise run test:watch         # Vitest in watch mode
mise run test:e2e           # Playwright e2e tests (builds + previews the app)

# AI config
mise run rules:sync         # Regenerate AI config files from .rulesync/
mise run rules:check        # Verify AI config files are in sync (CI)
```

In an Amp orb, run `amp orb services ensure` to start the dev server from `.amp/services.yaml`
and get a portal URL.

## Stack

| Layer     | Tech                                                  |
| --------- | ----------------------------------------------------- |
| Frontend  | React 19 + Vite 8 + TypeScript 7 + Tailwind CSS 4     |
| Charts    | Plotly.js basic bundle via a thin `PlotlyChart` wrapper |
| Physics   | Pure TypeScript module (interpolation, E-M maths)     |
| Data      | Version-controlled JSON validated with zod; Python datamine parser later |
| Tests     | Vitest + Testing Library (jsdom); Playwright (e2e)    |
| Lint      | Biome                                                 |
| Tooling   | mise + bun workspaces                                 |
| CI        | GitHub Actions                                        |

## Physics Model

`apps/frontend/src/physics/performance.ts` is an algebraic, quasi-steady point-performance model:

- Inputs per aircraft (`data/aircraft/*.json`): wing area, empty mass, internal fuel, G limits,
  placard limits (max IAS, max Mach), Mach tables for CLmax / CD0 / k, an altitude × Mach
  afterburner thrust table, and loadouts (mass + ΔCD0).
- **G limits follow War Thunder:** the wing-break load is a force (`wingBreakLoad_N`, WT
  `Strength.CritOverload`), so wing-break G = force / weight and falls with mass. The instructor
  allows `instructorFraction` of that (WT `overloadMult`, ~0.85). A fly-by-wire limit (`fcs`, F-16
  only) caps both instructor-on and instructor-off.
- Scenario inputs: altitude, fuel, loadout, limiter (instructor/off), optional pilot G (smooth
  flying; null = yank to the limiter), turn-plane inclination θ.
- Turn rate is the circle average in the turn plane: ω = g·√(n² − cos²θ) / V (level turn when θ = 0).
  `turnRateExtremes` gives the top/bottom of an inclined turn (± g·sin θ / V).
- Outputs per speed: lift-limited and available G, ITR, STR (thrust = drag), radii, Ps at 1 g and
  at max G; plus stall / corner / placard speeds and Ps contours for E-M diagrams.
- `timeline.ts` integrates a sustained hard turn from the merge (dV/dt = g·Ps / V, altitude held)
  for the turn timeline and turn-circle views.
- Tables are interpolated linearly and clamped at the edges (`interpolate.ts`).

The matchup layer computes two flights per side: `pull` (to the limiter, used for 1-circle /
radius results) and `flown` (at the pilot's G, used for 2-circle / rate, energy and the timeline).

Adding an aircraft = adding one JSON file; the loader picks it up via `import.meta.glob` and the
schema rejects malformed tables.

## Testing

- **Unit tests** (`*.test.ts`) — colocated with the code. Physics and data code must be covered
  here.
- **Component tests** (`*.test.tsx`) — Testing Library; query by role/label as a user would and
  assert visible behaviour, not implementation details. Plotly does not run in jsdom: mock
  `PlotlyChart` and assert on the figure it receives; chart logic belongs in pure builders in
  `features/charts/series.ts`, which are unit-tested directly.
- **E2E tests** (`apps/e2e/tests/`) — Playwright against the production build; cover the main
  user flows and fail on console errors.

## Domain Glossary

- **BFM** — Basic Fighter Manoeuvres: close-range, within-visual-range manoeuvring after the merge.
- **Merge** — The moment two aircraft pass each other head-on; the fight starts here.
- **1-circle fight** — Both aircraft turn towards each other (nose-to-nose). Won by the smaller
  **turn radius** — it is a pitch/radius fight.
- **2-circle fight** — Both aircraft turn the same direction (nose-to-tail). Won by the higher
  **turn rate** (degrees/second) — it is a rate fight.
- **ITR** — Instantaneous Turn Rate: maximum turn rate available right now, regardless of energy
  loss. Limited by lift (at low speed) or G-limit (at high speed).
- **STR** — Sustained Turn Rate: maximum turn rate holdable without losing speed or altitude
  (thrust = drag), i.e. where Ps = 0.
- **Corner velocity** — Lowest speed at which the aircraft can pull its maximum G. Gives the best
  instantaneous turn rate and the smallest radius at max G.
- **Ps** — Specific Excess Power: `Ps = V × (T − D) / W` (m/s). Positive means the aircraft gains
  energy in that state; negative means it bleeds energy.
- **E-M diagram** — Turn rate vs. airspeed chart with Ps contours, G lines, and radius lines.
- **Flight path angle** — Angle of the velocity vector relative to the horizon (0° flat turn,
  90° vertical).

Physics reference formulas (level turn, SI units):

- Turn rate `ω = g × √(n² − 1) / V` (rad/s)
- Turn radius `r = V² / (g × √(n² − 1))`

## Key Conventions

- **SI units internally** — store and compute in m, m/s, kg, N, seconds, radians. Convert to
  knots, km/h, Mach, feet, and degrees only at the display layer.
- **Physics is pure TypeScript** — no React, DOM, or charting imports in the maths layer, so it
  can be unit-tested in isolation. Components consume its outputs.
- **Aircraft data is versioned JSON** — every dataset records its War Thunder patch version, its
  source (datamine, community spreadsheet, or `mock`), and units. Mock values must be marked
  `mock` so they are never mistaken for real data.
- **Test the maths** — interpolation and E-M calculations need unit tests with independently
  derived expected values (hand calculation or published figures), not values copied from the
  implementation.
- **AI config is managed by rulesync** — edit `.rulesync/` and run `mise run rules:sync`. Never
  edit generated files (`AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`,
  `.cursor/rules/`, `.amp/plugins/rulesync-hooks.ts`, MCP config files) directly. Shared MCP
  servers go in `.rulesync/mcp.json`; project skills go in `.rulesync/skills/<name>/SKILL.md` and
  are generated into `.agents/skills/` (Amp) and each other tool's skills folder. Other `.amp/settings.json`
  keys (e.g. permissions) may be edited by hand — rulesync preserves them.
- **British English** in user-facing copy (manoeuvre, behaviour, colour).

## Anti-Patterns

- Don't build a real-time aerodynamic differential-equation solver for the MVP — interpolate from
  baseline performance markers instead.
- Don't start the data pipeline before the UI and interactions are settled (UI-first).
- Don't mix unit systems inside the physics layer.
- Don't install JS deps with npm/yarn — use `bun add` in the relevant `apps/*` package (root
  `package.json` is for repo-wide tooling only).
- Don't edit generated AI config files directly — edit `.rulesync/` and run `mise run rules:sync`.
