"""Turn a recorded flight into the figures the model is checked against.

Everything is derived from the raw log with simple, documented steps:

- **Specific excess power** comes from energy height, hₑ = h + V²/2g. Ps = dhₑ/dt, so trading
  height for speed doesn't distort it.
- **Turn rate** comes from the heading the game reports: the cockpit compass where the aircraft has
  one, otherwise the player's heading vector on the map (`/map_obj.json`). It is unwrapped and
  differentiated, so it doesn't depend on our own turn formulas. If no heading was logged, level
  segments fall back to the kinematic rate ω = g·√(n² − 1) / V from the measured load factor and
  speed, which holds for any aircraft in a level turn, and are labelled as such.
- **Engine thrust** is logged by the game per engine (`thrust N, kgs`) and summed.
- **Rates** (dV/dt, dh/dt, Ps, turn rate) are least-squares slopes over a short centred window,
  which smooths telemetry jitter without lagging the signal.
"""

import gzip
import json
import math
import statistics
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .recorder import RunMetadata

G0 = 9.80665
STATE_KEYS = {
    'ias': 'IAS, km/h',
    'tas': 'TAS, km/h',
    'mach': 'M',
    'h': 'H, m',
    'ny': 'Ny',
    'aoa': 'AoA, deg',
    'fuel': 'Mfuel, kg',
}
#: Indicator keys that hold the compass heading, in order of preference.
HEADING_KEYS = ('compass', 'compass1', 'heading')


@dataclass(frozen=True)
class Sample:
    t: float
    ias: float  # m/s
    tas: float  # m/s
    mach: float
    h: float  # m
    ny: float
    aoa: float | None
    fuel: float | None
    heading: float | None  # degrees, unwrapped
    #: Total engine thrust the game reports, newtons (None if not logged).
    thrust_N: float | None = None

    @property
    def energy_height(self) -> float:
        return self.h + self.tas**2 / (2 * G0)


@dataclass(frozen=True)
class Run:
    meta: RunMetadata
    samples: list[Sample]
    #: Samples dropped because the game had not refreshed since the previous one.
    duplicates: int
    errors: int
    #: The game's full-tank fuel mass (`Mfuel0`), the in-game check on the datamine value.
    fuel_capacity_kg: float | None = None

    @property
    def effective_hz(self) -> float:
        if len(self.samples) < 2:
            return 0.0
        return (len(self.samples) - 1) / (self.samples[-1].t - self.samples[0].t)


def _heading(line: dict[str, Any]) -> float | None:
    indicators = line.get('indicators') or {}
    for key in HEADING_KEYS:
        if isinstance(indicators.get(key), int | float):
            return float(indicators[key])
    player = line.get('player') or {}
    dx, dy = player.get('dx'), player.get('dy')
    if isinstance(dx, int | float) and isinstance(dy, int | float) and (dx or dy):
        # Map y grows southwards, so north is −y.
        return math.degrees(math.atan2(dx, -dy)) % 360
    return None


def _thrust(state: dict[str, Any]) -> float | None:
    engines = [v for k, v in state.items() if k.startswith('thrust ') and k.endswith(', kgs')]
    return sum(float(v) for v in engines) * G0 if engines else None


def parse_samples(lines: list[dict[str, Any]]) -> tuple[list[Sample], int, int]:
    samples: list[Sample] = []
    duplicates = errors = 0
    previous_state: dict[str, Any] | None = None
    unwrap = 0.0
    last_raw_heading: float | None = None
    for line in lines:
        state = line.get('state')
        if not state or not state.get('valid', False):
            errors += 1
            continue
        if state == previous_state:
            duplicates += 1
            continue
        previous_state = state
        raw_heading = _heading(line)
        heading = None
        if raw_heading is not None:
            if last_raw_heading is not None:
                step = raw_heading - last_raw_heading
                if step > 180:
                    unwrap -= 360
                elif step < -180:
                    unwrap += 360
            last_raw_heading = raw_heading
            heading = raw_heading + unwrap
        samples.append(
            Sample(
                t=float(line['t']),
                ias=float(state[STATE_KEYS['ias']]) / 3.6,
                tas=float(state[STATE_KEYS['tas']]) / 3.6,
                mach=float(state.get(STATE_KEYS['mach'], math.nan)),
                h=float(state[STATE_KEYS['h']]),
                ny=float(state[STATE_KEYS['ny']]),
                aoa=state.get(STATE_KEYS['aoa']),
                fuel=state.get(STATE_KEYS['fuel']),
                heading=heading,
                thrust_N=_thrust(state),
            )
        )
    return samples, duplicates, errors


