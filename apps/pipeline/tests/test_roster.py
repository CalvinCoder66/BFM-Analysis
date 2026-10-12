from pathlib import Path

import pytest

from bfm_pipeline.config import RosterRules
from bfm_pipeline.datamine import Datamine
from bfm_pipeline.fetch import Provenance
from bfm_pipeline.roster import Roster, br_from_rank, build_roster

PROVENANCE = Provenance(repo='local', ref='2.59.0.65', commit='abc', game_version='2.59.0.65')
RULES = RosterRules(br_min=12.0, br_max=14.7, unit_classes=['exp_fighter', 'exp_assault'])


def roster_for(datamine: Path, **overrides) -> Roster:
    rules = RULES.model_copy(update=overrides)
    return build_roster(Datamine(datamine), rules, PROVENANCE)


def entry(roster: Roster, entry_id: str):
    return next(e for e in roster.entries if e.id == entry_id)


@pytest.mark.parametrize(
    ('rank', 'br'),
    [(0, 1.0), (1, 1.3), (2, 1.7), (32, 11.7), (33, 12.0), (34, 12.3), (35, 12.7), (41, 14.7)],
)
def test_battle_rating_from_economic_rank(rank: int, br: float) -> None:
    assert br_from_rank(rank) == br


def test_keeps_fixed_wing_aircraft_inside_the_br_range(datamine: Path) -> None:
    roster = roster_for(datamine)
    units = {v.unit_id for e in roster.entries for v in e.variants}
    assert 'f-4s' in units  # BR 12.0, lower edge
    assert 'rafale_c_f3' in units  # BR 14.7, upper edge
    assert 'f_4e' not in units  # 11.7
    assert 'su_57' not in units  # 15.0
    assert 'm1a2_sep' not in units  # a tank


def test_merges_nation_copies_that_share_a_flight_model(datamine: Path) -> None:
    mlu = entry(roster_for(datamine), 'f-16a-block-20-mlu')
    # The unit the flight model is named after represents the group.
    assert mlu.representative == 'f_16a_block_20_mlu'
    assert mlu.fm_file == 'fm/f_16a_block_20_mlu'
    assert [v.unit_id for v in mlu.variants] == [
        'f_16a_block_20_mlu',
        'f_16am_block_20_mlu_netherlands',
        'f_16am_block_20_mlu_norway',
    ]
    assert mlu.br_range == (13.3, 13.7)
    assert {v.nation for v in mlu.variants} == {'china', 'france', 'sweden'}


def test_splits_copies_whose_unit_file_changes_performance(datamine: Path) -> None:
    roster = roster_for(datamine)
    strong = entry(roster, 'f-16am-block-20-mlu-strong')
    assert [v.unit_id for v in strong.variants] == ['f_16am_block_20_mlu_strong']
    assert strong.fm_file == entry(roster, 'f-16a-block-20-mlu').fm_file
    assert strong.fingerprint != entry(roster, 'f-16a-block-20-mlu').fingerprint


def test_force_separate_keeps_a_unit_out_of_its_group(datamine: Path) -> None:
    roster = roster_for(datamine, force_separate=['f_16am_block_20_mlu_norway'])
    assert [v.unit_id for v in entry(roster, 'f-16am-block-20-mlu-norway').variants] == [
        'f_16am_block_20_mlu_norway'
    ]
    assert len(entry(roster, 'f-16a-block-20-mlu').variants) == 2


def test_records_why_in_range_units_are_excluded(datamine: Path) -> None:
    reasons = {x.unit_id: x.reason for x in roster_for(datamine, deny=['f-4s']).excluded}
    assert 'killstreak' in reasons['f_16c_block_50_killstreak']
    assert 'helicopter' in reasons['ah_64e']
    assert 'deny list' in reasons['f-4s']
    assert 'no unit file' in reasons['no_files_jet']
    assert 'fm/does_not_exist not found' in reasons['broken_fm_jet']
    assert 'm1a2_sep' not in reasons  # tanks are not air units, so not worth listing


def test_names_drop_nation_glyphs_and_odd_spaces(datamine: Path) -> None:
    roster = roster_for(datamine)
    names = {v.unit_id: v.name for e in roster.entries for v in e.variants}
    assert names['f_16am_block_20_mlu_norway'] == 'F-16AM Block 20 MLU Fighting Falcon'
    assert names['f_16am_block_20_mlu_netherlands'] == 'F-16AM Block 20 MLU Fighting Falcon'
    f16c = entry(roster, 'f-16c-block-50')
    assert (f16c.name, f16c.short_name) == ('F-16CM Block 50 Fighting Falcon', 'F-16CM')


def test_entries_are_sorted_by_br_then_name(datamine: Path) -> None:
    roster = roster_for(datamine)
    keys = [(e.br_range[0], e.name.lower()) for e in roster.entries]
    assert keys == sorted(keys)
    assert roster.entries[0].id == 'f-4s'
