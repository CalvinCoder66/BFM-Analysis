"""Basic-field extraction against excerpts of real flight models (values copied from 2.59.0.65)."""

import pytest

from bfm_pipeline.extract.basic import CREW_MASS_KG, ExtractionError, detect_format, extract_basic

F16C_FM = {
    'Crew': 1,
    'Aerodynamics': {
        'WingPlane': {
            'Span': 9.44,
            'Areas': {
                'LeftIn': 3.65, 'LeftMid': 4.65, 'LeftOut': 5.65,
                'RightIn': 3.65, 'RightMid': 4.65, 'RightOut': 5.65, 'Aileron': 0.5,
            },
            'Strength': {'CritOverload': [-400000.0, 770000.0], 'VNE': 1555.0, 'MNE': 2.2},
        }
    },
    'Mass': {'EmptyMass': 9031.0, 'MaxFuelMass0': 6398.0, 'OilMass': 30.0, 'MaxNitro': 0.0},
    'Instructor': {
        'critMult': [0.86, 0.86],
        'overloadMult': [0.85, 0.92, 0.85, 0.92],
        'overloadTimeRange': [0.9, 1.0],
    },
    'Autopilot': {
        'Pitch': {
            'RateMaxLoadFactorMax': [-5.0, 10.0],
            'AoaLimits': [-15.0, 21.0],
            'LoadFactorLimiterStrengthMax': 1.0,
        }
    },
}  # fmt: skip
F16C_UNIT = {'instructorCritMult': [0.8, 0.8], 'instructorOverloadMult': [0.6, 0.67, 0.85, 0.92]}

F4J_FM = {
    'Crew': 2,
    'Wingspan': 11.7,
    'Vne': 1458.0,
    'VneMach': 2.45,
    'Areas': {
        'WingLeftIn': 8.2, 'WingLeftMid': 8.2, 'WingLeftOut': 8.2,
        'WingRightIn': 8.2, 'WingRightMid': 8.2, 'WingRightOut': 8.2,
        'Aileron': 4.0, 'WingLeftCut': 0.35, 'WingRightCut': 0.35,
    },
    'Aerodynamics': {'lineClCoeff': 0.08},
    'Mass': {
        'EmptyMass': 13990.0, 'MaxFuelMass': 7740.0, 'OilMass': 35.0, 'MaxNitro': 0.0,
        'WingCritOverload': [-400000.0, 1105000.0],
    },
}  # fmt: skip


def sweep(span: float, angle: float, areas: tuple, crit: float, vne: float, mne: float) -> dict:
    inner, mid, outer = areas
    return {
        'Span': span,
        'SweptAngle': angle,
        'Areas': {
            'LeftIn': inner, 'LeftMid': mid, 'LeftOut': outer,
            'RightIn': inner, 'RightMid': mid, 'RightOut': outer, 'Aileron': 1.5,
        },
        'Strength': {'CritOverload': [-295000.0, crit], 'VNE': vne, 'MNE': mne},
    }  # fmt: skip


TORNADO_FM = {
    'Crew': 2,
    'Aerodynamics': {
        'WingPlaneSweep0': sweep(13.91, 25.0, (8.0, 4.0, 3.0), 820000.0, 972.0, 0.85),
        'WingPlaneSweep1': sweep(11.0, 45.0, (8.0, 3.5, 2.5), 850000.0, 1230.0, 1.68),
        'WingPlaneSweep2': sweep(8.56, 67.0, (8.0, 3.0, 2.0), 926000.0, 1555.0, 2.32),
    },
    'Mass': {'EmptyMass': 14443.0, 'MaxFuelMass0': 7430.0, 'OilMass': 36.0, 'MaxNitro': 0.0},
}


