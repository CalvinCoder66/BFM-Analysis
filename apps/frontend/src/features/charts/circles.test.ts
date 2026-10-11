import { sideConfig, testScenario } from '../../test/scenarios';
import { computeMatchup } from '../comparison/matchup';
import { MERGE_SEPARATION_M, mergeTracks, scaleBarLength, trackBounds } from './circles';

const matchup = computeMatchup(
  testScenario({ attacker: sideConfig('f-16c', { pilotG: 6 }), turnDuration_s: 10 }),
);

describe('mergeTracks', () => {
  it('starts both jets either side of the merge, heading in opposite directions', () => {
    const { attacker, defender } = mergeTracks(matchup, 'two-circle');
    expect([attacker[0]?.x, attacker[0]?.y, attacker[0]?.heading]).toEqual([-200, 0, 0]);
    expect(defender[0]?.x).toBe(MERGE_SEPARATION_M / 2);
    expect(defender[0]?.y).toBeCloseTo(0, 9);
    expect(defender[0]?.heading).toBe(180);
    // First second: attacker flies north, defender south.
    expect(attacker[10]?.y).toBeGreaterThan(100);
    expect(defender[10]?.y).toBeLessThan(-100);
  });

  it('turns both jets towards each other in a 2-circle fight', () => {
    const { attacker, defender } = mergeTracks(matchup, 'two-circle');
    // Attacker turns right (east, +x); defender heading south turns right (west, −x).
    expect(attacker[30]?.x).toBeGreaterThan(-MERGE_SEPARATION_M / 2);
    expect(defender[30]?.x).toBeLessThan(MERGE_SEPARATION_M / 2);
  });

  it('turns the defender away in a 1-circle fight so both circle the same side', () => {
    const { attacker, defender } = mergeTracks(matchup, 'one-circle');
    expect(attacker[30]?.x).toBeGreaterThan(-MERGE_SEPARATION_M / 2);
    expect(defender[30]?.x).toBeGreaterThan(MERGE_SEPARATION_M / 2);
  });

  it('flies the 2-circle fight as the pilot does and the 1-circle fight at full pull', () => {
    const two = mergeTracks(matchup, 'two-circle').attacker;
    const one = mergeTracks(matchup, 'one-circle').attacker;
    expect(two[1]?.g).toBeCloseTo(6, 9);
    expect(one[1]?.g).toBeGreaterThan(6);
    expect(two.at(-1)?.turned).toBeCloseTo(matchup.attacker.flown.timeline.at(-1)?.heading ?? 0, 9);
    expect(one.at(-1)?.turned).toBeCloseTo(matchup.attacker.pull.timeline.at(-1)?.heading ?? 0, 9);
  });
});

describe('trackBounds', () => {
  it('returns a padded square containing every point', () => {
    const tracks = mergeTracks(matchup, 'two-circle');
    const b = trackBounds(tracks);
    expect(b.width).toBe(b.height);
    for (const p of [...tracks.attacker, ...tracks.defender]) {
      expect(p.x).toBeGreaterThan(b.minX);
      expect(p.x).toBeLessThan(b.minX + b.width);
      expect(p.y).toBeGreaterThan(b.minY);
      expect(p.y).toBeLessThan(b.minY + b.height);
    }
  });
});

describe('scaleBarLength', () => {
  it('picks the first round length of at least a fifth of the view', () => {
    expect(scaleBarLength(2_000)).toBe(500);
    expect(scaleBarLength(2_600)).toBe(1_000);
    expect(scaleBarLength(450)).toBe(100);
  });
});
