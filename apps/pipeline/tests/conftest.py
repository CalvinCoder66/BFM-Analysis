"""A miniature datamine tree, shaped like the real files but small enough to read in a test."""

import json
from pathlib import Path
from typing import Any

import pytest

FM_DIR = Path('aces.vromfs.bin_u/gamedata/flightmodels')

# Instructor settings copied from the real F-16C Block 50 unit file.
F16_INSTRUCTOR = {
    'advancedInstructor': True,
    'instructorCritMult': [0.8, 0.8],
    'instructorOverloadMult': [0.6, 0.67, 0.85, 0.92],
    'autopilotImpl': 'FBW',
}


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data), encoding='utf-8')


def wpcost(rank: int, unit_class: str = 'exp_fighter', country: str = 'usa', **extra: Any) -> dict:
    return {
        'economicRankHistorical': rank,
        'economicRankArcade': rank,
        'unitClass': unit_class,
        'unitMoveType': 'air',
        'country': f'country_{country}',
        'value': 900000,
        **extra,
    }


@pytest.fixture
def datamine(tmp_path: Path) -> Path:
    root = tmp_path / 'datamine'
    root.mkdir()
    (root / 'version').write_text('2.59.0.65\n', encoding='utf-8')

    records = {
        'economicRankMax': 41,
        # One flight model shared by three nation copies.
        'f_16a_block_20_mlu': wpcost(37, country='china'),
        'f_16am_block_20_mlu_norway': wpcost(38, country='sweden'),
        'f_16am_block_20_mlu_netherlands': wpcost(38, country='france', costGold=10160),
        # Shares the flight model but the unit file changes the instructor: must stay separate.
        'f_16am_block_20_mlu_strong': wpcost(38, country='usa'),
        # Separate flight model.
        'f_16c_block_50': wpcost(38),
        # Edge of the range on both sides.
        'f-4s': wpcost(33),
        'f_4e': wpcost(32),
        'rafale_c_f3': wpcost(41, country='france'),
        'su_57': wpcost(42, country='ussr'),
        # Not in scope for other reasons.
        'f_16c_block_50_killstreak': wpcost(38, isPresentInShop=False),
        'ah_64e': wpcost(39, unit_class='exp_helicopter', unitMoveType='helicopter'),
        'm1a2_sep': {**wpcost(36, unit_class='exp_tank'), 'unitMoveType': 'tank'},
        'no_files_jet': wpcost(36),
        'broken_fm_jet': wpcost(36),
    }
    # Add plenty of padding so the file passes the minimum-size sanity check.
    records['_padding'] = {'note': 'x' * 2048}
    write_json(root / 'char.vromfs.bin_u/config/wpcost.blkx', records)

    units = {
        'f_16a_block_20_mlu': {'fmFile': 'fm/f_16a_block_20_mlu.blk', **F16_INSTRUCTOR},
        'f_16am_block_20_mlu_norway': {'fmFile': 'fm/f_16a_block_20_mlu.blk', **F16_INSTRUCTOR},
        'f_16am_block_20_mlu_netherlands': {'fmFile': 'fm/F_16A_Block_20_MLU', **F16_INSTRUCTOR},
        'f_16am_block_20_mlu_strong': {
            'fmFile': 'fm/f_16a_block_20_mlu.blk',
            **F16_INSTRUCTOR,
            'instructorOverloadMult': [0.7, 0.8, 0.9, 0.95],
        },
        'f_16c_block_50': {'fmFile': 'fm/f_16c_block_50.blk', **F16_INSTRUCTOR},
        'f-4s': {},  # no fmFile: the game falls back to fm/<id>
        'f_4e': {'fmFile': 'fm/f_4e.blk'},
        'rafale_c_f3': {'fmFile': '/fm/rafale_c_f3'},
        'su_57': {'fmFile': 'fm/su_57.blk'},
        'f_16c_block_50_killstreak': {'fmFile': 'fm/f_16c_block_50.blk'},
        'broken_fm_jet': {'fmFile': 'fm/does_not_exist.blk'},
    }
    for unit_id, unit in units.items():
        write_json(root / FM_DIR / f'{unit_id}.blkx', {'model': unit_id, **unit})
    for fm in ('f_16a_block_20_mlu', 'f_16c_block_50', 'f-4s', 'f_4e', 'rafale_c_f3', 'su_57'):
        write_json(
            root / FM_DIR / 'fm' / f'{fm}.blkx',
            {'Mass': {'EmptyMass': 9031.0, 'MaxFuelMass0': 6398.0}, 'Passport': {'name': fm}},
        )

    names = {
        'f_16a_block_20_mlu': 'F-16A Block 20 MLU Fighting Falcon',
        # Nation glyph prefix and a non-breaking space, as in the real file.
        'f_16am_block_20_mlu_norway': '\ue07dF-16AM\u00a0Block 20 MLU Fighting Falcon',
        'f_16am_block_20_mlu_netherlands': '◢F-16AM Block 20 MLU Fighting Falcon',
        'f_16am_block_20_mlu_strong': 'F-16AM Strong',
        'f_16c_block_50': 'F-16CM Block 50 Fighting Falcon',
        'f-4s': 'F-4S Phantom II',
        'rafale_c_f3': 'Rafale C F3',
        'ah_64e': 'AH-64E',
        'f_16c_block_50_killstreak': 'F-16CM Block 50 Fighting Falcon',
    }
    rows = ['"<ID|readonly|noverify>";"<English>";"<French>"']
    for unit_id, name in names.items():
        rows.append(f'"{unit_id}_0";"{name}";"x"')
    rows.append('"f_16c_block_50_shop";"F-16CM";"x"')
    rows.append('"f-4s_1";"F-4S";"x"')
    rows += [f'"padding_{i}";"{"y" * 40}";"x"' for i in range(40)]
    csv_path = root / 'lang.vromfs.bin_u/lang/units.csv'
    csv_path.parent.mkdir(parents=True)
    csv_path.write_text('\ufeff' + '\n'.join(rows) + '\n', encoding='utf-8')
    return root
