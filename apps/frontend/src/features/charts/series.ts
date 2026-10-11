/**
 * Pure builders that turn a matchup into Plotly figures. Kept free of React and Plotly runtime
 * imports so they can be unit-tested directly.
 */
import type { Annotations, Data, Layout, Shape } from 'plotly.js';
import { casToTas } from '../../physics/atmosphere';
import { turnRateAtPs } from '../../physics/performance';
import { radToDeg } from '../../physics/units';
import { SPEED_UNITS, type SpeedUnit } from '../../shared/format';
import {
  type Matchup,
  type Scenario,
  SIDES,
  type Side,
  turnRateDelta,
} from '../comparison/matchup';

export const SIDE_COLOURS: Record<Side, string> = { attacker: '#38bdf8', defender: '#f87171' };
/** Ps contour levels drawn on the E-M diagram, m/s (Ps = 0 is the sustained line). */
export const PS_CONTOURS = [-100, -50, 50] as const;
/** Constant-radius reference lines on the E-M diagram, metres. */
export const RADIUS_LINES = [300, 500, 750, 1000, 1500, 2500] as const;

export interface ChartOptions {
  unit: SpeedUnit;
  showPsContours: boolean;
  showRadiusLines: boolean;
}

export interface Figure {
  data: Data[];
  layout: Partial<Layout>;
}

const AXIS = { gridcolor: '#1e293b', zerolinecolor: '#334155', linecolor: '#334155' };

function speedAxisTitle(unit: SpeedUnit) {
  return `Indicated airspeed (${SPEED_UNITS[unit].label})`;
}

function mergeMarker(
  scenario: Scenario,
  unit: SpeedUnit,
): { shape: Partial<Shape>; label: Partial<Annotations> } {
  const x = SPEED_UNITS[unit].fromMs(scenario.mergeCas);
  return {
    shape: {
      type: 'line',
      xref: 'x',
      yref: 'paper',
      x0: x,
      x1: x,
      y0: 0,
      y1: 1,
      line: { color: '#facc15', width: 1.5, dash: 'dash' },
    },
    label: {
      x,
      xref: 'x',
      y: 1,
      yref: 'paper',
      yanchor: 'top',
      xanchor: 'left',
      xshift: 4,
      text: 'Merge',
      showarrow: false,
      font: { color: '#facc15', size: 11 },
    },
  };
}

function baseLayout(scenario: Scenario, unit: SpeedUnit, yTitle: string): Partial<Layout> {
  const merge = mergeMarker(scenario, unit);
  return {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: '#0b1222',
    font: { color: '#cbd5e1', family: 'ui-monospace, SFMono-Regular, Menlo, monospace', size: 12 },
    margin: { l: 60, r: 20, t: 20, b: 50 },
    legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom', font: { size: 11 } },
    xaxis: { ...AXIS, title: { text: speedAxisTitle(unit) } },
    yaxis: { ...AXIS, title: { text: yTitle } },
    shapes: [merge.shape],
    annotations: [merge.label],
  };
}

const label = (m: Matchup, side: Side) => m[side].aircraft.name;

/**
 * The standard E-M ("doghouse") diagram: turn rate vs airspeed with the max-turn boundary
 * (lift limit up to corner speed, G limit above), the sustained (Ps = 0) line, optional Ps
 * contours and constant-radius reference lines.
 */