def load_run(log_path: Path) -> Run:
    meta_path = log_path.with_name(log_path.name.removesuffix('.jsonl.gz') + '.meta.json')
    meta = RunMetadata.model_validate_json(meta_path.read_text(encoding='utf-8'))
    with gzip.open(log_path, 'rt', encoding='utf-8') as f:
        lines = [json.loads(line) for line in f if line.strip()]
    samples, duplicates, errors = parse_samples(lines)
    capacity = next(
        (float(x['state']['Mfuel0, kg']) for x in lines if 'Mfuel0, kg' in (x.get('state') or {})),
        None,
    )
    return Run(
        meta=meta,
        samples=samples,
        duplicates=duplicates,
        errors=errors,
        fuel_capacity_kg=capacity,
    )


def slope(ts: list[float], ys: list[float]) -> float:
    """Least-squares slope dy/dt."""
    mean_t = statistics.fmean(ts)
    mean_y = statistics.fmean(ys)
    num = sum((t - mean_t) * (y - mean_y) for t, y in zip(ts, ys, strict=True))
    den = sum((t - mean_t) ** 2 for t in ts)
    return num / den if den else 0.0


def rate(samples: list[Sample], index: int, value: str, window_s: float = 1.0) -> float | None:
    """d(value)/dt at sample `index`, from a centred window of `window_s` seconds."""
    centre = samples[index].t
    window = [s for s in samples if abs(s.t - centre) <= window_s / 2]
    if len(window) < 3:
        return None
    ys = [getattr(s, value) for s in window]
    if any(y is None for y in ys):
        return None
    return slope([s.t for s in window], ys)


def specific_excess_power(samples: list[Sample], index: int, window_s: float = 1.0) -> float | None:
    return rate(samples, index, 'energy_height', window_s)


@dataclass(frozen=True)
class Segment:
    """A stretch of steady flight (speed, height and load factor roughly constant)."""

    start: float
    end: float
    ias_kmh: float
    tas_kmh: float
    mach: float
    h_m: float
    ny: float
    ps: float
    #: Measured from heading, or kinematic g·√(n² − 1)/V when the log has no heading.
    turn_rate_degs: float | None
    turn_rate_source: str = 'heading'
    thrust_N: float | None = None

    @property
    def duration(self) -> float:
        return self.end - self.start


