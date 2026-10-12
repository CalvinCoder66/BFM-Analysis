"""Which aircraft are in scope, and which datamine units are the same aircraft.

Scope: Realistic Battles BR within the configured range, fixed-wing classes, sold in the shop
(the shop flag excludes killstreak and missile-test copies). Units are then grouped by flight model:
nation copies that share a flight-model file and the performance-relevant settings in their unit
file become one entry, with every copy listed as a variant.

We model fully upgraded aircraft. Performance modifications in War Thunder are defined as penalties
applied while *not* researched (`invertEnableLogic`), so the flight-model files already describe the
upgraded aircraft and modifications do not need to be part of the fingerprint.
"""

import hashlib
import json
from collections import defaultdict
from typing import Any

from pydantic import BaseModel

from .config import RosterRules
from .datamine import Datamine, UnitName
from .fetch import Provenance

#: Unit-file settings that change flight performance even when the flight model is shared.
FINGERPRINT_KEYS = (
    'instructorCritMult',
    'instructorOverloadMult',
    'advancedInstructor',
    'autopilotImpl',
)


def br_from_rank(economic_rank: int) -> float:
    """War Thunder battle rating from an economic rank: BR = 1.0 + rank / 3, shown to 0.1."""
    return round(1.0 + economic_rank / 3, 1)


class Variant(BaseModel):
    unit_id: str
    name: str
    short_name: str
    nation: str
    br: float
    unit_class: str


class RosterEntry(BaseModel):
    #: Our id, used for the output file name (`data/aircraft/<id>.json`).
    id: str
    name: str
    short_name: str
    #: The variant whose files the aircraft data is extracted from.
    representative: str
    fm_file: str
    fingerprint: str
    variants: list[Variant]

    @property
    def br_range(self) -> tuple[float, float]:
        brs = [v.br for v in self.variants]
        return min(brs), max(brs)


class Exclusion(BaseModel):
    unit_id: str
    name: str
    br: float
    reason: str


class Roster(BaseModel):
    provenance: Provenance
    rules: RosterRules
    entries: list[RosterEntry]
    excluded: list[Exclusion]


def fingerprint(fm_file: str, unit: dict[str, Any]) -> str:
    payload = {'fm': fm_file, **{key: unit.get(key) for key in FINGERPRINT_KEYS}}
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    return digest[:12]


def _name(dm: Datamine, unit_id: str) -> UnitName:
    return dm.names.get(unit_id, UnitName(full=unit_id, short=unit_id))


def build_roster(dm: Datamine, rules: RosterRules, provenance: Provenance) -> Roster:
    excluded: list[Exclusion] = []
    groups: dict[tuple[str, str], list[Variant]] = defaultdict(list)
    fm_files: dict[str, str] = {}

    for unit_id, record in sorted(dm.wpcost.items()):
        rank = record.get('economicRankHistorical')
        if not isinstance(rank, int):
            continue
        br = br_from_rank(rank)
        if not rules.br_min <= br <= rules.br_max:
            continue
        unit_class = str(record.get('unitClass', ''))
        name = _name(dm, unit_id)

        def exclude(reason: str, unit_id: str = unit_id, name: UnitName = name, br: float = br):
            excluded.append(Exclusion(unit_id=unit_id, name=name.full, br=br, reason=reason))

        if record.get('unitMoveType') not in (None, 'air') and unit_class != 'exp_helicopter':
            continue  # tanks and ships share the table
        if unit_class not in rules.unit_classes:
            if unit_class == 'exp_helicopter':
                exclude('helicopter (the model is fixed-wing only)')
            continue
        if record.get('isPresentInShop') is False:
            exclude('not sold in the shop (killstreak or missile-test copy)')
            continue
        if unit_id in rules.deny:
            exclude('on the deny list')
            continue
        if not dm.has_unit(unit_id):
            exclude('no unit file in the datamine')
            continue

        unit = dm.unit(unit_id)
        fm_file = dm.fm_file(unit_id, unit)
        if not dm.fm_path(fm_file).is_file():
            exclude(f'flight model {fm_file} not found in the datamine')
            continue
        key = unit_id if unit_id in rules.force_separate else fingerprint(fm_file, unit)
        fm_files[key] = fm_file
        groups[(fm_file, key)].append(
            Variant(
                unit_id=unit_id,
                name=name.full,
                short_name=name.short,
                nation=str(record.get('country', '')).removeprefix('country_'),
                br=br,
                unit_class=unit_class,
            )
        )

    entries = [_entry(fm_file, key, variants) for (fm_file, key), variants in groups.items()]
    entries.sort(key=lambda e: (e.br_range[0], e.name.lower()))
    return Roster(provenance=provenance, rules=rules, entries=entries, excluded=excluded)


def _entry(fm_file: str, key: str, variants: list[Variant]) -> RosterEntry:
    fm_name = fm_file.rsplit('/', 1)[-1]
    # Prefer the unit the flight model is named after; otherwise the lowest BR, then id.
    representative = next(
        (v for v in variants if v.unit_id == fm_name),
        min(variants, key=lambda v: (v.br, v.unit_id)),
    )
    variants = sorted(
        variants, key=lambda v: (v.unit_id != representative.unit_id, v.br, v.unit_id)
    )
    return RosterEntry(
        id=representative.unit_id.lower().replace('_', '-'),
        name=representative.name,
        short_name=representative.short_name,
        representative=representative.unit_id,
        fm_file=fm_file,
        fingerprint=key,
        variants=variants,
    )
