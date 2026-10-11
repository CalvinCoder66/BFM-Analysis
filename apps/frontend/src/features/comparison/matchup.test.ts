import { kmhToMs } from '../../physics/units';
import {
  compareMetric,
  computeMatchup,
  computeSide,
  oneCircleVerdict,
  type Scenario,
  turnRateDelta,
  twoCircleVerdict,
} from './matchup';

const f16 = { aircraftId: 'f-16c', fuelFraction: 0.5, loadoutId: 'clean' };
const mig = { aircraftId: 'mig-29', fuelFraction: 0.5, loadoutId: 'clean' };
const scenario = (overrides: Partial<Scenario> = {}): Scenario => ({
  altitude_m: 1_000,
  mergeCas: kmhToMs(800),
  attacker: f16,
  defender: mig,
  ...overrides,
});

describe('compareMetric', () => {
  it('picks the higher value when higher is better and the lower otherwise', () => {
    expect(compareMetric(20, 18, true)).toEqual({ winner: 'attacker', margin: 2 });
    expect(compareMetric(20, 18, false)).toEqual({ winner: 'defender', margin: 2 });
  });

  it('calls differences under 2% even, and just over 2% a win', () => {
    expect(compareMetric(100, 98.1, true).winner).toBe('even');
    expect(compareMetric(100, 97.9, true).winner).toBe('attacker');
  });

  it('handles negative values such as energy bleed', () => {
    // −77 m/s bleeds less than −131 m/s.
    expect(compareMetric(-77, -131, true).winner).toBe('attacker');
  });
});

describe('computeSide', () => {
  it('evaluates the merge point at the merge speed converted from IAS', () => {
    const side = computeSide(f16, 6_000, kmhToMs(700));
    expect(side.atMerge?.cas).toBeCloseTo(kmhToMs(700), 3);
    // TAS is well above IAS at 6 km.
    expect(side.atMerge?.tas).toBeGreaterThan(kmhToMs(700) * 1.25);
  });

  it('has no merge point when the merge speed is below stall speed', () => {
    expect(computeSide(f16, 1_000, kmhToMs(100)).atMerge).toBeNull();
  });

  it('falls back to the first loadout when the loadout id does not exist on the aircraft', () => {
    const side = computeSide({ ...f16, loadoutId: '2xfox2-6xfox1' }, 1_000, kmhToMs(800));
    expect(side.loadout.id).toBe('clean');
  });
});

describe('verdicts', () => {
  it('calls a mirror matchup even', () => {
    const m = computeMatchup(scenario({ defender: f16 }));
    expect(oneCircleVerdict(m).winner).toBe('even');
    expect(twoCircleVerdict(m).winner).toBe('even');
  });

  it('flips the winner when the sides are swapped', () => {
    const forward = computeMatchup(scenario());
    const swapped = computeMatchup(scenario({ attacker: mig, defender: f16 }));
    const flip = { attacker: 'defender', defender: 'attacker', even: 'even' } as const;
    expect(oneCircleVerdict(swapped).winner).toBe(flip[oneCircleVerdict(forward).winner]);
    expect(twoCircleVerdict(swapped).winner).toBe(flip[twoCircleVerdict(forward).winner]);
  });

  it('favours the lighter, cleaner jet in a mirror matchup', () => {
    const m = computeMatchup(
      scenario({ defender: { aircraftId: 'f-16c', fuelFraction: 1, loadoutId: '2xfox2-4xfox3' } }),
    );
    expect(oneCircleVerdict(m).winner).toBe('attacker');
    expect(twoCircleVerdict(m).winner).toBe('attacker');
  });
});

describe('turnRateDelta', () => {
  it('is zero everywhere in a mirror matchup', () => {
    const points = turnRateDelta(computeMatchup(scenario({ defender: f16 })), 1_000, 40);
    for (const p of points) {
      expect(p.itr).toBeCloseTo(0, 9);
      expect(p.str).toBeCloseTo(0, 9);
    }
  });

  it('is positive where the attacker is the better-configured jet', () => {
    const m = computeMatchup(
      scenario({ defender: { aircraftId: 'f-16c', fuelFraction: 1, loadoutId: '2xfox2-4xfox3' } }),
    );
    const strDeltas = turnRateDelta(m, 1_000)
      .map((p) => p.str)
      .filter((v): v is number => v !== null);
    expect(Math.max(...strDeltas)).toBeGreaterThan(0.5);
    expect(Math.min(...strDeltas)).toBeGreaterThanOrEqual(-1e-9);
  });

  it('leaves gaps where one jet is below its stall speed', () => {
    // A heavy Su-27 stalls at a higher speed than a light F-16, so the low end must be null.
    const m = computeMatchup(
      scenario({
        attacker: { ...f16, fuelFraction: 0 },
        defender: { aircraftId: 'su-27', fuelFraction: 1, loadoutId: '2xfox2-6xfox1' },
      }),
    );
    const points = turnRateDelta(m, 1_000);
    expect(points[0]?.str).toBeNull();
    expect(points.some((p) => p.str !== null)).toBe(true);
  });
});
