"""Pipeline configuration (`apps/pipeline/pipeline.toml`) and well-known paths."""

import tomllib
from pathlib import Path

from pydantic import BaseModel, Field

PIPELINE_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = PIPELINE_DIR.parents[1]
CONFIG_PATH = PIPELINE_DIR / 'pipeline.toml'
CACHE_DIR = REPO_ROOT / '.cache' / 'datamine'
#: Intermediate output that is useful to look at but not committed.
SCRATCH_DIR = REPO_ROOT / '.cache' / 'out'
DATA_DIR = REPO_ROOT / 'data'


class SourceConfig(BaseModel):
    repo: str
    #: A game-version tag in the datamine repository.
    ref: str


class RosterRules(BaseModel):
    br_min: float
    br_max: float
    unit_classes: list[str]
    deny: list[str] = Field(default_factory=list)
    force_separate: list[str] = Field(default_factory=list)


class PipelineConfig(BaseModel):
    source: SourceConfig
    roster: RosterRules


def load_config(path: Path = CONFIG_PATH) -> PipelineConfig:
    with path.open('rb') as f:
        return PipelineConfig.model_validate(tomllib.load(f))
