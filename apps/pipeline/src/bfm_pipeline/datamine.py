"""Read access to a datamine checkout: units, flight models, battle ratings and names."""

import csv
import unicodedata
from dataclasses import dataclass
from functools import cached_property
from pathlib import Path
from typing import Any

from .blkx import load_blkx

FLIGHTMODELS = Path('aces.vromfs.bin_u/gamedata/flightmodels')
WPCOST = Path('char.vromfs.bin_u/config/wpcost.blkx')
UNITS_CSV = Path('lang.vromfs.bin_u/lang/units.csv')


@dataclass(frozen=True)
class UnitName:
    #: Full name, e.g. "F-16CM Block 50 Fighting Falcon".
    full: str
    #: Short name shown in the shop, e.g. "F-16CM".
    short: str


def clean_name(raw: str) -> str:
    """Strip the nation glyphs the game prefixes to some names and normalise spaces."""
    text = raw.replace('\u00a0', ' ').strip()
    while text and unicodedata.category(text[0]) in {'So', 'Co', 'Cn', 'Zs'}:
        text = text[1:]
    return text.strip()


class Datamine:
    def __init__(self, root: Path) -> None:
        self.root = root

    @cached_property
    def wpcost(self) -> dict[str, dict[str, Any]]:
        """Economy records keyed by unit id (battle rating, class, nation, shop flags)."""
        data = load_blkx(self.root / WPCOST)
        return {k: v for k, v in data.items() if isinstance(v, dict)}

    @cached_property
    def names(self) -> dict[str, UnitName]:
        """English names keyed by unit id, from `units.csv` (`<id>_0` full, `<id>_shop` short)."""
        rows: dict[str, str] = {}
        with (self.root / UNITS_CSV).open(encoding='utf-8-sig', newline='') as f:
            reader = csv.reader(f, delimiter=';')
            header = next(reader)
            english = header.index('<English>')
            for row in reader:
                if len(row) > english:
                    rows[row[0]] = row[english]
        names: dict[str, UnitName] = {}
        for key, value in rows.items():
            if key.endswith('_0'):
                unit_id = key.removesuffix('_0')
                full = clean_name(value)
                short = clean_name(rows.get(f'{unit_id}_shop') or rows.get(f'{unit_id}_1') or value)
                names[unit_id] = UnitName(full=full, short=short)
        return names

    def unit_path(self, unit_id: str) -> Path:
        return self.root / FLIGHTMODELS / f'{unit_id}.blkx'

    def has_unit(self, unit_id: str) -> bool:
        return self.unit_path(unit_id).is_file()

    def unit(self, unit_id: str) -> dict[str, Any]:
        """The top-level unit file (weapons, instructor overrides, FBW type, `fmFile`)."""
        return load_blkx(self.unit_path(unit_id))

    @staticmethod
    def fm_file(unit_id: str, unit: dict[str, Any]) -> str:
        """Normalised flight-model reference, e.g. `fm/f_16c_block_50`."""
        raw = str(unit.get('fmFile') or f'fm/{unit_id}.blk')
        path = raw.replace('\\', '/').lower().removesuffix('.blk').lstrip('/')
        return path.removeprefix('gamedata/flightmodels/')

    def fm_path(self, fm_file: str) -> Path:
        return self.root / FLIGHTMODELS / f'{fm_file}.blkx'

    def fm(self, unit_id: str) -> dict[str, Any]:
        """The flight-model file a unit points to (mass, aerodynamics, engines, limits)."""
        return load_blkx(self.fm_path(self.fm_file(unit_id, self.unit(unit_id))))
