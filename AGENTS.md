# BFM Analysis

Interactive web dashboard that turns War Thunder flight-model data into practical Basic Fighter
Manoeuvres (BFM) decisions for 4th-generation jets. It compares two aircraft (attacker vs.
defender) across 1-circle (radius) and 2-circle (rate) fights using Energy-Manoeuvrability (E-M)
theory, driven by sliders for altitude, fuel/loadout, airspeed, flight path angle, turn duration,
and G-limiter state.

Built by Calvin Cheung as a portfolio/learning project. The full plan lives in
`docs/PROJECT-PLAN.md`; read it before starting a new phase.

## Current Status

**Pre-scaffold.** Only docs and agent configuration exist. The app is built in phases:

1. **Foundation & mock data** — React + Tailwind dashboard, charting library, 2–3 hardcoded
   matchups (e.g. F-16C vs. MiG-29) with mock E-M curves in JSON.
2. **Interactive controls** — sliders for altitude, speed, and loadout; TypeScript interpolation
   layer that shifts the curves.
3. **1-circle vs. 2-circle visualiser** — scorecards, turn-circle graphics, flight path angle and
   G-limiter modifiers.
4. **Real data** — replace mock values with community datamine data; dark-mode aviation HUD
   polish.

UI-first: build the layout and interactions against mock data before any data pipeline.

When you scaffold or restructure the project, update the structure, commands, and stack sections
below in the same change.

## Repository Structure

```
BFM-Analysis/
├── docs/
│   └── PROJECT-PLAN.md        # Product plan, feature blueprint, phased roadmap
├── .rulesync/                 # AI config source of truth → generates AGENTS.md, CLAUDE.md, etc.
│   ├── rules/overview.md      # This file
│   └── mcp.json               # MCP servers shared by all agents
├── .amp/
│   ├── settings.json          # Amp workspace settings; rulesync owns `amp.mcpServers`
│   └── plugins/               # Amp plugins; rulesync-hooks.ts is generated from .rulesync/hooks.json
├── scripts/                   # Repo maintenance scripts
└── .mise.toml                 # Tool versions + tasks
```

Planned once Phase 1 starts (confirm when scaffolding):

```
├── apps/frontend/             # React + Vite + Tailwind dashboard
│   └── src/
│       ├── features/          # Feature modules (scenario/, comparison/, energy/) with colocated tests
│       ├── physics/           # Pure TS E-M maths + interpolation (no React)
│       └── shared/            # Cross-feature UI and utils
└── data/aircraft/             # Version-controlled aircraft performance JSON
```

## Essential Commands

All commands are run via [mise](https://mise.jdx.dev/) from the repo root:

```bash
mise run rules:sync         # Regenerate AI config files from .rulesync/
mise run rules:check        # Verify AI config files are in sync (CI)
```

## Planned Stack

| Layer    | Tech                                              |
| -------- | ------------------------------------------------- |
| Frontend | React + Vite + TypeScript + Tailwind CSS          |
| Charts   | Chart.js or Plotly.js (decide in Phase 1)         |
| Physics  | Pure TypeScript module (interpolation, E-M maths) |
| Data     | Version-controlled JSON; Python datamine parser later |
| Tooling  | mise + bun                                        |
| CI       | GitHub Actions                                    |

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
- Don't install JS deps with npm/yarn — use `bun add`.
- Don't edit generated AI config files directly — edit `.rulesync/` and run `mise run rules:sync`.
