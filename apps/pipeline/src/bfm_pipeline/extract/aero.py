"""Milestone 5: whole-aircraft lift and drag (CLmax, CD0 and k per Mach) from the polar blocks.

The polar maths follows Gaijin's open-source Dagor Engine, which ships the flight model's polar
code (`prog/gameLibs/gamePhys/common/polares.cpp`):

- Each surface has a lift curve: linear (`Cl0` + `lineClCoeff`·α, α in degrees) up to
  α_line = 2·(ClCrit − Cl0) / slope − αcrit, then a parabola that peaks at (`alphaCritHigh`,
  `ClCritHigh`).
- Drag is `CdMin` + k·(Cl0 + slope·α)², with k = 1 / (π·e·b²/S) from `OswaldsEfficiencyNumber`,
  the surface's span and area, plus `CxAfterCoeff` per degree past the critical angle.
- With `MachFactor` 3, seven Mach curves multiply: 1 `CdMin`, 2 lift slope, 3 `ClCrit`,
  4 `alphaCritHigh`, 5 k, 6 aerodynamic centre (unused here), 7 `Cl0`. Each is 1 below `MachCritN`,
  a cubic from (MachCrit, 1, slope 0) to (`MachMaxN`, `MultMachMaxN`, slope `MultLineCoeffN`), then
  a straight line clamped at `MultLimitN`.

How the game adds the surfaces up is not public. The Typhoon FGR.4 flights (docs/FINDINGS.md)
fit a simple reduction: **lift comes from the wing polar alone**, and drag is the wing's polar
plus the `CdMin` of the fuselage, stabiliser and fin, each scaled by its area. Adding the
fuselage's lift and induced drag overstates both by 15–30%. Reference area is the wing.

The usable lift is capped by the instructor's angle-of-attack limit. The Typhoon held 25–26.5°,
which matches `Autopilot.Pitch.AoaLimits` × (1 + `AoaLimitsMargin` %) = 21° × 1.2 = 25.2°; that
reading is applied to every aircraft that has the block, and is unconfirmed beyond the Typhoon.
"""

from itertools import pairwise
from typing import Any

from pydantic import BaseModel

from .basic import NO_LIMIT, PANELS, ExtractionError, Sourced, detect_format

MACHS = [round(0.1 * i, 1) for i in range(25)]
#: Mach curves, numbered as in the files (index 0 is curve 1).
CX0, CL_SLOPE, CL_CRIT, AOA_CRIT, INDUCED, AER_CENTRE, CL0 = range(7)
#: Value of each curve below its critical Mach.
PRE_CRIT = (1.0, 1.0, 1.0, 1.0, 1.0, 0.0, 1.0)
ADVANCED = 3


class MachCurve(BaseModel):
    crit: float
    max: float
    mult_max: float
    line: float
    limit: float

    def value(self, mach: float, pre: float) -> float:
        if mach < self.crit:
            return pre
        if mach > self.max:
            v = self.mult_max + self.line * (mach - self.max)
            return min(v, self.limit) if self.line >= 0 else max(v, self.limit)
        h = self.max - self.crit
        if h <= 0:
            return pre
        # Cubic Hermite: F(crit) = pre, F'(crit) = 0, F(max) = mult_max, F'(max) = line.
        t = (mach - self.crit) / h
        return (
            pre * (2 * t**3 - 3 * t**2 + 1)
            + self.mult_max * (-2 * t**3 + 3 * t**2)
            + self.line * h * (t**3 - t**2)
        )


class Polar(BaseModel):
    """One surface's polar, as read from the file (angles in degrees)."""

    area_m2: float
    span_m: float
    oswald: float
    cl_slope: float
    cl0: float
    aoa_crit: float
    cl_crit: float
    cd_min: float
    cd_after: float
    combined_cl: bool
    mach_curves: list[MachCurve] | None  # None: no Mach effects (MachFactor other than 3)

    def factor(self, mach: float, curve: int) -> float:
        if self.mach_curves is None:
            return PRE_CRIT[curve]
        return self.mach_curves[curve].value(mach, PRE_CRIT[curve])

    def at(self, mach: float) -> PolarAtMach:
        f = [self.factor(mach, i) for i in range(7)]
        slope = self.cl_slope * ((1 + f[CX0] - f[CL_SLOPE]) if self.combined_cl else f[CL_SLOPE])
        cl0 = self.cl0 * f[CL0]
        aspect = self.span_m**2 / self.area_m2
        return PolarAtMach(
            cd0=self.cd_min * f[CX0],
            slope=slope,
            cl0=cl0,
            cl_crit=self.cl0 + (self.cl_crit - cl0) * f[CL_CRIT],
            aoa_crit=self.aoa_crit * f[AOA_CRIT],
            k=f[INDUCED] / (3.141592653589793 * self.oswald * aspect),
            cd_after=self.cd_after,
        )


