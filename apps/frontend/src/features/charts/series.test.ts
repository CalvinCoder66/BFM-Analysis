import type { PlotData } from 'plotly.js';
import { kmhToMs, msToKnots } from '../../physics/units';
import { computeMatchup, type Scenario } from '../comparison/matchup';
import {
  advantageChart,
  type ChartOptions,
  emDiagram,
  energyChart,
  PS_CONTOURS,
  RADIUS_LINES,
  radiusChart,
  SIDE_COLOURS,
} from './series';

const scenario: Scenario = {
  altitude_m: 1_000,
  mergeCas: kmhToMs(800),
  attacker: { aircraftId: 'f-16c', fuelFraction: 0.5, loadoutId: 'clean' },
  defender: { aircraftId: 'mig-29', fuelFraction: 0.5, loadoutId: 'clean' },
};
const matchup = computeMatchup(scenario);
const opts: ChartOptions = { unit: 'kmh', showPsContours: true, showRadiusLines: true };

const traces = (data: unknown[]) => data as Partial<PlotData>[];
const named = (data: unknown[], fragment: string) =>
  traces(data).filter((t) => t.name?.includes(fragment));
const numbers = (values: unknown) =>
  (values as (number | null)[]).filter((v) => v !== null) as number[];

describe('emDiagram', () => {
  it('draws a max-turn and a sustained line per aircraft in the side colour', () => {
    const { data } = emDiagram(matchup, scenario, opts);
    const maxTurn = named(data, 'max turn');
    const sustained = named(data, 'sustained');
    expect(maxTurn.map((t) => t.line?.color)).toEqual([
      SIDE_COLOURS.attacker,
      SIDE_COLOURS.defender,
    ]);
    expect(sustained.map((t) => t.line?.dash)).toEqual(['dash', 'dash']);
    expect(maxTurn[0]?.name).toContain('F-16C');
    expect(maxTurn[1]?.name).toContain('MiG-29');
  });

  it('plots turn rate against IAS in the selected unit', () => {
    const kmh = named(emDiagram(matchup, scenario, opts).data, 'max turn')[0];
    const kts = named(emDiagram(matchup, scenario, { ...opts, unit: 'kts' }).data, 'max turn')[0];
    const lastKmh = numbers(kmh?.x).at(-1) ?? 0;
    const lastKts = numbers(kts?.x).at(-1) ?? 0;
    // Same curve, different unit: the last point is the F-16's 1 480 km/h IAS placard.
    expect(lastKmh).toBeCloseTo(1_480, 0);
    expect(lastKts).toBeCloseTo(msToKnots(kmhToMs(1_480)), 0);
    expect(kmh?.y).toEqual(kts?.y);
  });

  it('adds Ps contours and radius lines only when enabled', () => {
    const all = emDiagram(matchup, scenario, opts).data;
    const bare = emDiagram(matchup, scenario, {
      ...opts,
      showPsContours: false,
      showRadiusLines: false,
    }).data;
    expect(named(all, ' · Ps ')).toHaveLength(2 * PS_CONTOURS.length);
    expect(named(all, 'r ')).toHaveLength(RADIUS_LINES.length);
    expect(all.length - bare.length).toBe(2 * PS_CONTOURS.length + RADIUS_LINES.length);
  });

  it('marks the merge speed and leaves headroom above the best ITR', () => {
    const { layout } = emDiagram(matchup, scenario, opts);
    expect(layout.shapes?.[0]?.x0).toBeCloseTo(800, 6);
    const best = Math.max(
      matchup.attacker.summary.maxItr.value,
      matchup.defender.summary.maxItr.value,
    );
    const range = layout.yaxis?.range as [number, number];
    expect(range[1]).toBeGreaterThan(best);
  });

  it('draws radius lines whose turn rate equals TAS / radius', () => {
    const line = named(emDiagram(matchup, scenario, opts).data, 'r 500 m')[0];
    const ys = numbers(line?.y);
    // Turn rate on a constant-radius line grows with speed.
    expect(ys.every((y, i) => i === 0 || y > (ys[i - 1] ?? 0))).toBe(true);
  });
});

describe('advantageChart', () => {
  it('splits the delta into attacker-positive and defender-negative filled areas', () => {
    const { data } = advantageChart(matchup, scenario, opts);
    const attacker = named(data, 'F-16C Block 50 better · sustained')[0];
    const defender = named(data, 'MiG-29 (9-12) better · sustained')[0];
    expect(numbers(attacker?.y).every((v) => v >= 0)).toBe(true);
    expect(numbers(defender?.y).every((v) => v <= 0)).toBe(true);
    expect(attacker?.fill).toBe('tozeroy');
  });
});

describe('radiusChart', () => {
  it('replaces infinite radii (no sustained turn) with gaps', () => {
    const { data } = radiusChart(matchup, scenario, opts);
    for (const trace of traces(data)) {
      expect((trace.y as (number | null)[]).every((v) => v === null || Number.isFinite(v))).toBe(
        true,
      );
    }
  });
});

describe('energyChart', () => {
  it('plots Ps at 1 g above Ps at max G for every speed', () => {
    const { data } = energyChart(matchup, scenario, opts);
    const oneG = numbers(named(data, 'F-16C Block 50 · Ps at 1 g')[0]?.y);
    const maxG = numbers(named(data, 'F-16C Block 50 · Ps at max G')[0]?.y);
    expect(oneG.length).toBe(maxG.length);
    oneG.forEach((v, i) => {
      expect(v).toBeGreaterThanOrEqual((maxG[i] ?? Number.POSITIVE_INFINITY) - 1e-9);
    });
  });
});
