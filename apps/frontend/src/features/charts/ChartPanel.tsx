import { useMemo, useState } from 'react';
import type { SpeedUnit } from '../../shared/format';
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

interface View {
  id: string;
  label: string;
  description: string;
  /** Plotly figure builder; views without one render custom graphics. */
  build?: (m: Matchup, s: Scenario, o: ChartOptions) => Figure;
}

export const VIEWS: readonly View[] = [
  {
    id: 'circles',
    label: 'Turn circles',
    description:
      'Top-down flight paths from a left-to-left merge. 2-circle: both turn towards each other and each pilot flies as set (smooth or yanking), so the faster rate gets behind. 1-circle: the defender turns away, both pull to the limiter and meet nose-to-nose, so the tighter circle wins.',
  },
  {
    id: 'em',
    label: 'E-M diagram',
    description:
      'Standard energy-manoeuvrability ("doghouse") chart. Solid line: best turn rate pulling to the G limiter or max lift; its peak (◆) is corner speed. Dash-dot: the pilot\u2019s chosen G when flying smoothly. Dashed: sustained turn rate (Ps = 0). Dotted: Ps contours, showing how fast each jet bleeds (−) or gains (+) energy at that turn rate. Grey: constant turn radius.',
    build: emDiagram,
  },
  {
    id: 'timeline',
    label: 'Turn timeline',
    description:
      'A sustained hard turn from the merge speed, as each pilot flies it. Solid: heading turned (left axis). Dashed: airspeed (right axis). Yanking gets the nose round sooner but bleeds speed; smooth flying keeps energy for later.',
    build: timelineChart,
  },
  {
    id: 'advantage',
    label: 'Advantage',
    description:
      'Turn-rate difference at each speed, as flown. Shading above zero means the attacker out-turns the defender at that speed, below zero the defender does. Solid = sustained (2-circle), dashed = instantaneous (first turn).',
    build: advantageChart,
  },
  {
    id: 'radius',
    label: 'Turn radius',
    description:
      '1-circle view at full pull: turn radius at max G (solid) and at sustained G (dashed). Lower is tighter. In a nose-to-nose fight the smaller circle wins. Curves start where the jet can pull 2 g; closer to stall speed the radius heads to infinity.',
    build: radiusChart,
  },
  {
    id: 'energy',
    label: 'Energy (Ps)',
    description:
      'Specific excess power. Dashed: Ps wings-level at 1 g (how quickly each jet can accelerate or climb). Solid: Ps while pulling max G (energy bleed in a hard turn). Dash-dot: Ps at the pilot\u2019s chosen G when flying smoothly.',
    build: energyChart,
  },
];

export function ChartPanel({
  matchup,
  scenario,
  unit,
}: {
  matchup: Matchup;
  scenario: Scenario;
  unit: SpeedUnit;
}) {
  const [viewId, setViewId] = useState<string>('circles');
  const [showPsContours, setShowPsContours] = useState(true);
  const [showRadiusLines, setShowRadiusLines] = useState(true);
  const [fightType, setFightType] = useState<FightType>('two-circle');
  const view = VIEWS.find((v) => v.id === viewId) ?? (VIEWS[0] as View);

  const figure = useMemo(
    () => view.build?.(matchup, scenario, { unit, showPsContours, showRadiusLines }),
    [view, matchup, scenario, unit, showPsContours, showRadiusLines],
  );

  return (
    <section className="hud-panel flex min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
        <div role="tablist" aria-label="Chart view" className="flex flex-wrap gap-1">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={v.id === view.id}
              onClick={() => setViewId(v.id)}
              className={`rounded px-3 py-1 text-sm transition-colors ${
                v.id === view.id
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        {view.id === 'em' && (
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
      </div>
      <div role="tabpanel" aria-label={view.label} className="flex min-h-0 flex-1 flex-col">
        <p className="px-4 pt-3 text-xs leading-relaxed text-slate-400">{view.description}</p>
        <div className="min-h-[440px] flex-1 p-2">
          {figure ? (
            <PlotlyChart figure={figure} label={`${view.label} chart`} />
          ) : (
            <TurnCircles
              matchup={matchup}
              unit={unit}
              fightType={fightType}
              onFightTypeChange={setFightType}
            />
          )}
        </div>
      </div>
    </section>
  );
}