class PolarAtMach(BaseModel):
    cd0: float
    slope: float
    cl0: float
    cl_crit: float
    aoa_crit: float
    k: float
    cd_after: float

    @property
    def aoa_line(self) -> float:
        return 2 * (self.cl_crit - self.cl0) / self.slope - self.aoa_crit

    def cl(self, aoa: float) -> float:
        """Lift coefficient up to the critical angle (held at its peak beyond it)."""
        line = self.aoa_line
        if aoa <= line:
            return self.cl0 + self.slope * aoa
        aoa = min(aoa, self.aoa_crit)
        parab = (self.cl_crit - (self.cl0 + line * self.slope)) / (self.aoa_crit - line) ** 2
        return self.cl_crit - parab * (self.aoa_crit - aoa) ** 2

    def cd(self, aoa: float) -> float:
        linear_cl = self.cl0 + self.slope * aoa
        drag = self.cd0 + self.k * linear_cl**2
        if aoa > self.aoa_crit:
            drag += self.cd_after * (aoa - self.aoa_crit)
        return drag


class AeroTable(BaseModel):
    mach: list[float]
    cl_max: list[float]
    cd0: list[float]
    k: list[float]
    #: Body angle of attack the instructor allows, degrees (None: the wing's own stall angle).
    aoa_limit_deg: float | None
    #: Wing incidence relative to the body axis, degrees.
    wing_incidence_deg: float
    wing: Polar
    #: Fuselage, stabiliser and fin: only their `CdMin` (with Mach curve 1) is used.
    parasites: list[Polar]


def _curves(block: dict[str, Any]) -> list[MachCurve] | None:
    if block.get('MachFactor') != ADVANCED:
        return None
    return [
        MachCurve(
            crit=float(block.get(f'MachCrit{n}', 0.0)),
            max=float(block.get(f'MachMax{n}', 0.0)),
            mult_max=float(block.get(f'MultMachMax{n}', PRE_CRIT[n - 1])),
            line=float(block.get(f'MultLineCoeff{n}', 0.0)),
            limit=float(block.get(f'MultLimit{n}', PRE_CRIT[n - 1])),
        )
        for n in range(1, 8)
    ]


def parse_polar(
    shape: dict[str, Any], values: dict[str, Any], span: float, area: float, label: str
) -> Polar:
    """`shape` holds the slope, Oswald number and Mach curves; `values` Cl0, αcrit, ClCrit, CdMin.

    In component flight models both live in one block (`FlapsPolar0`, `Polar`); legacy ones split
    them between `Aerodynamics` and `Aerodynamics.NoFlaps`.
    """
    try:
        return Polar(
            area_m2=area,
            span_m=span,
            oswald=float(shape['OswaldsEfficiencyNumber']),
            cl_slope=float(shape['lineClCoeff']),
            cl0=float(values.get('Cl0', 0.0)),
            aoa_crit=float(values['alphaCritHigh']),
            cl_crit=float(values['ClCritHigh']),
            cd_min=float(values['CdMin']),
            cd_after=float(shape.get('CxAfterCoeff', 0.01)),
            combined_cl=bool(shape.get('CombinedCl', True)),
            mach_curves=_curves(shape),
        )
    except KeyError as error:
        raise ExtractionError(f'{label}: polar is missing {error}') from error


def _surface(aero: dict[str, Any], name: str, label: str) -> Polar | None:
    plane = aero.get(name)
    if not isinstance(plane, dict) or not isinstance(plane.get('Polar'), dict):
        return None
    area = sum(float(v) for v in (plane.get('Areas') or {}).values())
    if area <= 0:
        return None
    return parse_polar(plane['Polar'], plane['Polar'], float(plane.get('Span', 1.0)), area, label)


def _sweep_fraction(aero: dict[str, Any], mach: float) -> float:
    """Automatic wing sweep against Mach (`SweepAxisByMachAuto*` = [Mach, ?, sweep, ?]).

    Read as: the third value is the sweep from fully forward (0) to fully back (1), interpolated
    linearly in Mach. Unvalidated.
    """
    points = []
    index = 0
    while isinstance(row := aero.get(f'SweepAxisByMachAuto{index}'), list):
        points.append((float(row[0]), float(row[2])))
        index += 1
    if not points:
        return 0.0
    if mach <= points[0][0]:
        return points[0][1]
    for (m0, s0), (m1, s1) in pairwise(points):
        if mach <= m1:
            return s0 + (s1 - s0) * (mach - m0) / (m1 - m0)
    return points[-1][1]


