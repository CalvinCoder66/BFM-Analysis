import { getAircraft } from '../data/aircraft';
import type { Aircraft } from '../data/aircraft-schema';
import {
  envelope,
  gLimitsFor,
  pointPerformance,
  resolveCondition,
  speedLimits,
  summarise,
  thrustAt,
  turnRadius,
  turnRate,
  turnRateAtPs,
} from './performance';

/**
 * Synthetic aircraft with constant tables so expected values can be worked out by hand:
 * W = 10 000 kg × g, S = 30 m², CLmax 1.5, CD = 0.02 + 0.1·CL², T = 60 kN, 8 g fly-by-wire limit.
 * Expected numbers below were computed independently from the textbook formulas.
 */
const fixture: Aircraft = {
  id: 'fixture',
  name: 'Fixture',
  nation: 'Test',
  source: 'mock',
  gamePatch: null,
  notes: '',
  wingArea_m2: 30,
  emptyMass_kg: 9_000,
  internalFuel_kg: 2_000,
  // Wing-break 20.4 g at 10 t; the fly-by-wire limiter caps everything at 8 g.
  gLimits: { wingBreakLoad_N: 2_000_000, fcs: 8, instructorFraction: 0.85 },
  maxIas_kmh: 1_200,
  maxMach: 2,
  aero: { mach: [0, 2], clMax: [1.5, 1.5], cd0: [0.02, 0.02], k: [0.1, 0.1] },
  thrust: {
    altitude_m: [0, 10_000],
    mach: [0, 2],
    afterburner_N: [
      [60_000, 60_000],
      [60_000, 60_000],
    ],
  },
  loadouts: [
    { id: 'clean', name: 'Clean', mass_kg: 0, cd0Delta: 0 },
    { id: 'heavy', name: 'Heavy', mass_kg: 1_000, cd0Delta: 0.01 },
  ],
};

// 9 000 kg empty + 50% of 2 000 kg fuel = 10 000 kg.
const seaLevel = resolveCondition(fixture, {
  altitude_m: 0,
  fuelFraction: 0.5,
  loadoutId: 'clean',
});

describe('resolveCondition', () => {
  it('adds fuel fraction and loadout mass to the empty mass', () => {
    expect(seaLevel.mass_kg).toBe(10_000);
    const heavy = resolveCondition(fixture, {
      altitude_m: 0,
      fuelFraction: 1,
      loadoutId: 'heavy',
    });
    expect(heavy.mass_kg).toBe(12_000);
    expect(heavy.cd0Delta).toBe(0.01);
  });

  it('clamps fuel fraction to 0–1', () => {
    const over = resolveCondition(fixture, {
      altitude_m: 0,
      fuelFraction: 1.5,
      loadoutId: 'clean',
    });
    expect(over.mass_kg).toBe(11_000);
  });

  it('rejects unknown loadouts', () => {
    expect(() =>
      resolveCondition(fixture, { altitude_m: 0, fuelFraction: 0.5, loadoutId: 'nope' }),
    ).toThrow(/unknown loadout/i);
  });
});

describe('G limits (War Thunder model)', () => {
  // 1 176 798 N of wing-break load is exactly 12 g at 10 t.
  const noFbw: Aircraft = {
    ...fixture,
    gLimits: { wingBreakLoad_N: 1_176_798, fcs: null, instructorFraction: 0.85 },
  };

  it('derives wing-break and instructor G from the wing-break force and weight', () => {
    const limits = gLimitsFor(noFbw, 10_000 * 9.80665);
    expect(limits.wingBreak).toBeCloseTo(12, 6);
    expect(limits.instructor).toBeCloseTo(10.2, 6);
  });

  it('lowers the wing-break G as the jet gets heavier', () => {
    expect(gLimitsFor(noFbw, 12_000 * 9.80665).wingBreak).toBeCloseTo(10, 6);
  });

  it('lets a fly-by-wire limiter cap the instructor G', () => {
    expect(gLimitsFor(fixture, 10_000 * 9.80665).instructor).toBe(8);
  });

  it('uses the instructor limit, or the pilot G if lower', () => {
    const base = { altitude_m: 0, fuelFraction: 0.5, loadoutId: 'clean' };
    expect(resolveCondition(noFbw, base).gLimit).toBeCloseTo(10.2, 6);
    expect(resolveCondition(noFbw, { ...base, pilotG: 7 }).gLimit).toBe(7);
    // A pilot G above the instructor's cannot exceed it.
    expect(resolveCondition(noFbw, { ...base, pilotG: 11 }).gLimit).toBeCloseTo(10.2, 6);
  });

  it('carries a custom store load instead of the loadout', () => {
    // 1 000 kg of stores on 10 t: 11 t, so the 12 g wing-break force gives 10.909 g.
    const loaded = resolveCondition(noFbw, {
      altitude_m: 0,
      fuelFraction: 0.5,
      loadoutId: 'clean',
      customLoad: { mass_kg: 1_000, cd0Delta: 0.004 },
    });
    expect(loaded.mass_kg).toBe(11_000);
    expect(loaded.cd0Delta).toBe(0.004);
    expect(loaded.gLimits.wingBreak).toBeCloseTo(12 / 1.1, 6);
  });
});

