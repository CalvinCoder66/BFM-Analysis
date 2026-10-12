"""Milestone 4: engine thrust against altitude and Mach, at full military power and afterburner.

Each `EngineType<n>.Main.ThrustMax` block holds a reference thrust (`ThrustMax0`, kgf) and two
coefficient grids over altitude (m) and true airspeed (km/h): `ThrustMaxCoeff` for the dry engine
and `ThrAftMaxCoeff` for the afterburner. The game's formula, per engine:

    military    = ThrustMax0 × ThrustMaxCoeff(h, V) × ThrustMult(throttle 1.0)
    afterburner = ThrustMax0 × ThrustMaxCoeff(h, V) × ThrAftMaxCoeff(h, V)
                  × ThrustMult(throttle 1.1) × AfterburnerBoost

with bilinear interpolation, clamped at the grid edges. The same formula is used by the
community performance calculator (Alpakinator/wt-aircraft-performance-calculator.org), and the
Typhoon FGR.4's logged engine thrust matches it to within 1% (see docs/FINDINGS.md). Fully
upgraded aircraft are modelled, so research penalties (`new_compressor_jet` etc.) don't apply.
"""

import bisect
from typing import Any

from pydantic import BaseModel

from ..isa import G0, speed_of_sound
from .basic import ExtractionError, Sourced

#: Output grid. Altitudes cover the roster's ceilings; Mach covers every aircraft's MNE.
ALTITUDES_M = [float(h) for h in range(0, 16_000, 1_000)]
MACHS = [round(0.1 * i, 1) for i in range(25)]
MILITARY_THROTTLE = 1.0
AFTERBURNER_THROTTLE = 1.1
#: Nozzles pointing further than this from the flight path are lift jets (Yak-141), not thrust.
MAX_NOZZLE_PITCH_DEG = 45.0


class EngineGrid(BaseModel):
    """One engine type's thrust data, as read from the file (thrust in kgf, speeds TAS km/h)."""

    thrust_max0_kgf: float
    altitudes_m: list[float]
    velocities_kmh: list[float]
    coeff: list[list[float]]  # [altitude][velocity]
    afterburner_coeff: list[list[float]]
    military_mult: float
    afterburner_mult: float | None  # None: no afterburner (or water injection) mode
    afterburner_boost: float

    def thrust_N(self, h: float, tas_kmh: float, afterburner: bool) -> float:
        """Thrust of one engine in newtons."""
        dry = self.thrust_max0_kgf * _bilinear(self, self.coeff, h, tas_kmh)
        if not afterburner or self.afterburner_mult is None:
            return dry * self.military_mult * G0
        boost = _bilinear(self, self.afterburner_coeff, h, tas_kmh) * self.afterburner_boost
        return dry * self.afterburner_mult * boost * G0


class ThrustTable(BaseModel):
    engines: int
    has_afterburner: bool
    altitude_m: list[float]
    mach: list[float]
    #: Total thrust of all engines, newtons, [altitude][mach].
    military_N: list[list[float]]
    #: Afterburner (or water injection, e.g. the Harrier) total; equal to military without one.
    afterburner_N: list[list[float]]
    grid: EngineGrid


def _bracket(xs: list[float], x: float) -> tuple[int, int, float]:
    if x <= xs[0]:
        return 0, 0, 0.0
    if x >= xs[-1]:
        return len(xs) - 1, len(xs) - 1, 0.0
    j = bisect.bisect_right(xs, x) - 1
    return j, j + 1, (x - xs[j]) / (xs[j + 1] - xs[j])


def _bilinear(grid: EngineGrid, table: list[list[float]], h: float, v: float) -> float:
    i0, i1, fh = _bracket(grid.altitudes_m, h)
    j0, j1, fv = _bracket(grid.velocities_kmh, v)
    low = table[i0][j0] * (1 - fv) + table[i0][j1] * fv
    high = table[i1][j0] * (1 - fv) + table[i1][j1] * fv
    return low * (1 - fh) + high * fh


def _axis(block: dict[str, Any], name: str) -> list[float]:
    values: list[float] = []
    while f'{name}_{len(values)}' in block:
        values.append(float(block[f'{name}_{len(values)}']))
    return values