def _lerp_polar(a: Polar, b: Polar, k: float) -> Polar:
    """Blend two sweep positions' polars, as the game's `interpolate()` does field by field."""

    def mix(x: float, y: float) -> float:
        return x + (y - x) * k

    curves = None
    if a.mach_curves and b.mach_curves:
        curves = [
            MachCurve(**{f: mix(getattr(ca, f), getattr(cb, f)) for f in MachCurve.model_fields})
            for ca, cb in zip(a.mach_curves, b.mach_curves, strict=True)
        ]
    return Polar(
        **{
            f: mix(getattr(a, f), getattr(b, f))
            for f in Polar.model_fields
            if f not in ('combined_cl', 'mach_curves')
        },
        combined_cl=a.combined_cl if k < 0.5 else b.combined_cl,
        mach_curves=curves if curves else (a.mach_curves if k < 0.5 else b.mach_curves),
    )


def _aoa_limit(fm: dict[str, Any]) -> float | None:
    pitch = (fm.get('Autopilot') or {}).get('Pitch') or {}
    limits = pitch.get('AoaLimits')
    if not limits or abs(float(limits[1])) > NO_LIMIT:
        return None
    return float(limits[1]) * (1 + float(pitch.get('AoaLimitsMargin', 0.0)) / 100)


def extract_aero(fm: dict[str, Any], label: str) -> Sourced[AeroTable]:
    fm_format = detect_format(fm)
    aero = fm.get('Aerodynamics') or {}
    parasites: list[Polar] = []
    sweep: list[Polar] = []
    if fm_format == 'legacy':
        areas = fm['Areas']
        area = sum(float(areas[f'Wing{p}']) for p in PANELS)
        wing = parse_polar(aero, aero.get('NoFlaps') or {}, float(fm['Wingspan']), area, label)
        incidence = 0.0
        extra = {
            'Fuselage': area,  # no fuselage area in legacy files; assume wing-referenced
            'Stab': float(areas.get('Stabilizer', 0)) + float(areas.get('Elevator', 0)),
            'Fin': float(areas.get('Keel', 0)) + float(areas.get('Rudder', 0)),
        }
        for name, s in extra.items():
            if isinstance(block := aero.get(name), dict) and s > 0:
                parasites.append(parse_polar(block, block, 1.0, s, label))
        source = 'Aerodynamics (+ NoFlaps, Fuselage, Stab, Fin)'
    else:
        planes = (
            [aero['WingPlane']]
            if fm_format == 'component'
            else [
                aero[f'WingPlaneSweep{i}']
                for i in range(10)
                if isinstance(aero.get(f'WingPlaneSweep{i}'), dict)
            ]
        )
        for plane in planes:
            area = sum(float(plane['Areas'][p]) for p in PANELS)
            polar = plane.get('FlapsPolar0')
            if not isinstance(polar, dict):
                raise ExtractionError(f'{label}: wing has no FlapsPolar0')
            sweep.append(parse_polar(polar, polar, float(plane['Span']), area, label))
        wing = sweep[0]
        incidence = float(planes[0].get('Angle', 0.0))
        for name in ('FuselagePlane', 'HorStabPlane', 'VerStabPlane'):
            if surface := _surface(aero, name, label):
                parasites.append(surface)
        source = (
            'WingPlane.FlapsPolar0' if fm_format == 'component' else 'WingPlaneSweepN.FlapsPolar0'
        ) + ', FuselagePlane / HorStabPlane / VerStabPlane CdMin, Autopilot.Pitch.AoaLimits'

    aoa_limit = _aoa_limit(fm)
    cl_max, cd0, k = [], [], []
    for mach in MACHS:
        surface = wing
        if len(sweep) > 1:
            position = _sweep_fraction(aero, mach) * (len(sweep) - 1)
            i = min(int(position), len(sweep) - 2)
            surface = _lerp_polar(sweep[i], sweep[i + 1], position - i)
        w = surface.at(mach)
        wing_aoa = w.aoa_crit if aoa_limit is None else min(aoa_limit + incidence, w.aoa_crit)
        cl_max.append(round(w.cl(wing_aoa), 4))
        parasite = sum(p.at(mach).cd0 * p.area_m2 for p in parasites) / surface.area_m2
        cd0.append(round(w.cd0 + parasite, 5))
        k.append(round(w.k, 4))

    return Sourced(
        value=AeroTable(
            mach=MACHS,
            cl_max=cl_max,
            cd0=cd0,
            k=k,
            aoa_limit_deg=aoa_limit,
            wing_incidence_deg=incidence,
            wing=wing,
            parasites=parasites,
        ),
        source=source,
        confidence='low',
        note='Polar maths from the Dagor Engine source; lift from the wing alone and the '
        'angle-of-attack limit (AoaLimits × margin) fitted to the Typhoon FGR.4 flights only. '
        + {
            'component': '',
            'variable_sweep': 'Sweep schedule reading is unvalidated. ',
            'legacy': 'Legacy layout: fuselage drag assumed wing-referenced. ',
        }[fm_format],
    )
