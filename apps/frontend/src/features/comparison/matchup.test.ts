import { kmhToMs } from '../../physics/units';
import { testScenario as scenario, sideConfig } from '../../test/scenarios';
import {
  compareMetric,
  computeMatchup,
  computeSide,
  energyVerdict,
  oneCircleVerdict,
  sideMergeCas,
  timelineVerdict,
  turnRateDelta,
  twoCircleVerdict,
} from './matchup';

const f16 = sideConfig('f-16c');
const mig = sideConfig('mig-29');

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
    expect(side.pull.atMerge?.cas).toBeCloseTo(kmhToMs(700), 3);
    // TAS is well above IAS at 6 km.
    expect(side.pull.atMerge?.tas).toBeGreaterThan(kmhToMs(700) * 1.25);
    expect(side.pull.timeline[0]?.cas).toBeCloseTo(kmhToMs(700), 3);
  });

  it('has no merge point when the merge speed is below stall speed', () => {
    expect(computeSide(f16, 1_000, kmhToMs(100)).pull.atMerge).toBeNull();
  });

  it('flies the same as full pull when the pilot yanks', () => {
    const side = computeSide(mig, 1_000, kmhToMs(800));
    expect(side.flown).toBe(side.pull);
    expect(side.pull.condition.gLimit).toBeCloseTo(side.pull.condition.gLimits.instructor, 9);
  });

  it('keeps full pull at the limiter but flies at the pilot G when smooth', () => {
    const side = computeSide({ ...mig, pilotG: 7 }, 1_000, kmhToMs(800));
    expect(side.flown.condition.gLimit).toBe(7);
    expect(side.pull.condition.gLimit).toBeGreaterThan(7);
    expect(side.flown.atMerge?.psAtMaxG).toBeGreaterThan(side.pull.atMerge?.psAtMaxG ?? 0);
  });

  it('raises the G limit and best ITR when the instructor is off', () => {
    const on = computeSide(mig, 1_000, kmhToMs(800));
    const off = computeSide({ ...mig, limiter: 'off' }, 1_000, kmhToMs(800));
    expect(off.pull.condition.gLimit).toBeGreaterThan(on.pull.condition.gLimit);
    expect(off.pull.summary.maxItr.value).toBeGreaterThan(on.pull.summary.maxItr.value);
  });

  it('simulates the turn for the requested duration', () => {
    expect(computeSide(f16, 1_000, kmhToMs(800), 30).flown.timeline.at(-1)?.t).toBeCloseTo(30, 6);
  });

  it('falls back to the first loadout when the loadout id does not exist on the aircraft', () => {
    const side = computeSide({ ...f16, loadoutId: '2xfox2-6xfox1' }, 1_000, kmhToMs(800));
    expect(side.loadout.id).toBe('clean');
  });
});

describe('own merge speed', () => {
  it('overrides the scenario merge speed for that jet only', () => {
    const s = scenario({ attacker: { ...f16, mergeCas: kmhToMs(1_000) } });
    expect(sideMergeCas(s, 'attacker')).toBeCloseTo(kmhToMs(1_000), 9);
    expect(sideMergeCas(s, 'defender')).toBe(s.mergeCas);
    const m = computeMatchup(s);
    expect(m.attacker.pull.atMerge?.cas).toBeCloseTo(kmhToMs(1_000), 6);
    expect(m.defender.pull.atMerge?.cas).toBeCloseTo(kmhToMs(800), 6);
    // The turn from the merge starts at each jet's own speed.
    expect(m.attacker.flown.timeline[0]?.cas).toBeCloseTo(kmhToMs(1_000), 6);
    expect(m.defender.flown.timeline[0]?.cas).toBeCloseTo(kmhToMs(800), 6);
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
      scenario({ defender: sideConfig('f-16c', { fuelFraction: 1, loadoutId: '2xfox2-4xfox3' }) }),
    );
    expect(oneCircleVerdict(m).winner).toBe('attacker');
    expect(twoCircleVerdict(m).winner).toBe('attacker');
    expect(timelineVerdict(m).winner).toBe('attacker');
  });

  it('judges the 1-circle fight at full pull, whatever the pilot style', () => {
    const yanking = computeMatchup(scenario());
    const smooth = computeMatchup(scenario({ attacker: { ...f16, pilotG: 5 } }));
    expect(oneCircleVerdict(smooth)).toEqual(oneCircleVerdict(yanking));
  });

  it('judges the 2-circle fight as flown, so a timid pilot can lose it', () => {
    // Holding only 4 g, the F-16C cannot use its sustained-rate advantage.
    expect(twoCircleVerdict(computeMatchup(scenario())).winner).toBe('attacker');
    const timid = computeMatchup(scenario({ attacker: { ...f16, pilotG: 4 } }));
    expect(twoCircleVerdict(timid).winner).toBe('defender');
  });

  it('gives the yanking pilot more heading early in the turn', () => {
    const m = computeMatchup(
      scenario({ turnDuration_s: 5, attacker: { ...f16, pilotG: 5 }, defender: f16 }),
    );
    expect(timelineVerdict(m).winner).toBe('defender');
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
      scenario({ defender: sideConfig('f-16c', { fuelFraction: 1, loadoutId: '2xfox2-4xfox3' }) }),
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
        defender: sideConfig('su-27', { fuelFraction: 1, loadoutId: '2xfox2-6xfox1' }),
      }),
    );
    const points = turnRateDelta(m, 1_000);
    expect(points[0]?.str).toBeNull();
    expect(points.some((p) => p.str !== null)).toBe(true);
  });
});

describe('energyVerdict', () => {
  it('favours the jet with more airspeed left after the turn', () => {
    const smooth = computeMatchup(scenario({ attacker: { ...f16, pilotG: 6 }, defender: f16 }));
    expect(energyVerdict(smooth).winner).toBe('attacker');
    expect(energyVerdict(computeMatchup(scenario({ defender: f16 }))).winner).toBe('even');
  });

  it('counts height gained in a loop, not just the airspeed left', () => {
    const m = computeMatchup(scenario({ attacker: { ...f16, turnPlane_deg: 90 }, defender: f16 }));
    const end = m.attacker.flown.timeline.at(-1);
    const level = m.defender.flown.timeline.at(-1);
    // 20 s in, the looping jet is climbing into its second loop: slower, but higher.
    expect(end?.cas).toBeLessThan(level?.cas ?? 0);
    expect(end?.altitude).toBeGreaterThan(1_000);
    expect(energyVerdict(m).winner).toBe('attacker');
  });
});
