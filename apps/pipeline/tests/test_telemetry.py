"""Telemetry recording and analysis, checked against synthetic flights with known answers."""

import gzip
import json
import math
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest

from bfm_pipeline.telemetry.analysis import (
    G0,
    acceleration_points,
    analyse_run,
    load_run,
    parse_samples,
    peak_pull,
    steady_segments,
    summarise,
)
from bfm_pipeline.telemetry.recorder import RunMetadata, TelemetryUnavailable, record, run_paths

META = RunMetadata(aircraft='f_16c_block_50', card='C', run=1, game_version='2.59.0.65')


def line(
    t: float, tas_kmh: float, h: float, ny: float, heading: float, ias_kmh: float | None = None
):
    return {
        't': t,
        'state': {
            'valid': True,
            'IAS, km/h': ias_kmh or tas_kmh,
            'TAS, km/h': tas_kmh,
            'M': tas_kmh / 3.6 / 340.0,
            'H, m': h,
            'Ny': ny,
            'AoA, deg': 10.0,
            'Mfuel, kg': 2000.0 - t,
        },
        'indicators': {'valid': True, 'compass': heading % 360},
    }


def steady_turn(seconds: float = 12.0, hz: float = 20.0, tas_kmh: float = 720.0, n: float = 6.0):
    """A level turn at constant speed: ω = g·√(n² − 1) / V, so the heading advances at that rate."""
    omega_degs = math.degrees(G0 * math.sqrt(n * n - 1) / (tas_kmh / 3.6))
    return [
        line(i / hz, tas_kmh, 1000.0, n, 350.0 + omega_degs * i / hz)
        for i in range(int(seconds * hz) + 1)
    ], omega_degs


def write_run(tmp_path: Path, lines: list[dict]) -> Path:
    log, meta = run_paths(tmp_path, META)
    log.parent.mkdir(parents=True)
    meta.write_text(META.model_dump_json())
    with gzip.open(log, 'wt') as f:
        f.writelines(json.dumps(x) + '\n' for x in lines)
    return log


def test_measures_turn_rate_from_heading_across_north() -> None:
    lines, omega = steady_turn()
    samples, duplicates, errors = parse_samples(lines)
    assert (duplicates, errors) == (0, 0)
    # The heading crosses 360° → 0° early on; unwrapping keeps it continuous.
    assert samples[-1].heading == pytest.approx(350 + omega * 12, abs=1e-6)
    [segment] = steady_segments(samples)
    # 720 km/h at 6 g: ω = 9.80665 × √35 / 200 = 0.29008 rad/s = 16.62°/s.
    assert segment.turn_rate_degs == pytest.approx(16.62, abs=0.01)
    assert segment.ny == pytest.approx(6.0)
    assert segment.ps == pytest.approx(0.0, abs=1e-6)
    assert segment.duration == pytest.approx(12.0)


def test_ps_from_energy_height_ignores_trading_height_for_speed() -> None:
    # Climbing 10 m/s while losing speed so that hₑ = h + V²/2g stays constant: Ps = 0.
    lines = []
    for i in range(101):
        t = i / 20
        h = 1000.0 + 10.0 * t
        v = math.sqrt(2 * G0 * (1000.0 + 300.0**2 / (2 * G0) - h))
        lines.append(line(t, v * 3.6, h, 1.0, 90.0))
    points = acceleration_points(parse_samples(lines)[0])
    assert points
    assert all(abs(p['ps']) < 0.05 for p in points)


def test_level_acceleration_gives_ps_equal_to_v_dv_dt_over_g() -> None:
    # Level, accelerating at 5 m/s² through 200 m/s: Ps = V·(dV/dt)/g = 200 × 5 / 9.80665 = 102.0.
    lines = [line(i / 20, (180 + 5 * i / 20) * 3.6, 1000.0, 1.0, 90.0) for i in range(161)]
    samples = parse_samples(lines)[0]
    at_200 = min(acceleration_points(samples), key=lambda p: abs(p['tas_kmh'] - 720))
    assert at_200['ps'] == pytest.approx(102.0, rel=0.01)


def map_heading_line(t: float, heading_deg: float, ny: float = 6.0) -> dict:
    """A sample from an aircraft with no cockpit compass: heading only on the map (north = −y)."""
    x = line(t, 720.0, 1000.0, ny, 0.0)
    x['indicators'] = {'valid': True, 'type': 'ef_2000_fgr4'}
    rad = math.radians(heading_deg)
    x['player'] = {'icon': 'Player', 'dx': math.sin(rad), 'dy': -math.cos(rad)}
    x['state']['thrust 1, kgs'] = 4404
    x['state']['thrust 2, kgs'] = 4404
    return x


def test_heading_falls_back_to_the_map_vector() -> None:
    samples = parse_samples([map_heading_line(i / 20, (350 + 10 * i / 20)) for i in range(201)])[0]
    assert samples[0].heading == pytest.approx(350)  # dx = sin, dy = −cos: north is up
    [segment] = steady_segments(samples)
    assert segment.turn_rate_source == 'heading'
    assert segment.turn_rate_degs == pytest.approx(10.0, abs=1e-6)
    # Two engines at 4,404 kgf each.
    assert segment.thrust_N == pytest.approx(2 * 4404 * G0)