def steady_segments(
    samples: list[Sample],
    min_duration_s: float = 5.0,
    max_accel: float = 1.0,  # m/s per s
    max_climb: float = 5.0,  # m/s
    max_ny_spread: float = 0.3,
) -> list[Segment]:
    """Find stretches where speed and height hold steady, e.g. a sustained turn or top speed."""
    segments: list[Segment] = []
    run: list[int] = []

    def close() -> None:
        if run and samples[run[-1]].t - samples[run[0]].t >= min_duration_s:
            part = [samples[i] for i in run]
            ts = [s.t for s in part]
            headings = [s.heading for s in part]
            ny = statistics.fmean(s.ny for s in part)
            tas = statistics.fmean(s.tas for s in part)
            thrusts = [s.thrust_N for s in part]
            if all(h is not None for h in headings):
                turn_rate = abs(slope(ts, [float(h) for h in headings if h is not None]))
                source = 'heading'
            elif ny > 1:
                turn_rate = math.degrees(G0 * math.sqrt(ny * ny - 1) / tas)
                source = 'kinematic (level turn)'
            else:
                turn_rate, source = 0.0, 'kinematic (level turn)'
            segments.append(
                Segment(
                    start=part[0].t,
                    end=part[-1].t,
                    ias_kmh=statistics.fmean(s.ias for s in part) * 3.6,
                    tas_kmh=statistics.fmean(s.tas for s in part) * 3.6,
                    mach=statistics.fmean(s.mach for s in part),
                    h_m=statistics.fmean(s.h for s in part),
                    ny=ny,
                    ps=slope(ts, [s.energy_height for s in part]),
                    turn_rate_degs=turn_rate,
                    turn_rate_source=source,
                    thrust_N=None
                    if any(t is None for t in thrusts)
                    else statistics.fmean(float(t) for t in thrusts if t is not None),
                )
            )
        run.clear()

    for i, sample in enumerate(samples):
        accel = rate(samples, i, 'tas')
        climb = rate(samples, i, 'h')
        steady = (
            accel is not None
            and climb is not None
            and abs(accel) <= max_accel
            and abs(climb) <= max_climb
            and (not run or abs(sample.ny - samples[run[0]].ny) <= max_ny_spread)
        )
        if steady:
            run.append(i)
        else:
            close()
    close()
    return segments


def acceleration_points(samples: list[Sample], ny_tolerance: float = 0.15) -> list[dict[str, Any]]:
    """Card A: Ps at 1 g against speed, one point per second of level, wings-level flight."""
    points: list[dict[str, Any]] = []
    last_t = -math.inf
    for i, s in enumerate(samples):
        if abs(s.ny - 1.0) > ny_tolerance or s.t - last_t < 1.0:
            continue
        ps = specific_excess_power(samples, i, window_s=2.0)
        if ps is None:
            continue
        points.append({
            't': s.t, 'tas_kmh': s.tas * 3.6, 'mach': s.mach, 'h_m': s.h, 'ps': ps,
            'thrust_N': s.thrust_N, 'fuel_kg': s.fuel,
        })  # fmt: skip
        last_t = s.t
    return points


def peak_pull(samples: list[Sample]) -> dict[str, float | None]:
    """Card D: the highest load factor in the log, with the speed and turn rate at that moment."""
    i = max(range(len(samples)), key=lambda k: samples[k].ny)
    s = samples[i]
    turn = rate(samples, i, 'heading', window_s=0.6)
    return {
        't': s.t,
        'ny': s.ny,
        'ias_kmh': s.ias * 3.6,
        'tas_kmh': s.tas * 3.6,
        'mach': s.mach,
        'h_m': s.h,
        'aoa_deg': s.aoa,
        'turn_rate_degs': abs(turn) if turn is not None else None,
    }


def summarise(values: list[float]) -> dict[str, float]:
    """Mean and run-to-run spread (sample standard deviation) of a figure flown several times."""
    return {
        'mean': statistics.fmean(values),
        'spread': statistics.stdev(values) if len(values) > 1 else 0.0,
        'runs': float(len(values)),
    }


def analyse_run(run: Run) -> dict[str, Any]:
    """Everything the test cards need from one run, as plain JSON-friendly data."""
    return {
        'meta': run.meta.model_dump(),
        'samples': len(run.samples),
        'effective_hz': round(run.effective_hz, 2),
        'duplicates': run.duplicates,
        'errors': run.errors,
        'has_heading': all(s.heading is not None for s in run.samples),
        'has_thrust': all(s.thrust_N is not None for s in run.samples),
        'fuel_capacity_kg': run.fuel_capacity_kg,
        'steady_segments': [
            {**segment.__dict__, 'duration': segment.duration}
            for segment in steady_segments(run.samples)
        ],
        'peak_pull': peak_pull(run.samples) if run.samples else None,
        'acceleration': acceleration_points(run.samples),
    }
