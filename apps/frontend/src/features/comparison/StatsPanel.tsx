import { Fragment, useState } from 'react';
import type { SpeedUnit } from '../../shared/format';
import { SIDE_COLOURS } from '../charts/series';
import { compareMetric, type Matchup, SIDES } from './matchup';
import type { MetricSection } from './metrics';

function SectionRows({
  section,
  matchup,
  unit,
}: {
  section: MetricSection;
  matchup: Matchup;
  unit: SpeedUnit;
}) {
  const metrics = section.metrics.filter((metric) => metric.visible?.(matchup) ?? true);
  if (metrics.length === 0) return null;
  return (
    <>
      <tr>
        <th
          colSpan={3}
          scope="colgroup"
          className="pt-3 pb-1 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-500"
        >
          {section.title}
        </th>
      </tr>
      {metrics.map((metric) => {
        const values = SIDES.map((s) => metric.value(matchup[s]));
        const [a, d] = values;
        const winner =
          metric.higherIsBetter === null || a == null || d == null
            ? 'even'
            : compareMetric(a, d, metric.higherIsBetter).winner;
        return (
          <tr key={metric.label} className="border-t border-slate-800/70">
            <th scope="row" className="py-1.5 pr-3 text-left font-normal text-slate-400">
              {metric.label}
            </th>
            {SIDES.map((side, i) => {
              const v = values[i];
              const best = winner === side;
              return (
                <td
                  key={side}
                  data-best={best || undefined}
                  className={`whitespace-nowrap py-1.5 pl-3 text-right font-mono ${best ? 'font-semibold' : 'text-slate-300'}`}
                  style={best ? { color: SIDE_COLOURS[side] } : undefined}
                >
                  {v == null ? '—' : metric.format(v, unit)}
                  {best && (
                    <>
                      <span aria-hidden="true"> ▲</span>
                      <span className="sr-only"> (advantage)</span>
                    </>
                  )}
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

/** Side-by-side stats: the key sections, with the rest behind a "more stats" toggle. */
export function StatsPanel({
  matchup,
  unit,
  sections,
  moreSections = [],
  moreLabel = 'more stats',
}: {
  matchup: Matchup;
  unit: SpeedUnit;
  sections: readonly MetricSection[];
  moreSections?: readonly MetricSection[];
  moreLabel?: string;
}) {
  const [showMore, setShowMore] = useState(false);
  const shown = showMore ? [...sections, ...moreSections] : sections;
  return (
    <div>
      {shown.length > 0 && (
        <table className="w-full text-sm">
          <caption className="sr-only">Matchup comparison</caption>
          <thead>
            <tr className="text-xs uppercase tracking-wider">
              <th scope="col" className="pb-1 text-left font-normal text-slate-500">
                <span className="sr-only">Metric</span>
              </th>
              {SIDES.map((side) => (
                <th
                  key={side}
                  scope="col"
                  className="pb-1 pl-3 text-right font-semibold"
                  style={{ color: SIDE_COLOURS[side] }}
                >
                  {matchup[side].aircraft.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((section) => (
              <Fragment key={section.title}>
                <SectionRows section={section} matchup={matchup} unit={unit} />
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
      {moreSections.length > 0 && (
        <button
          type="button"
          aria-expanded={showMore}
          onClick={() => setShowMore((v) => !v)}
          className="mt-3 text-xs text-emerald-300/80 hover:text-emerald-200"
        >
          {showMore ? `Hide ${moreLabel}` : `Show ${moreLabel}`}
        </button>
      )}
    </div>
  );
}