def test_component_format_reads_the_wing_plane() -> None:
    data = extract_basic(F16C_FM, F16C_UNIT, 'f_16c_block_50')
    assert data.fm_format == 'component'
    # 2 × (3.65 + 4.65 + 5.65); the aileron entry is not extra planform area.
    assert data.wing_area_m2.value == pytest.approx(27.9)
    assert data.wing_area_m2.confidence == 'high'
    assert data.wing_span_m.value == 9.44
    assert data.empty_mass_kg.value == pytest.approx(9031 + 30 + CREW_MASS_KG)
    assert data.internal_fuel_kg.value == 6398
    assert data.crit_overload_N.value == (-400000.0, 770000.0)
    assert data.wing_break_load_N.value == 1_540_000
    assert data.wing_break_load_N.confidence == 'medium'
    assert (data.vne_kmh.value, data.mne.value) == (1555, 2.2)


def test_unit_file_instructor_settings_override_the_flight_model() -> None:
    data = extract_basic(F16C_FM, F16C_UNIT, 'f_16c_block_50')
    instructor = data.instructor.value
    assert instructor.overload_mult == [0.6, 0.67, 0.85, 0.92]
    assert instructor.crit_mult == [0.8, 0.8]
    assert (instructor.steady_fraction, instructor.peak_fraction) == (0.85, 0.92)
    assert data.instructor.source.startswith('unit.instructorOverloadMult')

    fm_only = extract_basic(F16C_FM, {}, 'f_16c_block_50').instructor
    assert fm_only.value.crit_mult == [0.86, 0.86]
    assert fm_only.source == 'fm.Instructor.overloadMult'


def test_reads_the_pitch_limiter_and_drops_the_no_limit_sentinel() -> None:
    control = extract_basic(F16C_FM, F16C_UNIT, 'f_16c_block_50').flight_control.value
    assert (control.max_g, control.min_g, control.limiter_strength) == (10.0, -5.0, 1.0)
    assert control.aoa_limit_deg == 21.0

    harrier = {
        **F16C_FM,
        'Autopilot': {'Pitch': {'RateMaxLoadFactorMax': [-2147440000.0, 2147440000.0]}},
    }
    assert extract_basic(harrier, {}, 'harrier').flight_control.value.max_g is None


def test_legacy_format() -> None:
    data = extract_basic(F4J_FM, {}, 'f-4j')
    assert data.fm_format == 'legacy'
    # Six 8.2 m² panels = 49.2 m², the published F-4 wing area; the *Cut entries are excluded.
    assert data.wing_area_m2.value == pytest.approx(49.2)
    assert data.wing_span_m.value == 11.7
    assert data.empty_mass_kg.value == pytest.approx(13990 + 35 + 2 * CREW_MASS_KG)
    assert data.internal_fuel_kg.source == 'Mass.MaxFuelMass'
    assert data.crit_overload_N.source == 'Mass.WingCritOverload'
    assert data.wing_break_load_N.value == 2_210_000
    assert (data.vne_kmh.value, data.mne.value) == (1458, 2.45)
    assert data.instructor.value.steady_fraction is None
    assert data.flight_control.value.max_g is None


def test_variable_sweep_format() -> None:
    data = extract_basic(TORNADO_FM, {}, 'tornado_adv')
    assert data.fm_format == 'variable_sweep'
    assert [p.swept_angle_deg for p in data.sweep_positions] == [25.0, 45.0, 67.0]
    # Reference wing is fully forward: 2 × (8 + 4 + 3).
    assert data.wing_area_m2.value == 30.0
    assert data.wing_span_m.value == 13.91
    # Speed limits come from the fully swept wing; strength from the weakest position.
    assert (data.vne_kmh.value, data.mne.value) == (1555, 2.32)
    assert data.crit_overload_N.value == (-295000.0, 820000.0)
    assert data.crit_overload_N.confidence == 'low'


def test_unknown_or_incomplete_flight_models_fail_clearly() -> None:
    with pytest.raises(ExtractionError, match='unknown flight-model format'):
        detect_format({'Aerodynamics': {}})
    no_mass = {key: value for key, value in F16C_FM.items() if key != 'Mass'}
    with pytest.raises(ExtractionError, match='f_16c: missing Mass'):
        extract_basic(no_mass, {}, 'f_16c')
