import type { PlotData } from 'plotly.js';
import { kmhToMs, msToKnots } from '../../physics/units';
import { sideConfig, testScenario } from '../../test/scenarios';
import { computeMatchup } from '../comparison/matchup';
import {
  advantageChart,
  type ChartOptions,
  emDiagram,
  energyChart,
  HOVER_LABEL,
  MIN_RADIUS_G,
  PS_CONTOURS,
  RADIUS_LINES,
  radiusChart,
  SIDE_COLOURS,
  timelineChart,
} from './series';

const scenario = testScenario();
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
      matchup.attacker.pull.summary.maxItr.value,
      matchup.defender.pull.summary.maxItr.value,
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
  const { data, layout } = radiusChart(matchup, scenario, opts);
  const f16 = matchup.attacker.pull;

  it('only plots radii where the jet can pull at least 2 g', () => {
    const minRadius = named(data, 'F-16C Block 50 · min radius')[0]?.y as (number | null)[];
    const sustained = named(data, 'F-16C Block 50 · sustained radius')[0]?.y as (number | null)[];
    f16.curve.forEach((p, i) => {
      expect(minRadius[i] === null).toBe(p.maxG < MIN_RADIUS_G);
      expect(sustained[i] === null).toBe(p.sustainedG < MIN_RADIUS_G);
    });
    for (const trace of traces(data)) {
      expect((trace.y as (number | null)[]).every((v) => v === null || Number.isFinite(v))).toBe(
        true,
      );
    }
  });

  it('has no near-stall spike below corner speed', () => {
    // Lift-limited radius tends to Vs²/g well above stall; at 2 g it is only 2/√3 ≈ 1.155× that.
    const minRadius = named(data, 'F-16C Block 50 · min radius')[0]?.y as (number | null)[];
    const cornerTas = f16.summary.limits.cornerTas ?? 0;
    const belowCorner = minRadius.filter(
      (v, i) => v !== null && (f16.curve[i]?.tas ?? 0) < cornerTas,
    );
    expect(belowCorner.length).toBeGreaterThan(10);
    expect(Math.max(...(belowCorner as number[]))).toBeLessThan(1.2 * f16.summary.minRadius.value);
  });

  it('frames the y-axis around the minimum radii', () => {
    const top = (layout.yaxis?.range as number[] | undefined)?.[1] ?? 0;
    const larger = Math.max(
      f16.summary.minRadius.value,
      matchup.defender.pull.summary.minRadius.value,
    );
    expect(top).toBeGreaterThanOrEqual(4 * larger);
    expect(top).toBeLessThan(4 * larger + 500);
  });
});

describe('pilot G overlays', () => {
  const smooth = computeMatchup(testScenario({ attacker: sideConfig('f-16c', { pilotG: 7 }) }));

  it('adds a pilot-G line to the E-M diagram and energy chart only for a smooth pilot', () => {
    expect(named(emDiagram(matchup, scenario, opts).data, 'pilot')).toHaveLength(0);
    const em = named(emDiagram(smooth, scenario, opts).data, 'F-16C Block 50 · pilot 7.0 g');
    expect(em).toHaveLength(1);
    // The pilot line never exceeds 7 g worth of turn rate; full pull exceeds it at corner speed.
    const maxTurn = named(emDiagram(smooth, scenario, opts).data, 'F-16C Block 50 · max turn')[0];
    expect(Math.max(...numbers(em[0]?.y))).toBeLessThan(Math.max(...numbers(maxTurn?.y)));
    expect(named(energyChart(smooth, scenario, opts).data, 'Ps at pilot 7.0 g')).toHaveLength(1);
  });

  it('labels the max-turn line with the limiter G', () => {
    const names = traces(emDiagram(matchup, scenario, opts).data).map((t) => t.name);
    expect(names).toContain('F-16C Block 50 · max turn (10.0 g limit)');
  });
});

describe('timelineChart', () => {
  it('plots heading on the left axis and airspeed on the right against time', () => {
    const { data, layout } = timelineChart(matchup, scenario, opts);
    const heading = named(data, 'F-16C Block 50 · heading turned')[0];
    const speed = named(data, 'F-16C Block 50 · airspeed')[0];
    expect(numbers(heading?.x).at(-1)).toBeCloseTo(20, 6);
    expect(numbers(speed?.y)[0]).toBeCloseTo(800, 0);
    expect(speed?.yaxis).toBe('y2');
    expect(layout.yaxis2?.overlaying).toBe('y');
    const headings = numbers(heading?.y);
    expect(headings.every((h, i) => i === 0 || h >= (headings[i - 1] ?? 0))).toBe(true);
  });
});

describe('hover labels', () => {
  it('use a dark box on every chart', () => {
    for (const build of [emDiagram, advantageChart, radiusChart, energyChart, timelineChart]) {
      expect(build(matchup, scenario, opts).layout.hoverlabel).toEqual(HOVER_LABEL);
    }
    expect(HOVER_LABEL.bgcolor).toBe('#0f172a');
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
