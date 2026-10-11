import { sideConfig, testScenario } from '../../test/scenarios';
import { computeMatchup } from '../comparison/matchup';
import { FOCUSES, fightResults } from './focus';

describe('fightResults', () => {
  const scenario = testScenario();
  const m = computeMatchup(scenario);
  const [one, two, energy] = fightResults(m, scenario, 'kmh');

  it('gives the 1-circle fight to the tighter radius and quotes both radii', () => {
    const [a, d] = [
      m.attacker.pull.summary.minRadius.value,
      m.defender.pull.summary.minRadius.value,
    ];
    expect(one?.verdict.winner).toBe(a < d ? 'attacker' : 'defender');
    expect(one?.detail).toBe(`${Math.round(Math.abs(a - d))} m tighter`);
    expect(one?.figures).toEqual(['Min radius', `${Math.round(a)} m`, `${Math.round(d)} m`]);
  });

  it('gives the 2-circle fight to the higher sustained rate', () => {
    expect(two?.verdict.winner).toBe('attacker');
    expect(two?.detail).toMatch(/^\+\d+\.\d°\/s sustained$/);
  });

  it('gives energy to whoever has more speed left after the turn', () => {
    const smooth = testScenario({
      attacker: sideConfig('f-16c', { pilotG: 6 }),
      defender: sideConfig('f-16c'),
    });
    const [, , result] = fightResults(computeMatchup(smooth), smooth, 'kts');
    expect(result?.verdict.winner).toBe('attacker');
    expect(result?.detail).toMatch(/kts after 20 s$/);
    expect(energy?.figures[0]).toBe('Speed after 20 s turning');
  });
});

describe('FOCUSES', () => {
  it('has a summary and a drill-down for each fight, each with charts', () => {
    expect(FOCUSES.map((f) => f.id)).toEqual(['summary', 'one-circle', 'two-circle', 'energy']);
    for (const focus of FOCUSES) expect(focus.charts.length).toBeGreaterThan(0);
  });

  it('keeps the drill-downs short, with the rest behind "more"', () => {
    const scenario = testScenario();
    for (const focus of FOCUSES.filter((f) => f.id !== 'summary')) {
      const shown = focus.sections(scenario).flatMap((s) => s.metrics);
      expect(shown.length).toBeLessThanOrEqual(4);
      expect(focus.more(scenario).length).toBeGreaterThan(0);
    }
  });
});
