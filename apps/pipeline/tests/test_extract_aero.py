"""Lift and drag extraction: the polar maths by hand, and the Typhoon FGR.4's flights."""

import json
import math
import statistics
from pathlib import Path

import pytest

from bfm_pipeline.extract.aero import AeroTable, MachCurve, extract_aero
from bfm_pipeline.isa import G0, density
from bfm_pipeline.telemetry.analysis import load_run, specific_excess_power

TESTS = Path(__file__).parent
TYPHOON = json.loads((TESTS / 'fixtures/ef_2000_fgr4_aero.json').read_text(encoding='utf-8'))
FLIGHTS = TESTS.parent / 'validation/flights/2.59.0.65/ef_2000_fgr4'
#: Datamine empty mass (EmptyMass + oil + crew); the logs give the fuel on board.
TYPHOON_EMPTY_KG = 11_340
WING_AREA = 51.4


def test_mach_curve_meets_its_end_conditions_and_clamps() -> None:
    curve = MachCurve(crit=0.5, max=1.0, mult_max=1.2, line=0.1, limit=1.3)
    assert curve.value(0.4, pre=1.0) == 1.0
    assert curve.value(0.5, pre=1.0) == pytest.approx(1.0)
    assert curve.value(1.0, pre=1.0) == pytest.approx(1.2)

    def slope(m: float) -> float:
        return (curve.value(m + 1e-6, 1.0) - curve.value(m - 1e-6, 1.0)) / 2e-6

    assert slope(0.5 + 1e-5) == pytest.approx(0.0, abs=1e-3)  # flat where it leaves 1
    assert slope(1.0 - 1e-5) == pytest.approx(0.1, abs=1e-3)  # meets the straight line
    assert curve.value(1.5, pre=1.0) == pytest.approx(1.25)  # 1.2 + 0.1 × 0.5
    assert curve.value(3.0, pre=1.0) == pytest.approx(1.3)  # clamped at the limit
    falling = MachCurve(crit=0.5, max=1.0, mult_max=0.8, line=-0.5, limit=0.4)
    assert falling.value(3.0, pre=1.0) == pytest.approx(0.4)


def test_typhoon_tables_at_low_mach_by_hand() -> None:
    table = extract_aero(TYPHOON, 'typhoon').value
    m03 = table.mach.index(0.3)
    # AoA limit: AoaLimits 21° × (1 + 20%) = 25.2°, plus 0.7° wing incidence = 25.9° on the wing.
    assert table.aoa_limit_deg == pytest.approx(25.2)
    # Wing polar below every critical Mach: linear to α_line = 2 × (1.4 − 0.02) / 0.046 − 37 = 23°,
    # then CL = 1.4 − c·(37 − α)² with c = (1.4 − (0.02 + 0.046 × 23)) / 14² = 0.0016429.
    assert table.cl_max[m03] == pytest.approx(1.4 - 0.0016429 * (37 - 25.9) ** 2, abs=1e-4)
    # CD0: wing 0.0075 + fuselage 0.007 × 51.5 + stabiliser 0.007 × 3.6 + fin 0.008 × 10, ÷ 51.4.
    expected_cd0 = 0.0075 + (0.007 * 51.5 + 0.007 * 3.6 + 0.008 * 10) / 51.4
    assert table.cd0[m03] == pytest.approx(expected_cd0, abs=1e-5)
    # k = F5 / (π × 0.5 × 11² / 51.4); at Mach 0.3 the induced-drag curve (crit 0.25, max 0.65,
    # 0.7, slope 0.4) is at t = 0.125 of its cubic: 0.957031 + 0.7 × 0.042969 − 0.16 × 0.013672.
    f5 = 0.957031 + 0.7 * 0.042969 - 0.4 * 0.4 * 0.013672
    assert table.k[m03] == pytest.approx(f5 / (math.pi * 0.5 * 11**2 / 51.4), abs=1e-4)


def _model(table: AeroTable, mach: float, aoa: float) -> tuple[float, float]:
    """Whole-aircraft CL and CD at a body angle of attack."""
    wing = table.wing.at(mach)
    wing_aoa = aoa + table.wing_incidence_deg
    parasite = sum(p.at(mach).cd0 * p.area_m2 for p in table.parasites) / table.wing.area_m2
    return wing.cl(wing_aoa), wing.cd(wing_aoa) + parasite


@pytest.fixture(scope='module')
def measured() -> dict[str, list[float]]:
    """Measured ÷ modelled lift and drag over every sample of the 25 Typhoon flights.

    Lift: normal-force coefficient from the load factor, n·W / (q·S), against CL·cos α + CD·sin α.
    Drag: from the logged thrust and the energy rate, D = T·cos α − W·Ps / V.
    """
    table = extract_aero(TYPHOON, 'typhoon').value
    out: dict[str, list[float]] = {'lift': [], 'cd0': [], 'cd_high_cl': [], 'aoa_plateau': []}
    for log in sorted(FLIGHTS.glob('*.jsonl.gz')):
        samples = load_run(log).samples
        aoas = sorted(s.aoa for s in samples if s.aoa is not None)
        if log.name[0] in 'CDE' and aoas[-1] > 24:  # runs that reached the AoA limit
            out['aoa_plateau'].append(aoas[int(0.95 * len(aoas))])
        for i, s in enumerate(samples):
            if s.aoa is None or s.fuel is None:
                continue
            weight = (TYPHOON_EMPTY_KG + s.fuel) * G0
            q = 0.5 * density(s.h) * s.tas**2
            cl, cd = _model(table, s.mach, s.aoa)
            a = math.radians(s.aoa)
            measured_cn = s.ny * weight / (q * WING_AREA)
            if 10 <= s.aoa <= 20 and 0.35 <= s.mach <= 0.95:
                out['lift'].append(measured_cn / (cl * math.cos(a) + cd * math.sin(a)))
            ps = specific_excess_power(samples, i)
            if s.thrust_N is None or ps is None:
                continue
            measured_cd = (s.thrust_N * math.cos(a) - weight * ps / s.tas) / (q * WING_AREA)
            if abs(measured_cn) < 0.12 and s.mach >= 0.6:
                out['cd0'].append(measured_cd / cd)
            if 0.6 <= measured_cn <= 1.2 and s.mach <= 0.95:
                out['cd_high_cl'].append(measured_cd / cd)
    return out


def test_wing_polar_matches_the_typhoons_lift(measured: dict[str, list[float]]) -> None:
    ratios = measured['lift']
    assert len(ratios) > 500
    assert statistics.median(ratios) == pytest.approx(1.0, abs=0.05)


def test_aoa_limit_matches_where_the_typhoons_pulls_level_off(
    measured: dict[str, list[float]],
) -> None:
    plateaus = measured['aoa_plateau']
    assert len(plateaus) >= 10
    assert statistics.median(plateaus) == pytest.approx(25.2, abs=1.0)


def test_zero_lift_drag_matches_the_typhoons_acceleration(measured: dict[str, list[float]]) -> None:
    # Measured CD0 runs about 5% above the summed CdMin across Mach 0.6–1.45.
    ratios = measured['cd0']
    assert len(ratios) > 500
    assert statistics.median(ratios) == pytest.approx(1.05, abs=0.05)


def test_drag_under_load_matches_the_typhoons_turns(measured: dict[str, list[float]]) -> None:
    ratios = measured['cd_high_cl']
    assert len(ratios) > 500
    assert statistics.median(ratios) == pytest.approx(1.0, abs=0.08)
