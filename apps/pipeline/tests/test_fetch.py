import shutil
import subprocess
from pathlib import Path

import pytest

from bfm_pipeline.fetch import DatamineError, fetch, open_checkout


def git(*args: str, cwd: Path) -> str:
    return subprocess.run(
        ['git', *args], cwd=cwd, check=True, capture_output=True, text=True
    ).stdout.strip()


@pytest.fixture
def upstream(tmp_path: Path, datamine: Path) -> Path:
    """A local git repo standing in for the datamine, tagged like a game version."""
    repo = tmp_path / 'upstream'
    shutil.copytree(datamine, repo)
    # A folder the pipeline never reads; the sparse checkout must leave it out.
    (repo / 'aces.vromfs.bin_u/gamedata/units/tankmodels').mkdir(parents=True)
    (repo / 'aces.vromfs.bin_u/gamedata/units/tankmodels/m1a2.blkx').write_text('{}')
    git('init', '--quiet', '--initial-branch=master', cwd=repo)
    git('config', 'uploadpack.allowFilter', 'true', cwd=repo)
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '.', cwd=repo)
    git(
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@t',
        'commit',
        '--quiet',
        '-m',
        '2.59.0.65',
        cwd=repo,
    )
    git('tag', '2.59.0.65', cwd=repo)
    return repo


def test_fetches_a_pinned_sparse_checkout(upstream: Path, tmp_path: Path) -> None:
    checkout = fetch(f'file://{upstream}', '2.59.0.65', tmp_path / 'cache')
    assert checkout.path == tmp_path / 'cache' / '2.59.0.65'
    assert checkout.provenance.game_version == '2.59.0.65'
    assert checkout.provenance.ref == '2.59.0.65'
    assert checkout.provenance.commit == git('rev-parse', 'HEAD', cwd=upstream)
    assert (checkout.path / 'aces.vromfs.bin_u/gamedata/flightmodels/fm/su_57.blkx').is_file()
    assert not (checkout.path / 'aces.vromfs.bin_u/gamedata/units').exists()


def test_reuses_an_existing_checkout(upstream: Path, tmp_path: Path) -> None:
    first = fetch(f'file://{upstream}', '2.59.0.65', tmp_path / 'cache')
    marker = first.path / 'version'
    before = marker.stat().st_mtime_ns
    second = fetch(f'file://{upstream}', '2.59.0.65', tmp_path / 'cache')
    assert second.provenance == first.provenance
    assert marker.stat().st_mtime_ns == before


def test_unknown_ref_fails_clearly(upstream: Path, tmp_path: Path) -> None:
    with pytest.raises(DatamineError, match='git clone'):
        fetch(f'file://{upstream}', '9.99.0.0', tmp_path / 'cache')


def test_rejects_a_checkout_with_an_empty_economy_file(datamine: Path) -> None:
    (datamine / 'char.vromfs.bin_u/config/wpcost.blkx').write_text('{}')
    with pytest.raises(DatamineError, match=r'wpcost\.blkx is missing or empty'):
        open_checkout(datamine)


def test_plain_copies_have_unknown_commit(datamine: Path) -> None:
    assert open_checkout(datamine).provenance.commit == 'unknown'