describe('pilot G cap', () => {
  const smooth = resolveCondition(fixture, {
    altitude_m: 0,
    fuelFraction: 0.5,
    loadoutId: 'clean',
    pilotG: 6,
  });

  it('caps turn rate and moves corner speed down', () => {
    const p = pointPerformance(smooth, 200);
    expect(p.maxG).toBe(6);
    expect(p.limitedBy).toBe('g-limit');
    expect(p.itr).toBeCloseTo(16.621, 2);
    expect(speedLimits(smooth).cornerTas).toBeCloseTo(146.109, 2);
  });

  it('bleeds less energy than pulling to the limiter', () => {
    expect(pointPerformance(smooth, 200).psAtMaxG).toBeGreaterThan(
      pointPerformance(seaLevel, 200).psAtMaxG,
    );
  });
});

describe('turn plane', () => {
  it('uses g·√(n² − cos²θ) for the circle-average rate', () => {
    // Vertical loop: cos θ = 0, so ω = g·n / V.
    expect(turnRate(5, 200, Math.PI / 2)).toBeCloseTo((9.80665 * 5) / 200, 9);
    // 60° plane: cos²θ = 0.25.
    expect(turnRate(Math.SQRT2, 100, Math.PI / 3)).toBeCloseTo(0.12973, 5);
  });

  it('raises turn rate but not sustained G in a vertical turn', () => {
    const vertical = resolveCondition(fixture, {
      altitude_m: 0,
      fuelFraction: 0.5,
      loadoutId: 'clean',
      turnPlane_deg: 90,
    });
    const level = pointPerformance(seaLevel, 200);
    const loop = pointPerformance(vertical, 200);
    expect(loop.sustainedG).toBeCloseTo(level.sustainedG, 9);
    expect(level.str).toBeCloseTo(16.29, 2);
    expect(loop.str).toBeCloseTo(16.53, 2);
  });
});

