"""Command-line entry point: `uv run bfm-pipeline --help` (or the `mise run data:*` tasks)."""

import json
from pathlib import Path
from typing import Annotated

import typer

from .blkx import get_path
from .config import CACHE_DIR, DATA_DIR, SCRATCH_DIR, load_config
from .datamine import Datamine
from .extract import extract_all
from .fetch import Checkout, DatamineError, fetch, open_checkout
from .report import write_extraction, write_roster
from .roster import build_roster

app = typer.Typer(no_args_is_help=True, help='War Thunder datamine pipeline for BFM Analysis.')

RefOption = Annotated[
    str | None, typer.Option(help='Datamine tag to use (default: source.ref in pipeline.toml).')
]
DatamineOption = Annotated[
    Path | None,
    typer.Option(help='Use an existing datamine checkout instead of fetching (offline, tests).'),
]


def _checkout(ref: str | None, datamine: Path | None) -> Checkout:
    config = load_config()
    try:
        if datamine is not None:
            return open_checkout(datamine)
        return fetch(config.source.repo, ref or config.source.ref, CACHE_DIR)
    except DatamineError as error:
        typer.secho(f'error: {error}', fg='red', err=True)
        raise typer.Exit(1) from error


@app.command('fetch')
def fetch_command(ref: RefOption = None) -> None:
    """Fetch (or reuse) the pinned datamine checkout and print its provenance."""
    checkout = _checkout(ref, None)
    typer.echo(checkout.provenance.model_dump_json(indent=2))
    typer.echo(f'checkout: {checkout.path}')


@app.command()
def roster(
    ref: RefOption = None,
    datamine: DatamineOption = None,
    out: Annotated[Path, typer.Option(help='Output folder.')] = DATA_DIR,
) -> None:
    """Build the aircraft roster and write roster.json and ROSTER.md."""
    checkout = _checkout(ref, datamine)
    result = build_roster(Datamine(checkout.path), load_config().roster, checkout.provenance)
    json_path, md_path = write_roster(result, out)
    units = sum(len(e.variants) for e in result.entries)
    typer.echo(
        f'{len(result.entries)} aircraft ({units} units, {len(result.excluded)} excluded) '
        f'from War Thunder {checkout.provenance.game_version}'
    )
    typer.echo(f'wrote {json_path} and {md_path}')


@app.command()
def extract(
    ref: RefOption = None,
    datamine: DatamineOption = None,
    out: Annotated[Path, typer.Option(help='Folder for the EXTRACTION.md report.')] = DATA_DIR,
    scratch: Annotated[Path, typer.Option(help='Folder for extraction.json.')] = SCRATCH_DIR,
) -> None:
    """Extract basic fields for every roster aircraft and write EXTRACTION.md."""
    checkout = _checkout(ref, datamine)
    dm = Datamine(checkout.path)
    result = extract_all(dm, build_roster(dm, load_config().roster, checkout.provenance))
    report = write_extraction(result, out, scratch)
    typer.echo(f'{len(result.aircraft)} aircraft extracted, {len(result.failures)} failed')
    typer.echo(f'wrote {report} and {scratch / "extraction.json"}')
    for failure in result.failures:
        typer.secho(f'  {failure.entry_id}: {failure.error}', fg='red', err=True)
    if result.failures:
        raise typer.Exit(1)


@app.command()
def inspect(
    unit_id: Annotated[str, typer.Argument(help='Datamine unit id, e.g. f_16c_block_50.')],
    path: Annotated[str, typer.Option(help='Dotted path inside the file, e.g. Mass.')] = '',
    fm: Annotated[bool, typer.Option('--fm/--unit', help='Flight-model or unit file.')] = True,
    ref: RefOption = None,
    datamine: DatamineOption = None,
) -> None:
    """Print part of a unit's flight-model (default) or unit file."""
    dm = Datamine(_checkout(ref, datamine).path)
    if not dm.has_unit(unit_id):
        typer.secho(f'error: no unit {unit_id!r}', fg='red', err=True)
        raise typer.Exit(1)
    data = dm.fm(unit_id) if fm else dm.unit(unit_id)
    try:
        typer.echo(json.dumps(get_path(data, path), indent=2, ensure_ascii=False))
    except KeyError as error:
        typer.secho(f'error: {error.args[0]}', fg='red', err=True)
        raise typer.Exit(1) from error