export function emDiagram(m: Matchup, scenario: Scenario, opts: ChartOptions): Figure {
  const x = SPEED_UNITS[opts.unit].fromMs;
  const data: Data[] = [];
  let yMax = 0;

  for (const side of SIDES) {
    const r = m[side];
    const colour = SIDE_COLOURS[side];
    const xs = r.curve.map((p) => x(p.cas));
    yMax = Math.max(yMax, r.summary.maxItr.value);

    data.push({
      type: 'scatter',
      mode: 'lines',
      name: `${label(m, side)} · max turn`,
      legendgroup: side,
      x: xs,
      y: r.curve.map((p) => p.itr),
      line: { color: colour, width: 3 },
      hovertemplate: '%{y:.1f}°/s @ %{x:.0f}<extra>%{fullData.name}</extra>',
    });
    data.push({
      type: 'scatter',
      mode: 'lines',
      name: `${label(m, side)} · sustained (Ps 0)`,
      legendgroup: side,
      x: xs,
      y: r.curve.map((p) => p.str),
      line: { color: colour, width: 2, dash: 'dash' },
      hovertemplate: '%{y:.1f}°/s @ %{x:.0f}<extra>%{fullData.name}</extra>',
    });

    const corner = r.curve.find((p) => p.tas === r.summary.limits.cornerTas);
    if (corner) {
      data.push({
        type: 'scatter',
        mode: 'markers',
        name: `${label(m, side)} · corner`,
        legendgroup: side,
        showlegend: false,
        x: [x(corner.cas)],
        y: [corner.itr],
        marker: {
          color: colour,
          size: 10,
          symbol: 'diamond',
          line: { color: '#0b1222', width: 1 },
        },
        hovertemplate: 'Corner %{x:.0f} · %{y:.1f}°/s<extra>%{fullData.name}</extra>',
      });
    }

    if (opts.showPsContours) {
      for (const ps of PS_CONTOURS) {
        data.push({
          type: 'scatter',
          mode: 'lines',
          name: `${label(m, side)} · Ps ${ps > 0 ? '+' : ''}${ps}`,
          legendgroup: side,
          showlegend: false,
          x: xs,
          y: r.curve.map((p) => turnRateAtPs(r.condition, p.tas, ps)),
          connectgaps: false,
          line: { color: colour, width: 1, dash: 'dot' },
          opacity: 0.55,
          hovertemplate: `Ps ${ps > 0 ? '+' : ''}${ps} m/s · %{y:.1f}°/s<extra>${label(m, side)}</extra>`,
        });
      }
    }
  }

  const yRange: [number, number] = [0, Math.ceil(yMax * 1.15)];

  if (opts.showRadiusLines) {
    const maxCas = Math.max(...SIDES.map((s) => m[s].curve.at(-1)?.cas ?? 0));
    const grid = Array.from({ length: 60 }, (_, i) => 20 + ((maxCas - 20) * i) / 59);
    for (const radius of RADIUS_LINES) {
      const ys = grid.map((cas) => radToDeg(casToTas(cas, scenario.altitude_m) / radius));
      // Label the line at its last point inside the plot area.
      let labelIndex = ys.findIndex((y) => y > yRange[1] * 0.92) - 1;
      if (labelIndex < 0) labelIndex = ys.length - 1;
      data.push({
        type: 'scatter',
        mode: 'text+lines',
        name: `r ${radius} m`,
        showlegend: false,
        x: grid.map(x),
        y: ys,
        text: ys.map((_, i) => (i === labelIndex ? `${radius} m` : '')),
        textposition: 'top left',
        textfont: { color: '#64748b', size: 10 },
        line: { color: '#475569', width: 1 },
        opacity: 0.6,
        hoverinfo: 'skip',
      });
    }
  }

  const layout = baseLayout(scenario, opts.unit, 'Turn rate (°/s)');
  return {
    data,
    layout: {
      ...layout,
      hovermode: 'closest',
      yaxis: { ...layout.yaxis, range: yRange },
    },
  };
}

/** Turn radius at max G (instantaneous) and sustained G vs speed — the 1-circle view. */
export function radiusChart(m: Matchup, scenario: Scenario, opts: ChartOptions): Figure {
  const x = SPEED_UNITS[opts.unit].fromMs;
  const finite = (v: number) => (Number.isFinite(v) ? v : null);
  const data: Data[] = SIDES.flatMap((side): Data[] => {
    const r = m[side];
    const xs = r.curve.map((p) => x(p.cas));
    return [
      {
        type: 'scatter',
        mode: 'lines',
        name: `${label(m, side)} · min radius (max G)`,
        legendgroup: side,
        x: xs,
        y: r.curve.map((p) => finite(p.itrRadius)),
        line: { color: SIDE_COLOURS[side], width: 3 },
        hovertemplate: '%{y:.0f} m<extra>%{fullData.name}</extra>',
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: `${label(m, side)} · sustained radius`,
        legendgroup: side,
        x: xs,
        y: r.curve.map((p) => finite(p.strRadius)),
        connectgaps: false,
        line: { color: SIDE_COLOURS[side], width: 2, dash: 'dash' },
        hovertemplate: '%{y:.0f} m<extra>%{fullData.name}</extra>',
      },
    ];
  });
  const layout = baseLayout(scenario, opts.unit, 'Turn radius (m)');
  return {
    data,
    layout: { ...layout, hovermode: 'x unified', yaxis: { ...layout.yaxis, range: [0, 3000] } },
  };
}

