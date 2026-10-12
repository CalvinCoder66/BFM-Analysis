# Plan: datamine pipeline (backend phase A)

**Status:** draft for review · **Owner:** Calvin · **Last updated:** 2026-10-12

## Goal

Replace the mock aircraft data with War Thunder flight-model data from the community datamine,
[gszabi99/War-Thunder-Datamine](https://github.com/gszabi99/War-Thunder-Datamine), and make
refreshing it after a game patch a one-command, reviewable change.

The output is the same `data/aircraft/*.json` the frontend already loads, so the site stays static.
No API server is needed in this phase.

**Out of scope:** an API, a database, every aircraft in the game, and simulating War Thunder's full
flight model. We only extract what the quasi-steady model needs.

## Stack

Python 3.14 works with every tool we plan to use. I checked PyPI metadata and ran a smoke test
(uv project on 3.14.7 with pydantic, typer, numpy, httpx, pytest, ruff and ty):

| Tool | Version checked | 3.14 support |
| --- | --- | --- |
| Python (via mise) | 3.14.7 | ✓ (3.15.0 has just been released, but pydantic-core does not list it yet, so stay on 3.14) |
| uv (project and dependency manager) | 0.12 | ✓ |
| Pydantic v2 (models and validation) | 2.14 | ✓ (cp314 wheels) |
| NumPy (interpolation and resampling) | 2.5 | ✓ (cp314 wheels) |
| Typer (CLI) | 0.27 | ✓ |
| pytest (tests) | 9.1 | ✓ |
| ruff (lint and format) | 0.17 | ✓ (`target-version = "py314"`) |
| ty (type checking) | 0.0.86 | ✓ |

We fetch with git, not an HTTP library, so httpx is not needed. (It is pure Python and ran fine on
3.14 if we ever want it.)

Layout:

```
apps/pipeline/
├── pyproject.toml            # uv project, requires-python >= 3.14
├── aircraft.toml             # which aircraft and loadouts to extract, and our ids for them
├── src/bfm_pipeline/
│   ├── cli.py                # `update`, `check`, `inspect` commands
│   ├── fetch.py              # pinned sparse clone of the datamine + provenance
│   ├── blkx.py               # load .blkx JSON, normalise repeated blocks
│   ├── raw_models.py         # lossless Pydantic models of the datamine fields we read
│   ├── extract/              # one module per concern: mass, wing, limits, thrust, aero, loadouts, names
│   ├── atmosphere.py         # ISA, TAS↔Mach (same maths as the frontend, tested against the same tables)
│   ├── output_models.py      # Pydantic mirror of the frontend aircraft schema
│   └── write.py              # write data/aircraft/<id>.json and a change summary
└── tests/                    # unit tests on trimmed fixture files, golden-output tests
```

mise gets `python = "3.14"` and `uv = "latest"`. New tasks:

| Task | Does |
| --- | --- |
| `mise run setup` | Also runs `uv sync` for the pipeline |
| `mise run data:update -- --ref <tag>` | Fetch the datamine at a tag, regenerate the aircraft JSON, print a change summary |
| `mise run data:check` | Regenerate from the pinned ref and fail if the committed JSON differs (CI) |
| `mise run check` / `mise run test` | Also run ruff, ty and pytest on the pipeline |

## What we know about the datamine

I checked these against the repo at version `2.59.0.64`:

- **Versioning.** A root `version` file (e.g. `2.59.0.64`), plus a git tag and commit per game
  version. We pin a tag and record the tag, commit SHA and game version in each output file.
- **Size.** About 13.6 GB, so we never do a full clone. A shallow, blob-filtered sparse clone of
  `gamedata/flightmodels`, `gamedata/weapons`, `lang/units.csv` and `version` takes seconds. It
  is cached in `.cache/datamine/<tag>` (gitignored).
- **Files per aircraft.**
  - `flightmodels/<id>.blkx` covers integration, weapons and instructor overrides. It points to
    the physics file through `fmFile`.
  - `flightmodels/fm/<fm>.blkx` holds mass, aerodynamics, engines, structure, instructor and
    autopilot.
  - Weapon presets live in `flightmodels/weaponpresets/` and resolve through the aircraft's
    `WeaponSlots` to files under `gamedata/weapons/`.
- **Names.** `lang/units.csv` is semicolon-delimited, and the key is `<id>_0` (e.g.
  `f_16c_block_50_0` → "F-16C Block 50").
- **Key names vary between aircraft** (e.g. `MaxFuelMass0` vs `MaxFuelMass`, `Strength.VNE` vs
  top-level `Vne`). The raw models accept the known variants explicitly and fail loudly on unknown
  shapes.

The best existing reference is
[Alpakinator/wt-aircraft-performance-calculator](https://github.com/Alpakinator/wt-aircraft-performance-calculator)
(a Python datamine parser for masses, names and fetching). Its website repo has the jet thrust grid
code. We learn from it; we don't depend on it.

## Field mapping

How each field of our schema is derived. **Confidence** says how sure we are that the mapping matches
the game; anything below *high* needs the validation in the next section before we drop the mock
badge.

| Our field | Datamine source | Derivation | Confidence |
| --- | --- | --- | --- |
| `name` | `units.csv` `<id>_0` | Direct; normalise non-breaking spaces | High |
| `wingArea_m2` | `Aerodynamics.WingPlane.Areas` | Sum of the six wing panels (not `Aileron`). F-16: 27.9 m² | High |
| `emptyMass_kg` | `Mass.EmptyMass` (+ oil, pilot, gun ammo) | Same additions as the community mass calculator | High |
| `internalFuel_kg` | `Mass.MaxFuelMass0` or `MaxFuelMass` | Direct | High |
| `maxIas_kmh`, `maxMach` | `WingPlane.Strength.VNE` / `MNE` (fallback: top-level `Vne` / `VneMach`) | Direct | Medium |
| `gLimits.wingBreakLoad_N` | `WingPlane.Strength.CritOverload[1]` | Need to confirm whether the force is per wing or total; today's mock doubles it | **Low until validated** |
| `gLimits.instructorFraction` | Instructor `overloadMult` (FM, overridden by the aircraft's `instructorOverloadMult`) | First pass: use the steady-state value (0.85). Keep the full arrays in the raw model | Medium |
| `gLimits.fcs` | Autopilot `Pitch.RateMaxLoadFactorMax[1]` when the aircraft's `autopilotImpl` is `FBW` | Direct (F-16: 10). The FBW AoA limit (`AoaLimits`) also matters, see aero | Medium |
| `thrust` table | `EngineType0.Main.ThrustMax` grid (altitude × TAS, `ThrustMax0`, `ThrustMaxCoeff_i_j`, `ThrAftMaxCoeff_i_j`), afterburner mode `ThrustMult` / `AfterburnerBoost`, engine count | Work out the game's formula, convert TAS to Mach with ISA, resample to our Mach grid | **Low until validated** |
| `aero.clMax(M)` | Wing `FlapsPolar0` (`ClCritHigh`, `alphaCritHigh`, `lineClCoeff`, `Cl0`) with the `MachCritN`/`MachMaxN`/`MultLimitN` Mach modifiers, capped by the FBW/instructor AoA limit | Evaluate the polar at each Mach on our grid | **Low until validated** |
| `aero.cd0(M)` | `CdMin` of wing, fuselage and tail polars weighted by area, plus fixed drag items, with Mach modifiers | Evaluate at each Mach | **Low until validated** |
| `aero.k(M)` | Wing `OswaldsEfficiencyNumber`, span and area (k = 1 / (π·e·AR)), with Mach modifiers | Evaluate at each Mach | Medium |
| `loadouts[].mass_kg` | Preset → slot → weapon files (`mass`, `rocket.mass`, racks, tanks) | Sum resolved masses; fail if any reference is unresolved | High |
| `loadouts[].cd0Delta` | Store `dragCx` / slot modifiers | Needs the game's store-drag formula and reference area | **Low until validated** |
| provenance (new) | `version`, tag, commit SHA | Recorded per file, together with per-field confidence | — |

The aerodynamics rows are the hard part. War Thunder builds lift and drag from several component
polars with undocumented transonic modifiers. Our first pass reduces those to whole-aircraft
CLmax, CD0 and k per Mach, and we will tune that reduction against validation data rather than
assume it is right.

## Validation

Every derived value that doesn't come straight from one datamine field needs evidence before we
call the data real:

1. **Golden fixtures.** Trimmed copies of the three aircraft's files in `tests/fixtures/`, with
   expected outputs worked out by hand (e.g. F-16 wing area 27.9 m²). These cover parsing and the
   simple mappings.
2. **Reference performance table** (`apps/pipeline/validation/reference.toml`). Measured or
   published in-game figures with their source and the conditions they were measured in:
   sea-level top speed, a 1 g acceleration time, sustained and instantaneous turn times at a stated
   fuel and altitude, and the G at which wings break. Tests run our model on the extracted data and
   assert each figure within a tolerance (e.g. ±3%).
3. **Cross-check** against the community calculator's thrust curves where both exist.
4. **Change summary.** `data:update` prints each changed field per aircraft, so a patch PR shows
   e.g. "MiG-29 CritOverload 910 kN → 950 kN".

Step 2 needs in-game test flights. Those are best done by you (custom battle, test flight, with
Tacview or the in-game telemetry), and they give us ground truth no parser can.

## Frontend changes

All small and backwards compatible:

- Schema: add an optional `provenance` block (`gameVersion`, `sourceRef`, `sourceCommit`,
  per-field confidence). `source: "datamine"` and `gamePatch` already exist.
- UI: show "Datamine · WT 2.59" instead of the mock badge for real data, and "Mock data" for the rest.
- Both sides validate the same files in CI: the pipeline with Pydantic, the frontend with zod. If the
  schemas drift apart, a test fails.

## Milestones (one PR each, each targeting `main`)

1. **Scaffold.** `apps/pipeline` uv project on 3.14, mise tool and tasks, ruff/ty/pytest, CI job.
   Pinned sparse fetch with provenance, `.blkx` loader, `inspect` command (dump an aircraft's raw
   fields).
2. **Simple fields.** Names, masses, wing area, speed limits, G limits and FBW, with raw and output
   models, golden fixtures and tests. Writes partial output to a scratch folder, not `data/`.
3. **Thrust.** Grid extraction, game formula, TAS→Mach resampling, plus the first entries in the
   reference table (top speed, acceleration).
4. **Aerodynamics.** Component-polar evaluation into CLmax/CD0/k per Mach. Validate turn figures
   against the reference table and iterate until within tolerance.
5. **Loadouts.** Preset resolution, exact masses, first-pass store drag.
6. **Switch the frontend to real data** for the F-16C, MiG-29 and Su-27. Provenance in the schema,
   datamine badge, `data:check` in CI. Mock files stay only for aircraft not yet extracted.
7. **Automation.** A scheduled GitHub Action checks for a new datamine tag, runs `data:update` and
   opens a PR with the change summary.

Milestones 1–3 are fairly mechanical. Milestone 4 is the risky one and may take a few rounds of
validation against test flights.

## Open questions

1. **Which aircraft first?** I suggest the current three (F-16C Block 50, MiG-29 9-12, Su-27). Then
   which come next: F-15C, Mirage 2000, JAS 39, F/A-18?
2. **Game mode.** Instructor limits only apply with mouse aim (Arcade/Realistic). Is Realistic
   Battles with the instructor the default we design for, with "instructor off" representing
   Simulator / full-real controls?
3. **Validation flights.** Are you up for a handful of in-game test flights per aircraft (top speed,
   a sustained turn, wing-rip G)? That data is what moves the aerodynamics from "plausible" to
   "trustworthy".
4. **Attribution.** The data is Gaijin's, extracted by the datamine project. I'll credit both in
   the README and the UI footer. Let me know if you want anything stricter.
5. **Automation permissions.** The scheduled update needs a workflow allowed to push a branch and
   open PRs (`contents: write`, `pull-requests: write`). OK to add when we get to milestone 7?
