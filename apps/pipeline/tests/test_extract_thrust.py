"""Thrust extraction: hand-worked grid values, and the Typhoon FGR.4's logged thrust."""

import gzip
import json
import statistics
from pathlib import Path

import pytest

from bfm_pipeline.extract.basic import ExtractionError
from bfm_pipeline.extract.thrust import extract_thrust, parse_engine_type

G0 = 9.80665
TESTS = Path(__file__).parent
TYPHOON = json.loads((TESTS / 'fixtures/ef_2000_fgr4_engines.json').read_text(encoding='utf-8'))
FLIGHTS = TESTS.parent / 'validation/flights/2.59.0.65/ef_2000_fgr4'


def test_thrust_at_a_grid_node_follows_the_game_formula() -> None:
    engine = parse_engine_type(TYPHOON['EngineType0'], 'typhoon')
    # 3,000 m and 1,400 km/h TAS is grid node (1, 7): ThrustMaxCoeff 0.88, ThrAftMaxCoeff 1.41.
    # Military: 5,800 kgf × 0.88 = 5,104 kgf.
    # Afterburner: 5,104 × 1.41 × 1.3 (Mode5 ThrustMult) × 1.15 (AfterburnerBoost) = 10,759 kgf.
    assert engine.thrust_N(3000, 1400, afterburner=False) == pytest.approx(5104 * G0)
    assert engine.thrust_N(3000, 1400, afterburner=True) == pytest.approx(10_759 * G0, rel=1e-4)
    # Halfway between nodes (0, 6), (0, 7), (1, 6), (1, 7): mean of 1.02, 1.04, 0.84, 0.88.
    assert engine.thrust_N(1500, 1300, afterburner=False) == pytest.approx(5800 * 0.945 * G0)


def test_table_totals_both_engines_and_converts_mach_with_isa() -> None:
    table = extract_thrust(TYPHOON, 'typhoon').value
    assert table.engines == 2
    assert table.has_afterburner
    # Static at sea level every coefficient is 1.0: 2 × 5,800 kgf, and × 1.3 × 1.15 in reheat.
    assert table.military_N[0][0] == pytest.approx(2 * 5800 * G0, abs=1)
    assert table.afterburner_N[0][0] == pytest.approx(2 * 5800 * 1.3 * 1.15 * G0, abs=1)
    # Mach 1.0 at sea level is 1,225 km/h TAS (ISA), between the 1,200 and 1,400 km/h columns:
    # coefficient 1.02 + (1.04 − 1.02) × 25 / 200 = 1.0225.
    mach1 = table.mach.index(1.0)
    assert table.military_N[0][mach1] == pytest.approx(2 * 5800 * 1.0225 * G0, rel=2e-4)


def test_lift_jets_are_not_counted_as_thrust_but_vectoring_nozzles_are() -> None:
    # The Yak-141's lift engines point 76° up; only the main engine pushes the jet forward.
    yak = {**TYPHOON, 'Engine1': {'Type': 0, 'Nozzle0': {'Direction': [0.0, 76.0]}}}
    assert extract_thrust(yak, 'yak').value.engines == 1
    # The Su-30SM's nozzles are mounted 4° off axis and vector ±15° in pitch: still thrust.
    vectoring = {
        'Type': 0,
        'Nozzle0': {
            'Direction': [2.0, 4.0],
            'HasThrustVecMainControlsMode': True,
            'ElevatorToThrustDeflection0': [550.0, 15.0, 0.0, -15.0],
        },
    }
    su30 = {**TYPHOON, 'Engine0': vectoring, 'Engine1': vectoring}
    assert extract_thrust(su30, 'su_30sm').value.engines == 2


def test_rejects_an_engine_without_a_thrust_grid() -> None:
    with pytest.raises(ExtractionError, match='ThrustMax'):
        parse_engine_type({'Main': {'Type': 'Jet'}}, 'broken')


def _logged_vs_model(afterburner: bool, max_aoa: float = 90.0) -> list[float]:
    """Logged engine thrust ÷ model thrust, for every steady full-power sample in the flights."""
    engine = parse_engine_type(TYPHOON['EngineType0'], 'typhoon')
    throttle = 110 if afterburner else 100
    ratios = []
    for log in sorted(FLIGHTS.rglob('*.jsonl.gz')):
        with gzip.open(log, 'rt', encoding='utf-8') as f:
            states = [s for line in f if (s := json.loads(line).get('state'))]
        # Skip engine spool-up: the throttle must have been at this setting for 5 samples.
        for before, s in zip(states, states[5:], strict=False):
            if before['throttle 1, %'] != throttle or s['throttle 1, %'] != throttle:
                continue
            if s['AoA, deg'] > max_aoa:
                continue
            model = engine.thrust_N(s['H, m'], s['TAS, km/h'], afterburner) / G0
            ratios.append(s['thrust 1, kgs'] / model)
    return ratios


def test_matches_the_typhoons_logged_military_thrust() -> None:
    ratios = _logged_vs_model(afterburner=False)
    assert len(ratios) > 1000
    assert statistics.median(ratios) == pytest.approx(1.0, abs=0.015)
    assert sum(abs(r - 1) < 0.03 for r in ratios) / len(ratios) > 0.9


def test_matches_the_typhoons_logged_afterburner_thrust() -> None:
    # Above about 10° angle of attack the logged afterburner thrust falls a few per cent below
    # the grid (docs/FINDINGS.md), so this checks the grid where the game applies it directly.
    ratios = _logged_vs_model(afterburner=True, max_aoa=10.0)
    assert len(ratios) > 1000
    assert statistics.median(ratios) == pytest.approx(1.0, abs=0.015)
    assert sum(abs(r - 1) < 0.03 for r in ratios) / len(ratios) > 0.9
