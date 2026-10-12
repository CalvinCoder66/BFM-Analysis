"""Command-line entry point: `uv run bfm-pipeline --help` (or the `mise run data:*` tasks)."""

import json
from pathlib import Path
from typing import Annotated

import typer

from .blkx import get_path
from .config import CACHE_DIR, DATA_DIR, FLIGHTS_DIR, SCRATCH_DIR, load_config
from .datamine import Datamine
from .extract import extract_all
from .fetch import Checkout, DatamineError, fetch, open_checkout
from .report import write_extraction, write_roster
from .roster import build_roster
from .telemetry.analysis import analyse_run, load_run, summarise
from .telemetry.recorder import DEFAULT_URL, RunMetadata, TelemetryUnavailable, record

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


CARDS = ('A', 'B', 'C', 'D', 'E')
TELEMETRY_HINT = """Nothing is answering on that address. Check:
  - War Thunder is running on this machine and you have spawned into a flight;
  - `curl http://127.0.0.1:8111/state` answers from this same terminal;
  - on WSL with the game on Windows, localhost points at WSL, not Windows: enable mirrored
    networking or run the recorder from Windows (see validation/protocol.md, Troubleshooting)."""


@app.command('record')
def record_command(
    aircraft: Annotated[str, typer.Option(help='Datamine unit id of the aircraft you fly.')],
    card: Annotated[str, typer.Option(help='Test card: A, B, C, D or E.')],
    run: Annotated[int, typer.Option(help='Run number (fly each card three times).')],
    duration: Annotated[float | None, typer.Option(help='Seconds; default until Ctrl+C.')] = None,
    start_fuel_kg: Annotated[float | None, typer.Option(help='Fuel at the start.')] = None,
    loadout: Annotated[str, typer.Option()] = 'clean',
    map_name: Annotated[str | None, typer.Option('--map')] = None,
    notes: Annotated[str, typer.Option()] = '',
    game_version: Annotated[str | None, typer.Option(help='Default: pinned datamine ref.')] = None,
    url: Annotated[str, typer.Option()] = DEFAULT_URL,
    out: Annotated[Path, typer.Option(help='Root folder for flight logs.')] = FLIGHTS_DIR,
) -> None:
    """Record an in-game test flight from War Thunder's telemetry (127.0.0.1:8111)."""
    if card.upper() not in CARDS:
        raise typer.BadParameter(f'card must be one of {", ".join(CARDS)}')
    meta = RunMetadata(
        aircraft=aircraft,
        card=card.upper(),
        run=run,
        game_version=game_version or load_config().source.ref,
        loadout=loadout,
        start_fuel_kg=start_fuel_kg,
        map=map_name,
        notes=notes,
        url=url,
    )
    typer.echo('Recording. Fly the card, then press Ctrl+C (or wait for --duration).')
    try:
        path, samples = record(meta, out, duration_s=duration)
    except (TelemetryUnavailable, FileExistsError) as error:
        typer.secho(f'error: {error}', fg='red', err=True)
        if isinstance(error, TelemetryUnavailable) and 'refused' in str(error).lower():
            typer.echo(TELEMETRY_HINT, err=True)
        raise typer.Exit(1) from error
    typer.echo(f'wrote {samples} samples to {path}')


@app.command()
def analyse(
    logs: Annotated[list[Path], typer.Argument(help='Flight logs (*.jsonl.gz) for one card.')],
) -> None:
    """Analyse recorded flights: steady segments, peak pull, Ps, with spread across runs."""
    peaks: list[float] = []
    missing = [log for log in logs if not log.is_file()]
    if missing:
        for log in missing:
            typer.secho(
                f'error: no flight log at {log} (did the recording start?)', fg='red', err=True
            )
        raise typer.Exit(1)
    for log in logs:
        try:
            run = load_run(log)
        except FileNotFoundError as error:
            typer.secho(f'error: {log} has no matching .meta.json ({error})', fg='red', err=True)
            raise typer.Exit(1) from error
        result = analyse_run(run)
        summary_path = log.with_name(log.name.removesuffix('.jsonl.gz') + '.summary.json')
        summary_path.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
        peak = result['peak_pull']
        typer.echo(
            f'{log.name}: {result["samples"]} samples at {result["effective_hz"]} Hz '
            f'({result["duplicates"]} repeats), {len(result["steady_segments"])} steady segments, '
            f'peak {peak["ny"]:.1f} g at {peak["ias_kmh"]:.0f} km/h IAS'
        )
        if result['effective_hz'] < 5:
            typer.secho(
                f'  warning: only {result["effective_hz"]} Hz; aim for 10–20 Hz '
                '(use --url http://127.0.0.1:8111, not localhost, on Windows)',
                fg='yellow',
            )
        if not result['has_heading']:
            typer.secho(
                '  warning: no heading in the log; turn rates fall back to g·√(n² − 1)/V',
                fg='yellow',
            )
        if result['fuel_capacity_kg'] is not None:
            typer.echo(f'  full-tank fuel in game (Mfuel0): {result["fuel_capacity_kg"]:,.0f} kg')
        peaks.append(peak['ny'])
    if len(peaks) > 1:
        stats = summarise(peaks)
        typer.echo(f'peak G over {len(peaks)} runs: {stats["mean"]:.2f} ± {stats["spread"]:.2f}')
