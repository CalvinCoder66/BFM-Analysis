"""Milestone 2: the fields that come (almost) straight from the files.

Wing geometry, masses, structural and speed limits, and the instructor / fly-by-wire settings.
War Thunder flight models come in three shapes, all handled here:

- **component**: `Aerodynamics.WingPlane` with its own `Areas` and `Strength` (most modern jets);
- **variable sweep**: `Aerodynamics.WingPlaneSweep0..N`, one wing per sweep position
  (F-14, Tornado);
- **legacy**: top-level `Areas` / `Wingspan`, `Mass.WingCritOverload`, top-level `Vne` / `VneMach`
  (F-4 family, MiG-21).

Each value carries a confidence. *High* means it is read directly; *medium* or *low* means we
made an interpretation that the in-game validation flights must confirm.
"""

from typing import Any, Literal

from pydantic import BaseModel

from ..blkx import get_path

Confidence = Literal['high', 'medium', 'low']
#: Crew mass War Thunder adds per crew member (same value as the community mass calculator).
CREW_MASS_KG = 90.0
#: Values above this in limiter fields are the game's "no limit" sentinel (2147440000).
NO_LIMIT = 1000.0
#: The six panels that make up the wing planform; `Aileron` and `*Cut` are not extra area.
PANELS = ('LeftIn', 'LeftMid', 'LeftOut', 'RightIn', 'RightMid', 'RightOut')


class ExtractionError(ValueError):
    """The flight model does not have a field we need, in any shape we know."""


class Sourced[T](BaseModel):
    value: T
    #: Dotted path(s) in the flight-model or unit file the value came from.
    source: str
    confidence: Confidence = 'high'
    note: str | None = None


class SweepPosition(BaseModel):
    swept_angle_deg: float
    span_m: float
    area_m2: float
    crit_overload_N: tuple[float, float]
    vne_kmh: float
    mne: float


class Instructor(BaseModel):
    crit_mult: list[float] | None
    overload_mult: list[float] | None
    overload_time_range: list[float] | None
    #: Fraction of wing-break G the instructor holds steadily, and allows briefly.
    steady_fraction: float | None
    peak_fraction: float | None


class FlightControl(BaseModel):
    """The game's autopilot / FBW pitch limiter (`Autopilot.Pitch`)."""

    max_g: float | None
    min_g: float | None
    #: 1.0 is a hard limit; lower values limit more softly.
    limiter_strength: float | None
    aoa_limit_deg: float | None


class BasicData(BaseModel):
    fm_format: Literal['component', 'variable_sweep', 'legacy']
    wing_area_m2: Sourced[float]
    wing_span_m: Sourced[float]
    sweep_positions: list[SweepPosition]
    empty_mass_kg: Sourced[float]
    internal_fuel_kg: Sourced[float]
    #: Wing failure load in newtons as stored (`CritOverload` = [negative, positive]).
    crit_overload_N: Sourced[tuple[float, float]]
    #: Our working interpretation: total lift at which the wings fail (stored value × 2).
    wing_break_load_N: Sourced[float]
    vne_kmh: Sourced[float]
    mne: Sourced[float]
    instructor: Sourced[Instructor]
    flight_control: Sourced[FlightControl]


def _need(data: dict[str, Any], path: str, unit_label: str) -> Any:
    try:
        return get_path(data, path)
    except KeyError as error:
        raise ExtractionError(f'{unit_label}: missing {path}') from error


def _panel_area(areas: dict[str, Any], prefix: str = '') -> float:
    return sum(float(areas[f'{prefix}{panel}']) for panel in PANELS)


def detect_format(fm: dict[str, Any]) -> Literal['component', 'variable_sweep', 'legacy']:
    aero = fm.get('Aerodynamics') or {}
    if isinstance(aero.get('WingPlane'), dict):
        return 'component'
    if isinstance(aero.get('WingPlaneSweep0'), dict):
        return 'variable_sweep'
    if isinstance(fm.get('Areas'), dict) and 'WingLeftIn' in fm['Areas']:
        return 'legacy'
    raise ExtractionError('unknown flight-model format (no WingPlane, WingPlaneSweep0 or Areas)')


def _sweep_positions(aero: dict[str, Any]) -> list[SweepPosition]:
    positions: list[SweepPosition] = []
    index = 0
    while isinstance(wing := aero.get(f'WingPlaneSweep{index}'), dict):
        strength = wing['Strength']
        positions.append(
            SweepPosition(
                swept_angle_deg=float(wing['SweptAngle']),
                span_m=float(wing['Span']),
                area_m2=_panel_area(wing['Areas']),
                crit_overload_N=tuple(strength['CritOverload']),
                vne_kmh=float(strength['VNE']),
                mne=float(strength['MNE']),
            )
        )
        index += 1
    return positions


def _instructor(fm: dict[str, Any], unit: dict[str, Any]) -> Sourced[Instructor]:
    block = fm.get('Instructor') or {}
    crit = unit.get('instructorCritMult') or block.get('critMult')
    overload = unit.get('instructorOverloadMult') or block.get('overloadMult')
    sources = [
        'unit.instructorOverloadMult' if unit.get('instructorOverloadMult') else None,
        'fm.Instructor.overloadMult' if block.get('overloadMult') else None,
    ]
    steady = peak = None
    if overload and len(overload) >= 4:
        # Provisional reading of the four-value array: the last pair is the steady limit and the
        # brief overshoot the instructor allows (e.g. [0.6, 0.67, 0.85, 0.92] → 0.85 and 0.92).
        steady, peak = float(overload[2]), float(overload[3])
    elif overload and len(overload) >= 2:
        steady, peak = float(overload[0]), float(overload[1])
    return Sourced(
        value=Instructor(
            crit_mult=crit,
            overload_mult=overload,
            overload_time_range=block.get('overloadTimeRange'),
            steady_fraction=steady,
            peak_fraction=peak,
        ),
        source=', '.join(s for s in sources if s) or 'none (game default unknown)',
        confidence='low',
        note='Not yet mapped: the Typhoon (0.90 / 1.05) held about 1.0 × the wing-break load '
        'for up to 8 s, matching neither fraction. A second aircraft is needed.',
    )


