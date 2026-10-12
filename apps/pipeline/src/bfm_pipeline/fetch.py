"""Pinned, sparse checkout of the War Thunder datamine.

The datamine repository is about 13.6 GB, so we never clone it fully: a shallow, blob-filtered
clone of one game-version tag, with only the folders the pipeline reads checked out.
"""

import subprocess
from dataclasses import dataclass
from pathlib import Path

from pydantic import BaseModel

#: Paths (git sparse-checkout, non-cone patterns) the pipeline reads.
SPARSE_PATHS = (
    '/version',
    '/char.vromfs.bin_u/config/wpcost.blkx',
    '/char.vromfs.bin_u/config/modifications.blkx',
    '/lang.vromfs.bin_u/lang/units.csv',
    '/aces.vromfs.bin_u/gamedata/flightmodels/*.blkx',
    '/aces.vromfs.bin_u/gamedata/flightmodels/fm/',
    '/aces.vromfs.bin_u/gamedata/flightmodels/weaponpresets/',
)

#: Files that must exist for a checkout to be usable, with a minimum plausible size in bytes.
#: The datamine has shipped empty copies of some files (e.g. `wpcost.blkx` on master).
REQUIRED_FILES = {
    'version': 5,
    'char.vromfs.bin_u/config/wpcost.blkx': 1024,
    'lang.vromfs.bin_u/lang/units.csv': 1024,
}


class DatamineError(RuntimeError):
    """The datamine checkout is missing, incomplete or unusable."""


class Provenance(BaseModel):
    """Where a dataset came from, recorded in every output file."""

    repo: str
    ref: str
    commit: str
    game_version: str


@dataclass(frozen=True)
class Checkout:
    path: Path
    provenance: Provenance


def _git(*args: str, cwd: Path | None = None) -> str:
    result = subprocess.run(['git', *args], cwd=cwd, check=False, capture_output=True, text=True)
    if result.returncode != 0:
        raise DatamineError(f'git {" ".join(args)} failed: {result.stderr.strip()}')
    return result.stdout.strip()


def fetch(repo: str, ref: str, cache_root: Path) -> Checkout:
    """Check out `ref` of the datamine into `cache_root/<ref>`, reusing an existing checkout."""
    target = cache_root / ref
    if not (target / '.git').is_dir():
        target.parent.mkdir(parents=True, exist_ok=True)
        _git(
            'clone', '--depth', '1', '--filter=blob:none', '--no-checkout',
            '--branch', ref, repo, str(target),
        )  # fmt: skip
    # Re-applying the sparse paths is cheap and picks up paths added since the last run.
    _git('sparse-checkout', 'set', '--no-cone', *SPARSE_PATHS, cwd=target)
    _git('checkout', '--quiet', cwd=target)
    return open_checkout(target, repo=repo, ref=ref)


def open_checkout(path: Path, repo: str = 'local', ref: str = 'local') -> Checkout:
    """Validate an existing checkout (or plain copy) of the datamine and read its provenance."""
    for relative, min_size in REQUIRED_FILES.items():
        file = path / relative
        if not file.is_file() or file.stat().st_size < min_size:
            raise DatamineError(f'{relative} is missing or empty in {path}; pin a different ref')
    commit = _git('rev-parse', 'HEAD', cwd=path) if (path / '.git').exists() else 'unknown'
    game_version = (path / 'version').read_text(encoding='utf-8').strip()
    return Checkout(path, Provenance(repo=repo, ref=ref, commit=commit, game_version=game_version))