def test_turn_rate_follows_the_map_track_not_the_nose() -> None:
    # A 10°/s turn flown clockwise round a circle on the map, positions rounded as the game does.
    # The nose leads the track by the angle of attack, which builds from 0 to 25° over the run,
    # so the nose turns at 12.5°/s while the aircraft's path turns at 10°/s.
    lines = []
    for i in range(201):
        t = i / 20
        track = math.radians(350 + 10 * t)
        x = map_heading_line(t, 350 + 10 * t + 2.5 * t)
        x['player'] |= {'x': round(0.5 - 0.01 * math.cos(track), 6),
                        'y': round(0.5 - 0.01 * math.sin(track), 6)}  # fmt: skip
        lines.append(x)
    samples = parse_samples(lines)[0]
    assert samples[100].heading == pytest.approx(400.0, abs=0.2)  # track (40°), not nose (52.5°)
    [segment] = steady_segments(samples)
    assert segment.turn_rate_degs == pytest.approx(10.0, abs=0.02)


def test_turn_rate_falls_back_to_kinematics_without_any_heading() -> None:
    lines = [map_heading_line(i / 20, 0.0) for i in range(201)]
    for x in lines:
        del x['player']
    [segment] = steady_segments(parse_samples(lines)[0])
    # 720 km/h at 6 g: 16.62°/s, as in the compass test.
    assert segment.turn_rate_source == 'kinematic (level turn)'
    assert segment.turn_rate_degs == pytest.approx(16.62, abs=0.01)


def test_drops_repeated_and_invalid_samples() -> None:
    lines, _ = steady_turn(seconds=1)
    lines.insert(5, dict(lines[4]))
    lines.insert(8, {'t': 0.3, 'error': 'timeout'})
    lines.insert(9, {'t': 0.31, 'state': {'valid': False}})
    samples, duplicates, errors = parse_samples(lines)
    assert duplicates == 1
    assert errors == 2
    assert len(samples) == 21


def test_peak_pull_reports_speed_and_turn_rate_at_the_peak() -> None:
    lines = [line(i / 20, 700.0, 3000.0, 1 + 8 * math.sin(math.pi * i / 60), 4.0 * i / 20)
             for i in range(61)]  # fmt: skip
    peak = peak_pull(parse_samples(lines)[0])
    assert peak['ny'] == pytest.approx(9.0)
    assert peak['t'] == pytest.approx(1.5)
    assert peak['turn_rate_degs'] == pytest.approx(4.0)


def test_analyse_run_round_trips_through_a_log_file(tmp_path: Path) -> None:
    lines, omega = steady_turn()
    run = load_run(write_run(tmp_path, lines))
    assert run.meta == META
    assert run.effective_hz == pytest.approx(20.0)
    result = analyse_run(run)
    assert result['has_heading'] is True
    assert result['has_thrust'] is False
    assert result['fuel_capacity_kg'] is None
    assert result['steady_segments'][0]['turn_rate_degs'] == pytest.approx(omega, abs=0.01)
    json.dumps(result)  # must be plain JSON


def test_summarise_gives_mean_and_sample_spread() -> None:
    stats = summarise([12.1, 12.4, 12.7])
    assert stats['mean'] == pytest.approx(12.4)
    assert stats['spread'] == pytest.approx(0.3)
    assert stats['runs'] == 3


class FakeGame(BaseHTTPRequestHandler):
    valid = True

    def do_GET(self) -> None:
        if self.path == '/map_obj.json':
            body: object = [
                {'type': 'airfield', 'icon': 'none', 'sx': 0.1},
                {'type': 'aircraft', 'icon': 'Player', 'x': 0.4, 'y': 0.6, 'dx': 0.0, 'dy': -1.0},
                {'type': 'aircraft', 'icon': 'Fighter', 'x': 0.5, 'y': 0.5, 'dx': 1.0, 'dy': 0.0},
            ]
        else:
            body = {'valid': self.valid, 'IAS, km/h': 800.0, 'TAS, km/h': 850.0, 'H, m': 1000.0,
                    'Ny': 1.0, 'M': 0.7, 'compass': 12.0, 'Mfuel0, kg': 7110}  # fmt: skip
        payload = json.dumps(body).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format: str, *args: object) -> None:
        pass


@pytest.fixture
def fake_game():
    server = HTTPServer(('127.0.0.1', 0), FakeGame)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f'http://127.0.0.1:{server.server_port}'
    server.shutdown()


def test_records_raw_telemetry_with_metadata(fake_game: str, tmp_path: Path) -> None:
    meta = META.model_copy(update={'url': fake_game, 'target_hz': 50.0})
    log, samples = record(meta, tmp_path, duration_s=0.3)
    assert samples >= 3
    assert log == tmp_path / '2.59.0.65' / 'f_16c_block_50' / 'C-1.jsonl.gz'
    with gzip.open(log, 'rt') as f:
        first = json.loads(f.readline())
    assert first['state']['IAS, km/h'] == 800.0
    assert first['indicators']['compass'] == 12.0
    # Only the player's map entry is kept: it carries the heading vector.
    assert first['player'] == {'type': 'aircraft', 'icon': 'Player', 'x': 0.4, 'y': 0.6,
                               'dx': 0.0, 'dy': -1.0}  # fmt: skip
    assert load_run(log).fuel_capacity_kg == 7110
    saved = RunMetadata.model_validate_json(log.with_name('C-1.meta.json').read_text())
    assert saved.recorded_at  # timestamped when recording started
    with pytest.raises(FileExistsError):
        record(meta, tmp_path, duration_s=0.1)


def test_refuses_to_record_when_the_game_is_not_in_a_flight(fake_game: str, tmp_path: Path) -> None:
    FakeGame.valid = False
    try:
        with pytest.raises(TelemetryUnavailable, match='spawn into a flight'):
            record(META.model_copy(update={'url': fake_game}), tmp_path, duration_s=0.1)
    finally:
        FakeGame.valid = True
    with pytest.raises(TelemetryUnavailable):
        record(META.model_copy(update={'url': 'http://127.0.0.1:9'}), tmp_path, duration_s=0.1)
