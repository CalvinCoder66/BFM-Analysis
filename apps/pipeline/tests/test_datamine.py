from pathlib import Path

import pytest

from bfm_pipeline.blkx import as_list, get_path
from bfm_pipeline.datamine import Datamine, clean_name


@pytest.mark.parametrize(
    ('raw', 'clean'),
    [
        ('◢F-16AM Block 20 MLU', 'F-16AM Block 20 MLU'),
        ('\ue07dJAS39C\u00a0Gripen', 'JAS39C Gripen'),
        ('  MiG-29 (9-12)  ', 'MiG-29 (9-12)'),
        ('F/A-18C Hornet', 'F/A-18C Hornet'),
    ],
)
def test_clean_name(raw: str, clean: str) -> None:
    assert clean_name(raw) == clean


@pytest.mark.parametrize(
    ('unit', 'fm_file'),
    [
        ({'fmFile': 'fm/f_16c_block_50.blk'}, 'fm/f_16c_block_50'),
        ({'fmFile': '/fm/tornado_adv'}, 'fm/tornado_adv'),
        ({'fmFile': 'fm/F_16AM_Block_15_MLU_Belgium'}, 'fm/f_16am_block_15_mlu_belgium'),
        ({'fmFile': 'gameData/FlightModels/fm/su_27.blk'}, 'fm/su_27'),
        ({'fmFile': 'fm\\mig_29.blk'}, 'fm/mig_29'),
        ({}, 'fm/f-4s'),
    ],
)
def test_fm_file_normalisation(unit: dict, fm_file: str) -> None:
    assert Datamine.fm_file('f-4s', unit) == fm_file


def test_names_fall_back_from_shop_to_short_to_full(datamine: Path) -> None:
    names = Datamine(datamine).names
    assert names['f_16c_block_50'].short == 'F-16CM'  # from <id>_shop
    assert names['f-4s'].short == 'F-4S'  # from <id>_1
    assert names['rafale_c_f3'].short == 'Rafale C F3'  # full name when neither exists


def test_reads_units_and_their_flight_models(datamine: Path) -> None:
    dm = Datamine(datamine)
    assert dm.unit('f_16c_block_50')['autopilotImpl'] == 'FBW'
    assert dm.fm('f_16am_block_20_mlu_norway')['Passport']['name'] == 'f_16a_block_20_mlu'
    assert 'economicRankMax' not in dm.wpcost  # scalar entries are not units


def test_as_list_and_get_path() -> None:
    assert as_list(None) == []
    assert as_list({'slot': 1}) == [{'slot': 1}]
    assert as_list([1, 2]) == [1, 2]
    data = {'Aerodynamics': {'WingPlane': {'Span': 9.44}}}
    assert get_path(data, 'Aerodynamics.WingPlane.Span') == 9.44
    assert get_path(data, '') is data
    with pytest.raises(KeyError, match="no 'Wing'"):
        get_path(data, 'Aerodynamics.Wing')
