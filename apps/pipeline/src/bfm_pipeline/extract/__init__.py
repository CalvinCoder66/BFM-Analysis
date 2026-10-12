"""Extraction: turn each roster entry's datamine files into the fields our model needs."""

from pydantic import BaseModel

from ..datamine import Datamine
from ..fetch import Provenance
from ..roster import Roster, RosterEntry
from .basic import BasicData, ExtractionError, extract_basic

__all__ = ['ExtractedAircraft', 'Extraction', 'extract_all']


class ExtractedAircraft(BaseModel):
    entry: RosterEntry
    basic: BasicData


class Failure(BaseModel):
    entry_id: str
    error: str


class Extraction(BaseModel):
    provenance: Provenance
    aircraft: list[ExtractedAircraft]
    failures: list[Failure]


def extract_all(dm: Datamine, roster: Roster) -> Extraction:
    aircraft: list[ExtractedAircraft] = []
    failures: list[Failure] = []
    for entry in roster.entries:
        unit_id = entry.representative
        try:
            basic = extract_basic(dm.fm(unit_id), dm.unit(unit_id), label=unit_id)
        except (ExtractionError, KeyError, TypeError, ValueError) as error:
            failures.append(Failure(entry_id=entry.id, error=f'{type(error).__name__}: {error}'))
            continue
        aircraft.append(ExtractedAircraft(entry=entry, basic=basic))
    return Extraction(provenance=roster.provenance, aircraft=aircraft, failures=failures)
