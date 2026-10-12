# Findings: datamine against the game

What in-game test flights have shown about the datamine: which values the game follows exactly,
which ones it doesn't, and which ones mean something other than they appear to. Keep adding to this
file as more aircraft are flown; the newest evidence wins, and superseded readings stay listed
with what replaced them.

- **Game version:** War Thunder 2.59.0.65; datamine tag `2.59.0.65` (pinned in
  `apps/pipeline/pipeline.toml`).
- **Aircraft flown:** EF-2000 Typhoon FGR.4 (`ef_2000_fgr4`, RB 14.3), fully upgraded, clean,
  Realistic with mouse aim (instructor on), Western Europe map. October 2026.
- **Evidence:** 25 runs in `apps/pipeline/validation/flights/2.59.0.65/ef_2000_fgr4/`, flown to
  the test cards in `apps/pipeline/validation/protocol.md`. Reproduce any number here with
  `mise run data:analyse -- <logs>`.
- **Mass** in the figures below is datamine empty mass (11,340 kg, including crew and oil) plus the
  fuel the game reported at that moment. Gun ammunition is not included, so masses may be low by
  roughly 100 kg (under 1%).

## Summary

| Datamine field | Datamine value (or our reading of it) | What the game does | Verdict |
| --- | --- | --- | --- |
| `Mass.MaxFuelMass0` | 7,110 kg | Telemetry `Mfuel0` = 7,110 kg | ✅ Exact |
| `WingPlane.Strength.VNE` | 1,607 km/h IAS | Overspeed reported at Mach 1.42, about 1,200 m, where IAS first passed 1,607 km/h | ✅ Matches |
| `WingPlane.Strength.CritOverload` | 810 kN; we read the wing-break load as twice that, 1.62 MN | With the instructor on, maximum G holds a load of 1.59–1.68 MN at every weight (0.98–1.04 × 1.62 MN) | ✅ Twice the value is right, and it is the instructor's limit |
| `Instructor.overloadMult` | 0.90 / 1.05, read as the steady and brief-peak fractions of the wing-break load | Holds about 1.0 × the wing-break load, for 8 s or more | ❌ Neither fraction applies |
| `Autopilot.Pitch` G limit | 12 g, soft (strength 0.5) | No fixed 12 g: from 10.75 g at 15.6 t to 13.3 g at 12.9 t, depending on weight | ❌ Not what limits G |
| `Autopilot.Pitch` angle-of-attack limit | 21° | Levels off at 25–26.5° in every lift-limited pull | ❌ About 5° low |
| Dashboard model (mock data) | Instructor allows 0.85 × wing-break load | 0.98–1.04 × | ❌ Too strict; fix when the frontend switches to real data (milestone 7) |

## Values that match

### Internal fuel

The datamine's `Mass.MaxFuelMass0` is 7,110 kg, more than published figures for the real aircraft.
The game's own full-tank figure, telemetry `Mfuel0, kg`, is also **7,110 kg** in every run, so
the datamine value is what the game uses. Extraction confidence for fuel is now high.

### Speed limit (VNE)

The datamine gives 1,607 km/h IAS (`WingPlane.Strength.VNE`). In card A run 1, the aircraft first
passed 1,607 km/h IAS at 37.2 s, at Mach 1.41 and 1,189 m. The pilot saw the overspeed warning at
Mach 1.42 at about 4,000 ft (1,220 m). The run peaked at 1,648 km/h IAS, Mach 1.45, still
accelerating, so at 1,000 m the Typhoon's top speed is set by VNE, not thrust.

## Values that mean something else

### G limit: a constant force, with the instructor on

Every run that reached the G limit held almost the same **force** on the airframe (G × weight),
while the G itself varied with weight by 24%:

| Run | Mass (kg) | Held G | IAS (km/h) | Mach | Height (m) | Load (MN) | × 1.62 MN |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D-901 | 13,582 | 11.91 | 851 | 0.84 | 3,090 | 1.586 | 0.98 |
| D-902 | 12,955 | 12.50 | 872 | 0.90 | 3,810 | 1.589 | 0.98 |
| D-903 | 12,886 | 12.62 | 865 | 0.80 | 2,024 | 1.595 | 0.98 |
| E-1 | 13,293 | 12.39 | 777 | 0.76 | 3,026 | 1.615 | 1.00 |
| A-100 | 15,597 | 10.75 | 1,254 | 1.05 | 476 | 1.643 | 1.01 |
| E-1000 | 13,545 | 12.45 | 935 | 0.93 | 3,251 | 1.653 | 1.02 |
| A-101 | 15,404 | 10.99 | 902 | 0.87 | 2,768 | 1.660 | 1.02 |
| E-3 | 12,914 | 13.24 | 920 | 0.90 | 2,966 | 1.677 | 1.04 |
| E-2 | 13,132 | 13.03 | 928 | 0.90 | 2,859 | 1.678 | 1.04 |

