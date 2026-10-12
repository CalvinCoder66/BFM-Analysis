import type { Aircraft } from '../data/aircraft-schema';
import { G0 } from './atmosphere';
import { pointPerformance, resolveCondition } from './performance';
import { simulateTurn, type TimelinePoint } from './timeline';

// Same synthetic jet as performance.test.ts: 10 t, S 30 m², CLmax 1.5, CD 0.02 + 0.1·CL², 60 kN, 8 g.
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
  loadouts: [{ id: 'clean', name: 'Clean', mass_kg: 0, cd0Delta: 0 }],
};
const config = { altitude_m: 0, fuelFraction: 0.5, loadoutId: 'clean' };

describe('simulateTurn', () => {
  // At 200 m/s the fixture sustains 5.884 g (thrust = drag), turning at 16.29°/s on a 703 m radius.
  const sustained = resolveCondition(fixture, { ...config, pilotG: 5.883992289817947 });

  it('holds speed and turns at the sustained rate when pulling exactly sustained G', () => {
    const points = simulateTurn(sustained, 200, 10);
    const last = points.at(-1);
    expect(points).toHaveLength(101);
    expect(last?.t).toBeCloseTo(10, 9);
    expect(last?.tas).toBeCloseTo(200, 4);
    expect(last?.heading).toBeCloseTo(162.9, 1);
  });

  it('flies a circle of radius V / ω', () => {
    const radius = 703.447;
    // Turning right from heading north at the origin puts the centre at (r, 0).
    for (const p of simulateTurn(sustained, 200, 22)) {
      expect(Math.abs(Math.hypot(p.x - radius, p.y) - radius)).toBeLessThan(1);
    }
  });

  it('bleeds speed at g·Ps / V when pulling to the limiter', () => {
    const yank = resolveCondition(fixture, config);
    const [first, second] = simulateTurn(yank, 200, 1);
    const ps = pointPerformance(yank, 200).psAtMaxG; // −78.4 m/s
    expect(first?.g).toBe(8);
    expect((second?.tas ?? 0) - 200).toBeCloseTo((G0 * ps * 0.1) / 200, 6);
  });

  it('trades early heading for speed: yanking leads at first, smooth flying keeps its energy', () => {
    const yank = simulateTurn(resolveCondition(fixture, config), 200, 30);
    const smooth = simulateTurn(sustained, 200, 30);
    const at = (points: typeof yank, t: number) => points.find((p) => Math.abs(p.t - t) < 1e-6);
    expect(at(yank, 3)?.heading).toBeGreaterThan(at(smooth, 3)?.heading ?? 0);
    expect(at(yank, 30)?.tas).toBeLessThan(at(smooth, 30)?.tas ?? 0);
    // Yanking settles at a slow, lift-limited equilibrium instead of falling out of the sky.
    expect(at(yank, 30)?.tas).toBeGreaterThan(60);
  });
});

describe('simulateTurn in an inclined plane', () => {
  // No thrust and no drag, so Ps = 0: only gravity changes the speed, and V² + 2·g·h is conserved.
  const glider: Aircraft = {
    ...fixture,
    aero: { mach: [0, 2], clMax: [1.5, 1.5], cd0: [0, 0], k: [0, 0] },
    thrust: {
      ...fixture.thrust,
      afterburner_N: [
        [0, 0],
        [0, 0],
      ],
    },
  };
  const plane = (turnPlane_deg: number) => resolveCondition(glider, { ...config, turnPlane_deg });
  /** Highest point of the first loop. */
  const topOf = (points: TimelinePoint[]) =>
    points.filter((p) => p.heading < 360).reduce((top, p) => (p.altitude > top.altitude ? p : top));

  it('holds speed and altitude in a level turn', () => {
    for (const p of simulateTurn(plane(0), 200, 20)) {
      expect(p.tas).toBeCloseTo(200, 9);
      expect(p.altitude).toBe(0);
    }
  });

  it('trades speed for height round a loop, keeping total energy', () => {
    const points = simulateTurn(plane(90), 200, 25);
    expect(points.at(-1)?.heading).toBeGreaterThan(360);
    for (const p of points) {
      expect(p.tas ** 2 + 2 * G0 * p.altitude).toBeCloseTo(200 ** 2, 6);
      // Sea level, so CAS = TAS: the energy-equivalent speed is the entry speed throughout.
      expect(p.energyCas).toBeCloseTo(200, 6);
    }
    // The top of the loop is where the jet is slowest. The loop is egg-shaped: taller than the
    // diameter over the top, V² / (g·(n + 1)) × 2, but shorter than at the bottom, 200² / (7·g) × 2.
    const top = topOf(points);
    expect(top.heading).toBeCloseTo(180, -1);
    expect(top.altitude).toBeGreaterThan((2 * top.tas ** 2) / (G0 * (top.g + 1)));
    expect(top.altitude).toBeLessThan((2 * 200 ** 2) / (G0 * 7));
    expect(top.tas).toBe(Math.min(...points.filter((p) => p.heading < 360).map((p) => p.tas)));
    // A 45° plane climbs about sin 45° as high for the same in-plane geometry, so it slows less.
    const oblique = topOf(simulateTurn(plane(45), 200, 25));
    expect(oblique.altitude).toBeLessThan(top.altitude);
    expect(oblique.tas).toBeGreaterThan(top.tas);
  });

  it('applies the in-plane part of gravity to the turn rate', () => {
    const rate = (radPerS: number) => (radPerS * 180) / Math.PI;
    // Entry is the bottom: gravity takes g·sin θ away. Vertical: ω = g·(8 − 1) / 200.
    expect(simulateTurn(plane(90), 200, 1)[0]?.rate).toBeCloseTo(rate((G0 * 7) / 200), 9);
    // 45°: ω = g·(√(64 − ½) − √½) / 200 = 0.356059 rad/s.
    expect(simulateTurn(plane(45), 200, 1)[0]?.rate).toBeCloseTo(20.4007, 3);
    // Over the top of the loop gravity adds g: ω = g·(n + 1) / V (lift-limited below 8 g up there).
    const top = topOf(simulateTurn(plane(90), 200, 25));
    expect(top.rate).toBeCloseTo(rate((G0 * (top.g + 1)) / top.tas), 1);
  });
});
