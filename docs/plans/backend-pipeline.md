# Plan: datamine pipeline (backend phase A)

**Status:** final, agreed 2026-10-12 · **Owner:** Calvin

## Goal

Replace the mock aircraft data with War Thunder flight-model data from the community datamine,
[gszabi99/War-Thunder-Datamine](https://github.com/gszabi99/War-Thunder-Datamine), for every
aircraft with a unique flight model at **Realistic Battles BR 12.0–14.7**. Refreshing it after a
game patch should be a one-command, reviewable change.

The output is `data/aircraft/*.json`, which the frontend already loads, so the site stays static.
There is no API server in this phase.

## Decisions

| Topic | Decision |
| --- | --- |
| Game mode | **Realistic Battles only**, with the instructor on (the RB default). Arcade and Simulator are out of scope. Full-real controls are allowed in RB but not modelled for now |
| Aircraft scope | Every fixed-wing aircraft with an RB battle rating of 12.0–14.7 |
| Duplicates | One entry per **unique flight model**. Nation copies that share a flight model and performance-relevant settings are merged, and their names are listed as variants (e.g. "F-16AM: Norway, Netherlands"). Aircraft with a different flight model or different performance settings stay separate (e.g. F-16A vs F-16AM) |
| Python | 3.14. Every tool supports it (checked below) |
| Fetching | A shallow sparse git clone pinned to a game-version tag. No HTTP client needed |
| Credits | Credit Gaijin Entertainment / War Thunder and the datamine project in the README and the site footer |
| Automation | A scheduled GitHub Action may push a branch and open PRs (`contents: write`, `pull-requests: write`) |

## Stack

I checked Python 3.14 support against PyPI metadata and with a smoke test: a uv project on 3.14.7
with pydantic, typer, numpy, httpx, pytest, ruff and ty.

| Tool | Version checked | 3.14 support |
| --- | --- | --- |
| Python (via mise) | 3.14.7 | ✓ (3.15.0 is out, but pydantic-core does not list it yet) |
| uv (project and dependency manager) | 0.12 | ✓ |
| Pydantic v2 (models and validation) | 2.14 | ✓ (cp314 wheels) |
| NumPy (interpolation and resampling) | 2.5 | ✓ (cp314 wheels) |
| Typer (CLI) | 0.27 | ✓ |
| pytest (tests) | 9.1 | ✓ |
| ruff (lint and format) | 0.17 | ✓ (`target-version = "py314"`) |
| ty (type checking) | 0.0.86 | ✓ |

Layout:

```
apps/pipeline/
├── pyproject.toml            # uv project, requires-python >= 3.14
├── roster.toml               # scope rules: BR range, classes, deny-list, manual merges/splits
├── src/bfm_pipeline/
│   ├── cli.py                # update, check, roster, inspect, record, analyse
│   ├── fetch.py              # pinned sparse clone of the datamine + provenance
│   ├── blkx.py               # load .blkx JSON, normalise repeated blocks
│   ├── roster.py             # BR filter, class filter, flight-model deduplication
│   ├── raw_models.py         # lossless Pydantic models of the datamine fields we read
│   ├── extract/              # mass, wing, limits, instructor, thrust, aero, loadouts, names
│   ├── atmosphere.py         # ISA, TAS↔Mach (same maths and test tables as the frontend)
│   ├── output_models.py      # Pydantic mirror of the frontend aircraft schema
│   ├── write.py              # data/aircraft/<id>.json + change summary
│   └── telemetry/            # in-game flight recorder and analysis (see Validation)
├── validation/
│   ├── protocol.md           # test cards for in-game flights
│   ├── flights/              # raw recorded flights, per game version and aircraft
│   └── reference.toml        # figures derived from the flights, with uncertainty
└── tests/                    # unit tests on trimmed fixtures, golden outputs, reference checks
```

mise gets `python = "3.14"` and `uv = "latest"`, plus these tasks:

| Task | Does |
| --- | --- |
| `mise run setup` | Also runs `uv sync` for the pipeline |
| `mise run data:update -- --ref <tag>` | Fetch the datamine at a tag, rebuild the roster and aircraft JSON, print a change summary |
| `mise run data:check` | Regenerate from the pinned ref; fail if the committed JSON differs (CI) |
| `mise run data:record -- --aircraft <id> --card <card>` | Record an in-game test flight through the telemetry API |
| `mise run check` / `mise run test` | Also run ruff, ty and pytest on the pipeline |

## The datamine

I checked these against version `2.59.0.64`:

- **Versioning.** A root `version` file plus a git tag and commit per game version. Each output
  records the game version, tag and commit SHA.
- **Size.** About 13.6 GB, so we use a shallow, blob-filtered sparse clone of
  `aces.vromfs.bin_u/gamedata/{flightmodels,weapons}`, `char.vromfs.bin_u/config/wpcost.blkx`,
  `lang.vromfs.bin_u/lang/units.csv` and `version`. It is cached in `.cache/datamine/<tag>`
  (gitignored).
- **Files per aircraft.**
  - `flightmodels/<id>.blkx` covers integration, weapons, instructor overrides and FBW type, and
    points to the physics file through `fmFile`.
  - `flightmodels/fm/<fm>.blkx` holds mass, aerodynamics, engines, structure, instructor and
    autopilot.
  - Weapon presets in `flightmodels/weaponpresets/` resolve through the aircraft's `WeaponSlots`
    to files under `gamedata/weapons/`.
- **Battle rating.** `wpcost.blkx`: `economicRankHistorical` is RB, and BR = 1.0 + rank / 3.
  BR 12.0–14.7 is ranks 33–41. `unitClass` gives the type (`exp_fighter`, `exp_assault`,
  `exp_bomber`, `exp_helicopter`, …). Today's `master` copy of `wpcost.blkx` is empty, so we pin
  a known-good tag and fail loudly if the file is empty.
- **Names.** `units.csv` is semicolon-delimited, keyed `<id>_0` (e.g. `f_16c_block_50_0` →
  "F-16C Block 50").
- **Shared flight models.** These are common: the Norwegian and Dutch F-16AM share
  `fm/f_16a_block_20_mlu`; the German and Hungarian MiG-29 share a flight model; the Mirage
  2000C-S4 and -S5 share `fm/mirage_2000c_s5`. Some lookalikes don't: the Belgian F-16AM and the
  Italian F-16 ADF have their own flight models.
- **Key names vary between aircraft** (e.g. `MaxFuelMass0` vs `MaxFuelMass`, `Strength.VNE` vs
  top-level `Vne`). The raw models accept the known variants explicitly and fail on unknown shapes.

The best existing reference is
[Alpakinator/wt-aircraft-performance-calculator](https://github.com/Alpakinator/wt-aircraft-performance-calculator)
(Python parsing for masses, names and fetching). Its website repo has the jet thrust grid code. We
learn from it; we don't depend on it.

## Roster: which aircraft, and deduplication

1. **Filter:** `economicRankHistorical` 33–41, and `unitClass` is fixed-wing (`exp_fighter`,
   `exp_assault`, `exp_bomber`). Helicopters are excluded because the physics model is
   fixed-wing only. A deny-list in `roster.toml` removes non-player units (killstreak, mission-only
   and test entries). We don't filter on "researchable", because event and premium aircraft count.
2. **Group by flight model:** resolve each unit's `fmFile`.
3. **Split groups where performance differs.** Within a group, compare a fingerprint of the
   performance-relevant top-level settings: instructor multipliers, FBW/autopilot type and
   overrides, built-in weapons and ammunition mass, and the available weapon presets. Units with
   identical fingerprints merge into one entry. Avionics-only differences don't split.
4. **Output** one aircraft file per entry, with `variants` (every merged unit's id, name and
   nation). The roster report (`mise run data:update` prints it, and a generated
   `data/aircraft/ROSTER.md` lists it) shows what was merged and why. `roster.toml` can force a
   merge or split if the fingerprint gets it wrong.

When a patch moves an aircraft into or out of 12.0–14.7, it shows up in the change summary of the
update PR.

## Field mapping

**Confidence** says how sure we are that a mapping matches the game. Anything below *high* must
pass the validation below before we drop the mock badge for that aircraft.

| Our field | Datamine source | Derivation | Confidence |
| --- | --- | --- | --- |
| `name`, `variants` | `units.csv` `<id>_0`, roster grouping | Direct; normalise non-breaking spaces | High |
| `br`, `nation` (new) | `wpcost.blkx` `economicRankHistorical`, `country` | BR = 1 + rank / 3 | High |
| `wingArea_m2` | `Aerodynamics.WingPlane.Areas` | Sum of the six wing panels (not `Aileron`). F-16: 27.9 m² | High |
| `emptyMass_kg` | `Mass.EmptyMass` (+ oil, pilot, gun ammunition) | Same additions as the community mass calculator | High |
| `internalFuel_kg` | `Mass.MaxFuelMass0` or `MaxFuelMass` | Direct | High |
| `maxIas_kmh`, `maxMach` | `WingPlane.Strength.VNE` / `MNE` (fallback: top-level `Vne` / `VneMach`) | Direct | Medium |
| `gLimits.wingBreakLoad_N` | `WingPlane.Strength.CritOverload[1]` | Need to confirm whether the force is per wing or total; today's mock doubles it | **Low until validated** |
| `gLimits` instructor (reworked) | FM `Instructor` (`overloadMult`, `overloadTimeRange`, `critMult`), overridden by the unit's `instructorOverloadMult` / `instructorCritMult` | Model two limits: a **steady** limit and a short **peak** the instructor allows briefly. That covers the 12–13 g you see in RB. Keep the raw arrays | **Low until validated** |
| `gLimits.fcs` | Autopilot `Pitch.RateMaxLoadFactorMax[1]` (and `AoaLimits`) when the unit's `autopilotImpl` is `FBW` | Direct (F-16: 10). The AoA limit feeds into CLmax | Medium |
| `thrust` table | `EngineType0.Main.ThrustMax` grid (altitude × TAS, `ThrustMax0`, `ThrustMaxCoeff_i_j`, `ThrAftMaxCoeff_i_j`), afterburner `ThrustMult` / `AfterburnerBoost`, engine count | Work out the game's formula, convert TAS to Mach with ISA, resample to our Mach grid | **Low until validated** |
| `aero.clMax(M)` | Wing `FlapsPolar0` (`ClCritHigh`, `alphaCritHigh`, `lineClCoeff`, `Cl0`) with the `MachCritN`/`MachMaxN`/`MultLimitN` modifiers, capped by the FBW/instructor AoA limit | Evaluate the polar at each Mach on our grid | **Low until validated** |
| `aero.cd0(M)` | `CdMin` of wing, fuselage and tail polars weighted by area, plus fixed drag items, with Mach modifiers | Evaluate at each Mach | **Low until validated** |
| `aero.k(M)` | Wing `OswaldsEfficiencyNumber`, span and area (k = 1 / (π·e·AR)), with Mach modifiers | Evaluate at each Mach | Medium |
| `loadouts[].mass_kg` | Preset → slot → weapon files (`mass`, `rocket.mass`, racks, tanks) | Sum resolved masses; fail if any reference is unresolved | High |
| `loadouts[].cd0Delta` | Store `dragCx` / slot modifiers | Needs the game's store-drag formula and reference area | **Low until validated** |
| `provenance` (new) | `version`, tag, commit SHA | Per file, with per-field confidence | — |

Aerodynamics is the hard part. War Thunder builds lift and drag from several component polars with
undocumented transonic modifiers. We reduce them to whole-aircraft CLmax, CD0 and k per Mach, and
tune that reduction against flight data rather than assume it is right.

## Validation: a repeatable in-game test method

The aim is that anyone can rerun a test and check our numbers. That means recorded raw data, fixed
conditions, repeats and an analysis script, not eyeballed HUD readings.

**Recording.** War Thunder serves live telemetry on `http://localhost:8111`. `/state` includes
`IAS, km/h`, `TAS, km/h`, `M`, `H, m`, `Ny` (load factor), `AoA, deg`, `Vy, m/s`, `Mfuel, kg`
and thrust per engine. `/indicators` includes the aircraft id, heading, pitch and roll. The
`record` command polls both at about 20 Hz and writes each raw response as JSON lines, with a
monotonic timestamp, to `validation/flights/<game-version>/<aircraft>/<card>-<run>.jsonl.gz`. A
metadata file per run notes the aircraft, loadout, starting fuel, map, mode and date. The game's
real refresh rate isn't documented, so the analysis measures it from the data and flags repeated
samples.

**Conditions.** Realistic difficulty with the instructor (mouse aim), in a custom battle or test
flight set to Realistic. Use a clean loadout unless the card says otherwise. Note the starting
fuel; `Mfuel` gives the exact mass throughout. Use the same map for every run, because its
temperature affects air density, and the analysis corrects to ISA using the measured altitude and
speeds.

**Test cards** (`validation/protocol.md` will have step-by-step instructions):

| Card | Procedure | What it validates |
| --- | --- | --- |
| A. Level acceleration | Full afterburner at 1 g, holding 1,000 m, from 400 km/h to top speed | Ps at 1 g vs speed (thrust minus drag), top speed |
| B. Top speed at height | Stabilised top speed at 1,000 m and 6,000 m | Thrust and drag at high Mach |
| C. Sustained turns | Level turn holding a constant speed and altitude for 10 s, at 3–4 speeds | Sustained G and turn rate (STR curve) |
| D. Instantaneous pulls | From a stable speed, full stick back for 3 s, at speeds below and above corner | Lift limit (CLmax) and the instructor's steady and peak G |
| E. Bleed under load | Hold max pull and record the speed decay | Ps at max G |

Each card is flown **three times**. The `analyse` command:

- picks out the steady segments;
- computes Ps from energy height, h + V²/2g, so altitude wander doesn't matter;
- works out turn rate from heading;
- writes mean ± spread into `reference.toml`.

Model tests then pass if they agree within the larger of 3% or twice the run-to-run spread. The raw
logs are committed, so anyone can rerun the analysis.

**Other checks:**

- golden fixtures (trimmed datamine files with hand-worked expected values) for parsing;
- a cross-check against the community calculator's thrust curves;
- a per-patch change summary, so data changes are visible in review.

## Frontend changes (milestone 7)

- **Schema** (backwards compatible): add `br`, `nation`, `variants` and an optional `provenance`
  block. `source: "datamine"` and `gamePatch` already exist.
- **Aircraft picker:** with dozens of aircraft, the selects become searchable and grouped by BR,
  with nation shown and variant names searchable.
- **RB only:** the G-limiter control becomes the RB instructor (steady limit and brief peak). The
  "instructor off" option is removed. Pilot style (smooth vs yank) stays.
- **Badges:** "Datamine · WT 2.59" for validated real data, "Unvalidated" for real data that
  hasn't passed the flight checks yet, and "Mock" for the rest.
- **Credits** in the footer and README: "Flight-model data from War Thunder © Gaijin
  Entertainment, extracted by gszabi99/War-Thunder-Datamine. Not affiliated with Gaijin."
- Both sides validate the same files in CI (Pydantic and zod), so schema drift fails a test.

Separately, another thread is investigating how vertical turns should trade airspeed for altitude
in the turn timeline. Any change there is a frontend physics fix and doesn't affect this pipeline.

## Milestones (one PR each, each targeting `main`)

1. **Scaffold and roster.** `apps/pipeline` uv project on 3.14, mise tool and tasks,
   ruff/ty/pytest, CI job. Pinned sparse fetch with provenance, `.blkx` loader, `inspect`. The
   roster: BR and class filter, flight-model grouping and fingerprint splitting, roster report.
2. **Simple fields.** Names, BR, nation, variants, masses, wing area, speed limits, wing-break load,
   instructor and FBW limits, with raw and output models, golden fixtures and tests. Output goes to
   a scratch folder, not `data/`.
3. **Flight recorder and protocol.** `record` and `analyse` commands and `protocol.md`. You can start
   flying test cards from here, while the next milestones are built.
4. **Thrust.** Grid extraction, game formula, TAS→Mach resampling; checked against cards A and B.
5. **Aerodynamics.** Component-polar evaluation into CLmax/CD0/k per Mach, checked against cards
   C–E. Expect a few rounds here.
6. **Loadouts.** Preset resolution, exact masses, store drag checked with a loaded run of card A.
7. **Switch the frontend to real data.** Schema additions, picker, RB-only limiter, badges, credits,
   `data:check` in CI. Mock files are removed once every roster aircraft has real data.
8. **Automation.** A scheduled GitHub Action checks for a new datamine tag, runs `data:update` and
   opens a PR with the change and roster summary.

Milestones 1–4 are fairly mechanical. Milestone 5 is the risky one, and its pace depends on flight
data from milestone 3.

## Remaining unknowns (resolved during the milestones)

- Whether `CritOverload` is per wing or total (card D at higher speeds, or a wing-rip test with the
  instructor off, purely as a check).
- The exact thrust formula (cards A and B).
- How the instructor's `overloadMult` and `overloadTimeRange` map to the steady and peak G (card D).
- Whether test-flight mode uses exactly the RB flight model, or we must use a custom battle (we
  compare one card in both early in milestone 3).
