import { useMemo, useState } from 'react';
import type { SpeedUnit } from '../../shared/format';
import { Segmented } from '../../shared/ui/Segmented';
import type { Matchup, Scenario } from '../comparison/matchup';
import type { FightType } from './circles';
import { PlotlyChart } from './PlotlyChart';
import {
  advantageChart,
  type ChartOptions,
  emDiagram,
  energyChart,
  type Figure,
  radiusChart,
  timelineChart,
} from './series';
import { TurnCircles } from './TurnCircles';

export type ChartId = 'circles' | 'em' | 'timeline' | 'advantage' | 'radius' | 'energy';

interface ChartDefinition {
  label: string;
  /** How to read the chart; shown on demand. */
  help: string;
  /** Plotly figure builder; charts without one render custom graphics. */
  build?: (m: Matchup, s: Scenario, o: ChartOptions) => Figure;
}

export const CHARTS: Record<ChartId, ChartDefinition> = {
  circles: {
    label: 'Turn circles',
    help: 'Flight paths in 3D from a left-to-left merge, to scale, with a dot every 5 s. Each jet turns in its own plane, so a vertical loop stands upright; the fight sits in a box with a gridded floor and back walls, scaled in metres east, north and above the merge, and dashed drop lines and a shadow on the floor show height. Drag to look around, scroll or use + and − to zoom (towards the cursor), untick Box to hide the box, pick Top or Side for a flat view, or go full screen. 2-circle: both turn towards each other and each pilot flies as set, so the faster rate gets behind. 1-circle: the defender turns away and both pull to the limiter, meeting nose-to-nose, so the tighter circle wins.',
  },
  em: {
    label: 'E-M diagram',
    help: 'Standard energy-manoeuvrability ("doghouse") chart. Solid: best turn rate pulling to the G limiter or max lift; its peak (◆) is corner speed. Dash-dot: the pilot\u2019s chosen G when flying smoothly. Dashed: sustained turn rate (Ps = 0). Dotted: Ps contours, showing how fast each jet bleeds (−) or gains (+) energy at that turn rate. Grey: constant turn radius.',
    build: emDiagram,
  },
  timeline: {
    label: 'Turn timeline',
    help: 'A sustained hard turn from the merge speed, as each pilot flies it. Solid: heading turned (left axis). Dashed: airspeed (right axis). Yanking gets the nose round sooner but bleeds speed; smooth flying keeps energy for later.',
    build: timelineChart,
  },
  advantage: {
    label: 'Rate advantage',
    help: 'Turn-rate difference at each speed, as flown. Shading above zero means the attacker out-turns the defender at that speed, below zero the defender does. Solid = sustained, dashed = instantaneous (first turn).',
    build: advantageChart,
  },
  radius: {
    label: 'Turn radius',
    help: 'Turn radius at full pull (solid) and at sustained G (dashed) against speed. Lower is tighter. Curves start where the jet can pull 2 g; closer to stall speed the radius heads to infinity.',
    build: radiusChart,
  },
  energy: {
    label: 'Energy (Ps)',
    help: 'Specific excess power. Dashed: Ps wings-level at 1 g (how quickly each jet can accelerate or climb). Solid: Ps while pulling max G (energy bleed in a hard turn). Dash-dot: Ps at the pilot\u2019s chosen G when flying smoothly.',
    build: energyChart,
  },
};

/** Chart area for one focus view: a chart picker (when there is a choice) and the chart. */
export function ChartArea({
  matchup,
  scenario,
  unit,
  charts,
  fightType = 'two-circle',
}: {
  matchup: Matchup;
  scenario: Scenario;
  unit: SpeedUnit;
  charts: readonly ChartId[];
  fightType?: FightType;
}) {
  const [selected, setSelected] = useState<ChartId>(charts[0] ?? 'em');
  const [showPsContours, setShowPsContours] = useState(true);
  const [showRadiusLines, setShowRadiusLines] = useState(true);
  const chartId = charts.includes(selected) ? selected : (charts[0] ?? 'em');
  const chart = CHARTS[chartId];

  const figure = useMemo(
    () => chart.build?.(matchup, scenario, { unit, showPsContours, showRadiusLines }),
    [chart, matchup, scenario, unit, showPsContours, showRadiusLines],
  );

  return (
    <section className="hud-panel flex min-w-0 flex-col" aria-label="Chart">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-800 px-3 py-2">
        {charts.length > 1 && (
          <div className="w-fit">
            <Segmented
              legend="Chart"
              value={chartId}
              options={charts.map((id) => ({ value: id, label: CHARTS[id].label }))}
              onChange={setSelected}
            />
          </div>
        )}
        {chartId === 'em' && (
          <div className="flex gap-4 text-xs text-slate-400">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={showPsContours}
                onChange={(e) => setShowPsContours(e.target.checked)}
                className="accent-slate-400"
              />
              Ps contours
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={showRadiusLines}
                onChange={(e) => setShowRadiusLines(e.target.checked)}
                className="accent-slate-400"
              />
              Radius lines
            </label>
          </div>
        )}
        <details className="group ml-auto text-xs text-slate-400">
          <summary className="cursor-pointer select-none list-none hover:text-slate-200">
            ⓘ How to read
          </summary>
          <p className="absolute right-3 z-10 mt-2 max-w-md rounded border border-slate-700 bg-slate-900 p-3 leading-relaxed text-slate-300 shadow-xl">
            {chart.help}
          </p>
        </details>
      </div>
      <div className="h-[min(68vh,900px)] min-h-[360px] p-2">
        {figure ? (
          <PlotlyChart figure={figure} label={`${chart.label} chart`} />
        ) : (
          <TurnCircles matchup={matchup} unit={unit} fightType={fightType} />
        )}
      </div>
    </section>
  );
}