def _flight_control(fm: dict[str, Any]) -> Sourced[FlightControl]:
    pitch = (fm.get('Autopilot') or {}).get('Pitch') or {}
    load = pitch.get('RateMaxLoadFactorMax')
    aoa = pitch.get('AoaLimits')

    def limit(value: float | None) -> float | None:
        return None if value is None or abs(value) > NO_LIMIT else float(value)

    return Sourced(
        value=FlightControl(
            max_g=limit(load[1]) if load else None,
            min_g=limit(load[0]) if load else None,
            limiter_strength=pitch.get('LoadFactorLimiterStrengthMax'),
            aoa_limit_deg=float(aoa[1]) if aoa else None,
        ),
        source='fm.Autopilot.Pitch',
        confidence='medium',
        note='Treated as a hard G limit only when limiter_strength is 1.0 (the F-16).',
    )


def extract_basic(fm: dict[str, Any], unit: dict[str, Any], label: str) -> BasicData:
    fm_format = detect_format(fm)
    aero = fm.get('Aerodynamics') or {}
    positions: list[SweepPosition] = []

    if fm_format == 'component':
        wing = aero['WingPlane']
        area = Sourced(value=_panel_area(_need(wing, 'Areas', label)), source='WingPlane.Areas')
        span = Sourced(value=float(_need(wing, 'Span', label)), source='WingPlane.Span')
        strength = _need(wing, 'Strength', label)
        crit = Sourced(
            value=tuple(strength['CritOverload']), source='WingPlane.Strength.CritOverload'
        )
        vne = Sourced(value=float(strength['VNE']), source='WingPlane.Strength.VNE')
        mne = Sourced(value=float(strength['MNE']), source='WingPlane.Strength.MNE')
    elif fm_format == 'variable_sweep':
        positions = _sweep_positions(aero)
        forward, back = positions[0], positions[-1]
        note = 'Variable sweep: reference wing is fully forward; limits vary with sweep.'
        area = Sourced(
            value=forward.area_m2, source='WingPlaneSweep0.Areas', confidence='medium', note=note
        )
        span = Sourced(value=forward.span_m, source='WingPlaneSweep0.Span', confidence='medium')
        weakest = min(positions, key=lambda p: p.crit_overload_N[1])
        crit = Sourced(
            value=weakest.crit_overload_N,
            source='WingPlaneSweepN.Strength.CritOverload (weakest position)',
            confidence='low',
            note=note,
        )
        vne = Sourced(value=back.vne_kmh, source='WingPlaneSweepN.Strength.VNE (fully swept)')
        mne = Sourced(value=back.mne, source='WingPlaneSweepN.Strength.MNE (fully swept)')
    else:
        areas = fm['Areas']
        area = Sourced(value=_panel_area(areas, prefix='Wing'), source='Areas.Wing*')
        span = Sourced(value=float(_need(fm, 'Wingspan', label)), source='Wingspan')
        crit = Sourced(
            value=tuple(_need(fm, 'Mass.WingCritOverload', label)), source='Mass.WingCritOverload'
        )
        vne = Sourced(value=float(_need(fm, 'Vne', label)), source='Vne')
        mne = Sourced(value=float(_need(fm, 'VneMach', label)), source='VneMach')

    mass = _need(fm, 'Mass', label)
    crew = int(fm.get('Crew', 1))
    empty = (
        float(_need(mass, 'EmptyMass', label))
        + float(mass.get('OilMass', 0.0))
        + float(mass.get('MaxNitro', 0.0))
        + CREW_MASS_KG * crew
    )
    fuel_key = 'MaxFuelMass0' if 'MaxFuelMass0' in mass else 'MaxFuelMass'
    return BasicData(
        fm_format=fm_format,
        wing_area_m2=area,
        wing_span_m=span,
        sweep_positions=positions,
        empty_mass_kg=Sourced(
            value=empty,
            source='Mass.EmptyMass + OilMass + MaxNitro + 90 kg × Crew',
            confidence='medium',
            note='Gun ammunition is added with the loadouts (milestone 6).',
        ),
        internal_fuel_kg=Sourced(
            value=float(_need(mass, fuel_key, label)),
            source=f'Mass.{fuel_key}',
            confidence='high',
            note="Matches the game's own full-tank mass (telemetry Mfuel0: 7,110 kg for the "
            'Typhoon FGR.4), even where it is higher than published figures.',
        ),
        crit_overload_N=crit,
        wing_break_load_N=Sourced(
            value=2 * float(crit.value[1]),
            source=f'2 × {crit.source}[1]',
            confidence='medium',
            note='Typhoon FGR.4 flights: with the instructor on, the load held at maximum G was '
            '0.98–1.04 × this value (1.59–1.68 MN) across masses of 12.9–15.6 t, so G limit = '
            'this load / weight. One aircraft so far.',
        ),
        vne_kmh=vne,
        mne=mne,
        instructor=_instructor(fm, unit),
        flight_control=_flight_control(fm),
    )
