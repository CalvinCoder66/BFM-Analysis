import json
from pathlib import Path

from typer.testing import CliRunner

from bfm_pipeline.cli import app
from bfm_pipeline.roster import Roster

runner = CliRunner()


def test_roster_writes_json_and_markdown(datamine: Path, tmp_path: Path) -> None:
    out = tmp_path / 'out'
    result = runner.invoke(app, ['roster', '--datamine', str(datamine), '--out', str(out)])
    assert result.exit_code == 0, result.output
    assert '5 aircraft (7 units' in result.output

    roster = Roster.model_validate_json((out / 'roster.json').read_text())
    assert roster.provenance.game_version == '2.59.0.65'
    assert len(roster.entries) == 5

    markdown = (out / 'ROSTER.md').read_text()
    assert 'War Thunder **2.59.0.65**' in markdown
    assert '**5 aircraft** with a unique flight model, covering 7 in-game units' in markdown
    # The merged MLU row names the copies folded into it.
    mlu = next(line for line in markdown.splitlines() if 'F-16A Block 20 MLU' in line)
    assert '13.3–13.7' in mlu
    assert 'F-16AM Block 20 MLU Fighting Falcon (Sweden, 13.7)' in mlu
    assert '## Excluded' in markdown


def test_extract_writes_a_report_and_fails_on_broken_flight_models(
    datamine: Path, tmp_path: Path
) -> None:
    out = tmp_path / 'out'
    args = ['extract', '--datamine', str(datamine), '--out', str(out), '--scratch', str(out)]
    result = runner.invoke(app, args)
    assert result.exit_code == 0, result.output
    assert '5 aircraft extracted, 0 failed' in result.output
    report = (out / 'EXTRACTION.md').read_text()
    f16c = next(line for line in report.splitlines() if 'F-16CM Block 50' in line)
    # 27.9 m², 9,151 kg empty, wing-break G at half fuel = 1.54 MN / (12,350 kg × g) = 12.7.
    assert '| 27.9 |' in f16c
    assert '| 9,151 |' in f16c
    assert '| 12.7 |' in f16c

    fm = datamine / 'aces.vromfs.bin_u/gamedata/flightmodels/fm/f-4s.blkx'
    fm.write_text(json.dumps({'Aerodynamics': {}, 'Areas': {}}))
    broken = runner.invoke(app, args)
    assert broken.exit_code == 1
    assert 'f-4s' in broken.output
    assert '## Failed' in (out / 'EXTRACTION.md').read_text()
    assert (out / 'extraction.json').is_file()


def test_inspect_prints_a_dotted_path(datamine: Path) -> None:
    args = ['inspect', 'f_16c_block_50', '--path', 'Mass', '--datamine', str(datamine)]
    result = runner.invoke(app, args)
    assert result.exit_code == 0, result.output
    assert json.loads(result.output) == {
        'EmptyMass': 9031.0,
        'MaxFuelMass0': 6398.0,
        'OilMass': 30.0,
    }

    unit = runner.invoke(app, [*args[:2], '--unit', '--path', 'autopilotImpl', *args[4:]])
    assert json.loads(unit.output) == 'FBW'


def test_inspect_reports_unknown_units_and_paths(datamine: Path) -> None:
    missing = runner.invoke(app, ['inspect', 'yak_9', '--datamine', str(datamine)])
    assert missing.exit_code == 1
    bad_path = runner.invoke(
        app, ['inspect', 'f_16c_block_50', '--path', 'Mass.Nope', '--datamine', str(datamine)]
    )
    assert bad_path.exit_code == 1


def test_analyse_explains_a_missing_log(tmp_path: Path) -> None:
    result = runner.invoke(app, ['analyse', str(tmp_path / 'A-0.jsonl.gz')])
    assert result.exit_code == 1
    assert 'no flight log at' in result.output
    assert 'Traceback' not in result.output


def test_record_explains_a_refused_connection(tmp_path: Path) -> None:
    args = ['record', '--aircraft', 'ef_2000_fgr4', '--card', 'A', '--run', '0', '--duration', '1']
    result = runner.invoke(app, [*args, '--url', 'http://127.0.0.1:9', '--out', str(tmp_path)])
    assert result.exit_code == 1
    assert 'Connection refused' in result.output
    assert 'mirrored' in result.output
    assert not any(tmp_path.iterdir())  # no half-written run left behind