"Held G" is the median of the highest ten samples (about half a second). A-100 held 10.6–10.7 g
for about 8 s at a time.

- **Twice `CritOverload` is right.** The datamine's `CritOverload` is 810 kN; twice that, 1.62 MN,
  is what the instructor holds the airframe to. So the rule is: **G limit = 1.62 MN ÷ weight.** On a
  full tank (18,450 kg) that predicts about 9.0 g, and at the lightest flown about 13 g.
- **Height doesn't matter** (476 m to 3,810 m), and nor does Mach (0.76 to 1.05).
- **The wings never broke**, including at 11 g and 15.4 t. That is consistent with the instructor
  capping the load at about the wing-break load. A pilot report of 10–11 g "on full fuel" turned
  out to be at 58–62% fuel (4,100–4,400 kg), which the rule predicts.
- The spread (0.98–1.04) is not yet explained. The afterburner runs sit highest (E-2, E-3), but
  E-1000 at military power is higher than the D-90x runs, so throttle alone doesn't account for it.
- Confirmed on **one aircraft**. Flying a second aircraft whose `overloadMult` differs is the next
  test of whether the rule is general.

### Instructor `overloadMult`

The Typhoon's `Instructor.overloadMult` is `[0.90, 1.05, 0.90, 1.05]`, with
`overloadTimeRange [0.9, 1.0]`. We had read these as a steady fraction (0.90) and a brief peak
(1.05) of the wing-break load. The flights match neither: the instructor holds about 1.0 × for as
long as the pilot pulls. What these numbers do is still open.

### Pitch limiter (`Autopilot.Pitch`)

The datamine gives a 12 g limit with strength 0.5. It is not what limits the Typhoon: held G ran
from 10.75 g to 13.3 g with weight, exceeding 12 g whenever the jet was light enough. Its 21°
angle-of-attack limit doesn't match either (next section).

### Angle-of-attack limit

Every lift-limited pull (cards C, D and E) levelled off at **25–26.5°**, never at the datamine's
21°. Medians of each run's highest angles: 24.9–26.5°. Below about 780 km/h IAS this limit, not
G, decides the turn.

## Measured performance (reference for milestones 4 and 5)

These have no direct datamine counterpart. They are what the extracted thrust and aerodynamics
must reproduce.

### Engine thrust (logged by the game per engine)

| Condition | Mach | Height (m) | Thrust per engine (kgf) |
| --- | --- | --- | --- |
| Afterburner (110%) | 0.80 | 1,024 | 9,943 |
| Afterburner | 0.90 | 1,044 | 10,450 |
| Afterburner | 1.00 | 1,069 | 10,941 |
| Afterburner | 1.20 | 1,097 | 11,223 |
| Afterburner | 1.40 | 1,180 | 11,140 |
| Military (100%) | 0.60 | 1,074 | 3,880 |
| Military | 0.96 | 991 | 5,507 |
| Military | 0.90 | 3,023 | 4,741 |
| Military | 0.99 | 3,224 | 4,766 |

Total afterburner thrust levels off at about 218–220 kN above Mach 1.1. To be compared with the
datamine thrust tables in milestone 4.

### Ps at 1 g, afterburner (card A run 1)

About 1,000–1,240 m, fuel falling from 2,320 to 1,820 kg.

| Mach | 0.83 | 0.96 | 1.14 | 1.22 | 1.29 | 1.34 | 1.38 | 1.43 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Ps (m/s) | 328 | 371 | 277 | 240 | 197 | 165 | 134 | 92 |

Ps peaks just below Mach 1 and falls through the transonic drag rise.

### Lift-limited G and lift at the angle-of-attack limit

