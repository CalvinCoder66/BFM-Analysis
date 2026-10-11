import { useMemo, useState } from 'react';
import type { SpeedUnit } from '../../shared/format';
import type { Matchup, Scenario } from '../comparison/matchup';
import { PlotlyChart } from './PlotlyChart';
import {
  advantageChart,
  type ChartOptions,
  emDiagram,
  energyChart,
  type Figure,
  radiusChart,
} from './series';

interface View {
  id: string;
  label: string;
  description: string;
  build: (m: Matchup, s: Scenario, o: ChartOptions) => Figure;
}

export const VIEWS: readonly View[] = [
  {
    id: 'em',
    label: 'E-M diagram',
    description:
      'Standard energy-manoeuvrability ("doghouse") chart. Solid line: best turn rate at max G or max lift; its peak (◆) is corner speed. Dashed line: sustained turn rate (Ps = 0). Dotted lines: Ps contours, so you can see how fast each jet bleeds (−) or gains (+) energy at that turn rate. Grey lines: constant turn radius.',
    build: emDiagram,
  },
  {
    id: 'advantage',
    label: 'Advantage',
    description:
      'Turn-rate difference at each speed. Shading above zero means the attacker out-turns the defender at that speed, below zero the defender does. Solid = sustained (2-circle), dashed = instantaneous (first turn).',
    build: advantageChart,
  },
  {
    id: 'radius',
    label: 'Turn radius',
    description:
      '1-circle view: turn radius at max G (solid) and at sustained G (dashed). Lower is tighter. In a nose-to-nose fight the smaller circle wins.',
    build: radiusChart,
  },
  {
    id: 'energy',
    label: 'Energy (Ps)',
    description:
      'Specific excess power. Dashed: Ps wings-level at 1 g (how quickly each jet can accelerate or climb). Solid: Ps while pulling max G (energy bleed rate in a hard turn).',
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
  const [viewId, setViewId] = useState<string>('em');
  const [showPsContours, setShowPsContours] = useState(true);
  const [showRadiusLines, setShowRadiusLines] = useState(true);
  const view = VIEWS.find((v) => v.id === viewId) ?? (VIEWS[0] as View);

  const figure = useMemo(
    () => view.build(matchup, scenario, { unit, showPsContours, showRadiusLines }),
    [view, matchup, scenario, unit, showPsContours, showRadiusLines],
  );

  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-slate-800 bg-slate-900/60">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
        <div role="tablist" aria-label="Chart view" className="flex gap-1">
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
        <div className="min-h-[420px] flex-1 p-2">
          <PlotlyChart figure={figure} label={`${view.label} chart`} />
        </div>
      </div>
    </section>
  );
}