describe('turnRate / turnRadius', () => {
  it('uses the level-turn formulas', () => {
    // n = √2 → √(n² − 1) = 1, so ω = g / V and r = V² / g.
    expect(turnRate(Math.SQRT2, 100)).toBeCloseTo(0.0980665, 6);
    expect(turnRadius(Math.SQRT2, 100)).toBeCloseTo(1019.716, 2);
  });

  it('returns no turn at or below 1 g', () => {
    expect(turnRate(1, 100)).toBe(0);
    expect(turnRadius(0.8, 100)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('pointPerformance', () => {
  it('is lift-limited below corner speed', () => {
    const p = pointPerformance(seaLevel, 150);
    expect(p.limitedBy).toBe('lift');
    expect(p.maxG).toBeCloseTo(6.3238, 3);
    expect(p.itr).toBeCloseTo(23.39, 2);
    expect(p.itrRadius).toBeCloseTo(367.43, 1);
    expect(p.sustainedG).toBeCloseTo(4.7159, 3);
    expect(p.str).toBeCloseTo(17.263, 2);
    expect(p.strRadius).toBeCloseTo(497.84, 1);
    expect(p.psAt1g).toBeCloseTo(75.569, 2);
    expect(p.psAtMaxG).toBeCloseTo(-63.159, 2);
  });

  it('is G-limited above corner speed', () => {
    const p = pointPerformance(seaLevel, 200);
    expect(p.limitedBy).toBe('g-limit');
    expect(p.liftLimitG).toBeCloseTo(11.242, 2);
    expect(p.maxG).toBe(8);
    expect(p.itr).toBeCloseTo(22.299, 2);
    expect(p.sustainedG).toBeCloseTo(5.884, 2);
    expect(p.str).toBeCloseTo(16.29, 2);
    expect(p.psAtMaxG).toBeCloseTo(-78.396, 2);
  });

  it('reports no sustained turn when thrust cannot hold level flight', () => {
    const weak = resolveCondition(
      {
        ...fixture,
        thrust: {
          ...fixture.thrust,
          afterburner_N: fixture.thrust.afterburner_N.map((r) => r.map(() => 5_000)),
        },
      },
      { altitude_m: 0, fuelFraction: 0.5, loadoutId: 'clean' },
    );
    const p = pointPerformance(weak, 250);
    expect(p.sustainedG).toBeLessThan(1);
    expect(p.str).toBe(0);
    expect(p.strRadius).toBe(Number.POSITIVE_INFINITY);
    expect(p.psAt1g).toBeLessThan(0);
  });
});

describe('turnRateAtPs', () => {
  it('matches the sustained turn rate on the Ps = 0 line', () => {
    expect(turnRateAtPs(seaLevel, 200, 0)).toBeCloseTo(pointPerformance(seaLevel, 200).str, 6);
  });

  it('gives lower turn rates for positive Ps', () => {
    expect(turnRateAtPs(seaLevel, 200, 50)).toBeCloseTo(10.839, 2);
  });

  it('returns null when the contour lies above the available G', () => {
    // Ps = −100 m/s at 200 m/s needs 8.49 g, above the 8 g limit.
    expect(turnRateAtPs(seaLevel, 200, -100)).toBeNull();
  });
});

describe('speedLimits', () => {
  it('computes stall, corner and placard speeds', () => {
    const limits = speedLimits(seaLevel);
    expect(limits.stallTas).toBeCloseTo(59.649, 2);
    expect(limits.cornerTas).toBeCloseTo(168.712, 2);
    // 1 200 km/h IAS = 333.3 m/s, which equals TAS at sea level and is below Mach 2.
    expect(limits.maxTas).toBeCloseTo(333.33, 1);
  });

  it('returns no corner speed when it lies beyond the placard limit', () => {
    const high = resolveCondition(fixture, {
      altitude_m: 10_000,
      fuelFraction: 0.5,
      loadoutId: 'clean',
    });
    expect(
      speedLimits({ ...high, aircraft: { ...fixture, maxIas_kmh: 300 } }).cornerTas,
    ).toBeNull();
  });
});

describe('envelope and summary', () => {
  it('peaks ITR and minimum radius at corner speed', () => {
    const summary = summarise(seaLevel);
    expect(summary.maxItr.tas).toBeCloseTo(168.712, 2);
    expect(summary.maxItr.value).toBeCloseTo(26.434, 2);
    expect(summary.minRadius.value).toBeCloseTo(365.68, 0);
    expect(summary.wingLoading_kgm2).toBeCloseTo(333.33, 1);
    expect(summary.thrustToWeight).toBeCloseTo(60_000 / (10_000 * 9.80665), 6);
  });

  it('spans stall speed to the placard limit in ascending order', () => {
    const curve = envelope(seaLevel, 50);
    expect(curve[0]?.tas).toBeCloseTo(59.649, 2);
    expect(curve.at(-1)?.tas).toBeCloseTo(333.33, 1);
    expect(curve.every((p, i) => i === 0 || p.tas >= (curve[i - 1]?.tas ?? 0))).toBe(true);
  });

  it('keeps sustained rate at or below instantaneous rate everywhere', () => {
    for (const p of envelope(seaLevel)) expect(p.str).toBeLessThanOrEqual(p.itr + 1e-9);
  });
});

describe('scenario sensitivity (mock F-16C)', () => {
  const f16 = getAircraft('f-16c');
  const at = (config: Partial<Parameters<typeof resolveCondition>[1]>) =>
    summarise(
      resolveCondition(f16, { altitude_m: 0, fuelFraction: 0.5, loadoutId: 'clean', ...config }),
    );

  it('loses turn performance with altitude', () => {
    const low = at({ altitude_m: 0 });
    const high = at({ altitude_m: 8_000 });
    expect(high.maxItr.value).toBeLessThan(low.maxItr.value);
    expect(high.maxStr.value).toBeLessThan(low.maxStr.value);
    expect(high.minRadius.value).toBeGreaterThan(low.minRadius.value);
  });

  it('loses sustained rate with more fuel and heavier loadouts', () => {
    const light = at({ fuelFraction: 0.2 });
    const full = at({ fuelFraction: 1 });
    const loaded = at({ loadoutId: '2xfox2-4xfox3' });
    expect(full.maxStr.value).toBeLessThan(light.maxStr.value);
    expect(loaded.maxStr.value).toBeLessThan(at({}).maxStr.value);
    expect(full.thrustToWeight).toBeLessThan(light.thrustToWeight);
  });

  it('interpolates thrust between altitude rows', () => {
    const rows = f16.thrust.afterburner_N;
    const [a0, a1] = [rows[0]?.[0] ?? 0, rows[1]?.[0] ?? 0];
    const midAltitude = ((f16.thrust.altitude_m[0] ?? 0) + (f16.thrust.altitude_m[1] ?? 0)) / 2;
    expect(thrustAt(f16, midAltitude, 0)).toBeCloseTo((a0 + a1) / 2, 6);
  });
});