/** Specific excess power vs speed: acceleration at 1 g and energy bleed at max G. */
export function energyChart(m: Matchup, scenario: Scenario, opts: ChartOptions): Figure {
  const x = SPEED_UNITS[opts.unit].fromMs;
  const data: Data[] = SIDES.flatMap((side): Data[] => {
    const r = m[side];
    const xs = r.curve.map((p) => x(p.cas));
    return [
      {
        type: 'scatter',
        mode: 'lines',
        name: `${label(m, side)} · Ps at 1 g (accelerate)`,
        legendgroup: side,
        x: xs,
        y: r.curve.map((p) => p.psAt1g),
        line: { color: SIDE_COLOURS[side], width: 2, dash: 'dash' },
        hovertemplate: '%{y:.0f} m/s<extra>%{fullData.name}</extra>',
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: `${label(m, side)} · Ps at max G (bleed)`,
        legendgroup: side,
        x: xs,
        y: r.curve.map((p) => p.psAtMaxG),
        line: { color: SIDE_COLOURS[side], width: 3 },
        hovertemplate: '%{y:.0f} m/s<extra>%{fullData.name}</extra>',
      },
    ];
  });
  const layout = baseLayout(scenario, opts.unit, 'Specific excess power Ps (m/s)');
  return {
    data,
    layout: {
      ...layout,
      hovermode: 'x unified',
      yaxis: { ...layout.yaxis, zerolinecolor: '#94a3b8', zerolinewidth: 2 },
    },
  };
}

/**
 * Turn-rate advantage (attacker − defender) on a shared speed grid. Above zero the attacker
 * out-turns the defender at that speed; below zero the defender does.
 */
export function advantageChart(m: Matchup, scenario: Scenario, opts: ChartOptions): Figure {
  const x = SPEED_UNITS[opts.unit].fromMs;
  const points = turnRateDelta(m, scenario.altitude_m);
  const xs = points.map((p) => x(p.cas));
  const positive = (v: number | null) => (v === null ? null : Math.max(v, 0));
  const negative = (v: number | null) => (v === null ? null : Math.min(v, 0));
  const attacker = label(m, 'attacker');
  const defender = label(m, 'defender');

  const filled = (name: string, ys: (number | null)[], side: Side, dash?: 'dash'): Data => ({
    type: 'scatter',
    mode: 'lines',
    name,
    x: xs,
    y: ys,
    connectgaps: false,
    fill: dash ? 'none' : 'tozeroy',
    fillcolor: `${SIDE_COLOURS[side]}33`,
    line: { color: SIDE_COLOURS[side], width: dash ? 2 : 2.5, dash },
    hovertemplate: '%{y:+.1f}°/s<extra>%{fullData.name}</extra>',
  });

  const data: Data[] = [
    filled(
      `${attacker} better · sustained`,
      points.map((p) => positive(p.str)),
      'attacker',
    ),
    filled(
      `${defender} better · sustained`,
      points.map((p) => negative(p.str)),
      'defender',
    ),
    filled(
      `${attacker} better · instantaneous`,
      points.map((p) => positive(p.itr)),
      'attacker',
      'dash',
    ),
    filled(
      `${defender} better · instantaneous`,
      points.map((p) => negative(p.itr)),
      'defender',
      'dash',
    ),
  ];

  const layout = baseLayout(scenario, opts.unit, `Turn-rate advantage (°/s)`);
  return {
    data,
    layout: {
      ...layout,
      hovermode: 'x unified',
      yaxis: { ...layout.yaxis, zerolinecolor: '#94a3b8', zerolinewidth: 2 },
      annotations: [
        ...(layout.annotations ?? []),
        {
          xref: 'paper',
          yref: 'paper',
          x: 0.01,
          y: 0.98,
          text: `▲ ${attacker} out-turns`,
          showarrow: false,
          xanchor: 'left',
          font: { color: SIDE_COLOURS.attacker, size: 11 },
        },
        {
          xref: 'paper',
          yref: 'paper',
          x: 0.01,
          y: 0.02,
          text: `▼ ${defender} out-turns`,
          showarrow: false,
          xanchor: 'left',
          font: { color: SIDE_COLOURS.defender, size: 11 },
        },
      ],
    },
  };
}