- Peak G at about 500 km/h IAS: **6.12 ± 0.17 g** (D-501 to D-503, about 3,100 m).
- Peak G at about 690 km/h IAS: **9.91 ± 0.08 g** (D-701 to D-703, 3,850–4,020 m).
- The earlier 700 km/h pull at 3,140 m also peaked near 10 g: equal G at equal IAS across
  heights, as lift theory predicts.
- Preliminary normal-force coefficient at the angle-of-attack limit (samples at 24.5° or more):
  C_N = n·m·g / (½·ρ₀·IAS²·S), with S = 51.4 m². Body-axis `Ny` and IAS-based dynamic pressure, so
  treat as approximate.

| Mach | 0.3 | 0.4 | 0.5 | 0.6 | 0.7 |
| --- | --- | --- | --- | --- | --- |
| C_N | 1.28 | 1.28 | 1.24 | 1.17 | 1.13 |

### Corner speed and turn rates

- **Corner speed ≈ 780 km/h IAS** at about 13 t: D-902 held 12.2 g down to about 780 km/h, then G
  fell as the angle-of-attack limit took over.
- **Best instantaneous turn rate:** 26.9°/s (E-1, military, 762 km/h) and 26.9–28.6°/s (E-2/E-3,
  afterburner, 740–750 km/h).

### Bleed under load (card E)

At about 810–840 km/h and 12.3–12.8 g, about 3,000 m: Ps was −594 m/s at military power (E-1)
and −483 to −509 m/s in afterburner (E-2, E-3). Afterburner is worth about 100–150 m/s of Ps at
equal speed and G. The full curves are the `bleed` lists in each run's summary.

### Sustained turns, military power (card C)

About 960–1,580 m, 1,690–2,300 kg fuel. From a fit of Ps against n² over each turn; runs with
r² below 0.8 are not trusted.

| Run | IAS (km/h) | Sustained G | Turn rate | r² |
| --- | --- | --- | --- | --- |
| C-502 | 471 | 3.52 | 13.8°/s | 0.98 |
| C-501 | 502 | 3.73 | 13.8°/s | 0.96 |
| C-702 | 708 | 5.10 | 13.5°/s | 0.96 |
| C-902 | 898 | 4.75 | 9.7°/s | 0.81 |
| C-1101 | 1,065 | 3.55 | 6.1°/s | 0.96 |
| C-701 | 699 | 4.12 | 10.9°/s | 0.71, rejected |
| C-901 | 903 | 4.02 | 8.2°/s | 0.46, rejected |

Sustained turns in afterburner, and card B (top speed at 6,000 m), have not been flown.

## Telemetry lessons

Not datamine findings, but they shaped how the evidence is gathered:

- **Windows `localhost` is slow:** it tries IPv6 first and the game only listens on IPv4, which
  capped recording at about 1 Hz. The recorder uses `127.0.0.1` (about 19 Hz). From WSL,
  `localhost` is the Linux VM, so record from PowerShell.
- **The Typhoon has no compass** in `/indicators`. Position and heading come from `/map_obj.json`.
- **The map's heading vector is the nose**, which points inside the flight path by about the angle
  of attack in a hard turn. It overstated turn rates by up to 20% while the angle of attack built
  up. Turn rate now comes from the map track, which agrees with g·√(n² − 1)/V within about 3% at
  high G. The Western Europe map works out at about 131.5 km across.
- **`Ny` is the body-axis load factor:** it leaves out the thrust's component normal to the flight
  path, which matters a little at low G and high angle of attack.
- **Throttle:** 100% is full military power and 110% is afterburner.
- **The game logs** total engine thrust per engine, full-tank fuel (`Mfuel0`), current fuel and
  vertical speed, so start fuel no longer needs noting by hand. The fuel set before a flight is
  not what remains at the start of a card: runs meant for 50% began at about 27%.
- **Mouse aim can't hold a steady pull:** sustained turns wander by a g or two, so card C is
  analysed by a Ps–n² fit rather than by waiting for a steady stretch.

## Open questions

- What `Instructor.overloadMult` and `overloadTimeRange` do (a second aircraft with different
  values).
- Whether the constant-force G rule holds for aircraft with other instructor settings or a hard
  fly-by-wire limit (the F-16's `Autopilot.Pitch` strength is 1.0).
- Where the instructor's 25–26.5° angle-of-attack limit comes from in the files.
- Whether the datamine thrust tables reproduce the logged thrust (milestone 4).
