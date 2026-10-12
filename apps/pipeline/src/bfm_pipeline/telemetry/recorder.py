"""Record War Thunder's local telemetry (http://localhost:8111) to a reproducible flight log.

Each sample is one JSON line holding the raw `/state` and `/indicators` responses with a monotonic
and a wall-clock timestamp. Nothing is converted at record time, so the analysis can always be
rerun on the original data. A `<run>.meta.json` file next to the log records the conditions.
"""

import contextlib
import gzip
import json
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel

# 127.0.0.1 rather than localhost: on Windows, localhost tries IPv6 (::1) first and the game only
# listens on IPv4, which costs about half a second per request and caps recording at ~1 Hz.
DEFAULT_URL = 'http://127.0.0.1:8111'


class TelemetryUnavailable(RuntimeError):
    """The game is not running, not in a flight, or the telemetry port is blocked."""


class RunMetadata(BaseModel):
    aircraft: str
    card: str
    run: int
    game_version: str
    loadout: str = 'clean'
    start_fuel_kg: float | None = None
    map: str | None = None
    mode: str = 'Realistic, instructor (mouse aim)'
    notes: str = ''
    recorded_at: str = ''
    url: str = DEFAULT_URL
    target_hz: float = 20.0


def fetch_json(url: str, timeout: float = 0.5) -> Any:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return json.loads(response.read().decode('utf-8'))
    except (urllib.error.URLError, TimeoutError, ConnectionError, json.JSONDecodeError) as error:
        raise TelemetryUnavailable(f'{url}: {error}') from error


def player_map_object(url: str) -> dict[str, Any] | None:
    """The player's entry from `/map_obj.json`: map position and heading vector (dx, dy).

    Cockpit indicators don't include a compass on every aircraft, so this is the heading source
    that always works. Only the player's entry is kept, to keep logs small.
    """
    try:
        objects = fetch_json(f'{url}/map_obj.json')
    except TelemetryUnavailable:
        return None
    if not isinstance(objects, list):
        return None
    return next((o for o in objects if isinstance(o, dict) and o.get('icon') == 'Player'), None)


def run_paths(root: Path, meta: RunMetadata) -> tuple[Path, Path]:
    folder = root / meta.game_version / meta.aircraft
    stem = f'{meta.card}-{meta.run}'
    return folder / f'{stem}.jsonl.gz', folder / f'{stem}.meta.json'


def record(
    meta: RunMetadata,
    root: Path,
    duration_s: float | None = None,
    should_stop: Callable[[], bool] = lambda: False,
    clock: Callable[[], float] = time.monotonic,
    sleep: Callable[[float], None] = time.sleep,
) -> tuple[Path, int]:
    """Poll the telemetry until `duration_s` passes or `should_stop()` returns true.

    Returns the log path and the number of samples written. Fails immediately if the game is not
    serving telemetry, so a misconfigured run doesn't silently produce an empty log.
    """
    state = fetch_json(f'{meta.url}/state')
    if not state.get('valid', False):
        raise TelemetryUnavailable('telemetry is up but not valid: spawn into a flight first')

    log_path, meta_path = run_paths(root, meta)
    if log_path.exists():
        raise FileExistsError(f'{log_path} exists; use a new --run number')
    log_path.parent.mkdir(parents=True, exist_ok=True)
    meta = meta.model_copy(update={'recorded_at': datetime.now(UTC).isoformat(timespec='seconds')})
    meta_path.write_text(meta.model_dump_json(indent=2) + '\n', encoding='utf-8')

    start = clock()
    written = [0]
    # Ctrl+C ends the run; the log written so far is kept.
    with gzip.open(log_path, 'wt', encoding='utf-8') as log, contextlib.suppress(KeyboardInterrupt):
        _poll(meta, log, start, duration_s, should_stop, clock, sleep, written)
    return log_path, written[0]


def _poll(
    meta: RunMetadata,
    log: Any,
    start: float,
    duration_s: float | None,
    should_stop: Callable[[], bool],
    clock: Callable[[], float],
    sleep: Callable[[float], None],
    written: list[int],
) -> None:
    interval = 1.0 / meta.target_hz
    while not should_stop() and (duration_s is None or clock() - start < duration_s):
        tick = clock()
        try:
            sample = {
                't': round(tick - start, 4),
                'wall': time.time(),
                'state': fetch_json(f'{meta.url}/state'),
                'indicators': fetch_json(f'{meta.url}/indicators'),
                'player': player_map_object(meta.url),
            }
        except TelemetryUnavailable as error:
            sample = {'t': round(tick - start, 4), 'wall': time.time(), 'error': str(error)}
        log.write(json.dumps(sample, separators=(',', ':')) + '\n')
        written[0] += 1
        sleep(max(0.0, interval - (clock() - tick)))