def parse_engine_type(engine_type: dict[str, Any], label: str) -> EngineGrid:
    main = engine_type.get('Main') or {}
    grid = main.get('ThrustMax')
    if main.get('Type') != 'Jet' or not isinstance(grid, dict):
        raise ExtractionError(f'{label}: engine is not a jet with a ThrustMax grid')
    if grid.get('VelocityType', 'TAS') != 'TAS':
        raise ExtractionError(f'{label}: unsupported VelocityType {grid["VelocityType"]!r}')
    cells: dict[str, Any] = grid
    altitudes, velocities = _axis(cells, 'Altitude'), _axis(cells, 'Velocity')
    if not altitudes or not velocities:
        raise ExtractionError(f'{label}: empty ThrustMax grid')

    def table(prefix: str) -> list[list[float]]:
        # Some files leave cells out: the M-346's grid stops at 1,200 km/h, and the F-16D Barak
        # II lacks one cell at 25,000 m. A missing cell takes the nearest cell given in its row,
        # as clamping at the edge of the grid would.
        rows = []
        for i in range(len(altitudes)):
            given = {
                j: float(cells[f'{prefix}_{i}_{j}'])
                for j in range(len(velocities))
                if f'{prefix}_{i}_{j}' in cells
            }
            if not given:
                raise ExtractionError(f'{label}: no {prefix} cells at altitude index {i}')
            rows.append(
                [given[min(given, key=lambda k: abs(k - j))] for j in range(len(velocities))]
            )
        return rows

    has_afterburner_grid = any(key.startswith('ThrAftMaxCoeff_') for key in grid)

    modes = {
        float(m['Throttle']): float(m['ThrustMult'])
        for key, m in main.items()
        if key.startswith('Mode') and isinstance(m, dict) and 'Throttle' in m
    }
    if MILITARY_THROTTLE not in modes:
        raise ExtractionError(f'{label}: no full-throttle (1.0) engine mode')
    return EngineGrid(
        thrust_max0_kgf=float(grid['ThrustMax0']),
        altitudes_m=altitudes,
        velocities_kmh=velocities,
        coeff=table('ThrustMaxCoeff'),
        afterburner_coeff=table('ThrAftMaxCoeff')
        if has_afterburner_grid
        else [[1.0] * len(velocities) for _ in altitudes],
        military_mult=modes[MILITARY_THROTTLE],
        afterburner_mult=modes.get(AFTERBURNER_THROTTLE),
        afterburner_boost=float(main.get('AfterburnerBoost', 1.0)),
    )


def _thrust_engines(fm: dict[str, Any]) -> dict[int, int]:
    """Engine count per engine type, leaving out lift jets."""
    counts: dict[int, int] = {}
    index = 0
    while isinstance(engine := fm.get(f'Engine{index}'), dict):
        index += 1
        direction = (engine.get('Nozzle0') or {}).get('Direction') or [0.0, 0.0]
        if abs(float(direction[1])) >= MAX_NOZZLE_PITCH_DEG:
            continue
        kind = int(engine.get('Type', 0))
        counts[kind] = counts.get(kind, 0) + 1
    return counts


def extract_thrust(fm: dict[str, Any], label: str) -> Sourced[ThrustTable]:
    counts = _thrust_engines(fm)
    if len(counts) != 1:
        raise ExtractionError(f'{label}: expected one thrust engine type, found {sorted(counts)}')
    [(kind, engines)] = counts.items()
    grid = parse_engine_type(fm.get(f'EngineType{kind}') or {}, label)

    def total(afterburner: bool) -> list[list[float]]:
        return [
            [
                round(engines * grid.thrust_N(h, m * speed_of_sound(h) * 3.6, afterburner))
                for m in MACHS
            ]
            for h in ALTITUDES_M
        ]

    return Sourced(
        value=ThrustTable(
            engines=engines,
            has_afterburner=grid.afterburner_mult is not None,
            altitude_m=ALTITUDES_M,
            mach=MACHS,
            military_N=total(afterburner=False),
            afterburner_N=total(afterburner=True),
            grid=grid,
        ),
        source=f'EngineType{kind}.Main.ThrustMax, Mode*.ThrustMult, AfterburnerBoost',
        confidence='medium',
        note="Formula matches the Typhoon FGR.4's logged thrust within 1% (military) and 0.3% "
        '(afterburner, low angle of attack). Mach → TAS uses ISA. One aircraft verified so far.',
    )
