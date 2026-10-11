import {
  formatDistance,
  formatPs,
  formatRate,
  formatSpeed,
  type SpeedUnit,
} from '../../shared/format';
import { SIDE_COLOURS } from '../charts/series';
import { casAtTas, compareMetric, type Matchup, SIDES, type SideResult } from './matchup';

interface Metric {
  label: string;
  value: (r: SideResult) => number | null;
  format: (v: number, unit: SpeedUnit) => string;
  /** null = informational, no winner highlighted. */
  higherIsBetter: boolean | null;
}

const atMerge =
  (pick: (p: NonNullable<SideResult['atMerge']>) => number) =>
  (r: SideResult): number | null =>
    r.atMerge ? pick(r.atMerge) : null;

export const MERGE_METRICS: readonly Metric[] = [
  {
    label: 'Max turn rate (ITR)',
    value: atMerge((p) => p.itr),
    format: formatRate,
    higherIsBetter: true,
  },
  {
    label: 'Sustained turn rate',
    value: atMerge((p) => p.str),
    format: formatRate,
    higherIsBetter: true,
  },
  {
    label: 'Radius at max G',
    value: atMerge((p) => p.itrRadius),
    format: formatDistance,
    higherIsBetter: false,
  },
  {
    label: 'Available G',
    value: atMerge((p) => p.maxG),
    format: (v) => `${v.toFixed(1)} g`,
    higherIsBetter: true,
  },
  {
    label: 'Ps at max G (bleed)',
    value: atMerge((p) => p.psAtMaxG),
    format: formatPs,
    higherIsBetter: true,
  },
  {
    label: 'Ps at 1 g (accel)',
    value: atMerge((p) => p.psAt1g),
    format: formatPs,
    higherIsBetter: true,
  },
];

export const ENVELOPE_METRICS: readonly Metric[] = [
  {
    label: 'Corner speed',
    value: (r) =>
      r.summary.limits.cornerTas === null ? null : casAtTas(r, r.summary.limits.cornerTas),
    format: formatSpeed,
    higherIsBetter: null,
  },
  {
    label: 'Best ITR',
    value: (r) => r.summary.maxItr.value,
    format: formatRate,
    higherIsBetter: true,
  },
  {
    label: 'Best STR',
    value: (r) => r.summary.maxStr.value,
    format: formatRate,
    higherIsBetter: true,
  },
  {
    label: 'Best STR speed',
    value: (r) => casAtTas(r, r.summary.maxStr.tas),
    format: formatSpeed,
    higherIsBetter: null,
  },
  {
    label: 'Min radius',
    value: (r) => r.summary.minRadius.value,
    format: formatDistance,
    higherIsBetter: false,
  },
  {
    label: 'Thrust / weight',
    value: (r) => r.summary.thrustToWeight,
    format: (v) => v.toFixed(2),
    higherIsBetter: true,
  },
  {
    label: 'Wing loading',
    value: (r) => r.summary.wingLoading_kgm2,
    format: (v) => `${Math.round(v)} kg/m²`,
    higherIsBetter: false,
  },
  {
    label: 'Mass',
    value: (r) => r.summary.mass_kg,
    format: (v) => `${Math.round(v).toLocaleString('en-GB')} kg`,
    higherIsBetter: null,
  },
];

function MetricRows({
  metrics,
  matchup,
  unit,
}: {
  metrics: readonly Metric[];
  matchup: Matchup;
  unit: SpeedUnit;
}) {
  return metrics.map((metric) => {
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
              className={`py-1.5 text-right font-mono ${best ? 'font-semibold' : 'text-slate-300'}`}
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
  });
}

export function MatchupTable({
  matchup,
  unit,
  mergeLabel,
}: {
  matchup: Matchup;
  unit: SpeedUnit;
  mergeLabel: string;
}) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
      <table className="w-full text-sm">
        <caption className="sr-only">Matchup comparison</caption>
        <thead>
          <tr className="text-xs uppercase tracking-wider">
            <th scope="col" className="pb-2 text-left font-normal text-slate-500">
              Metric
            </th>
            {SIDES.map((side) => (
              <th
                key={side}
                scope="col"
                className="pb-2 text-right font-semibold"
                style={{ color: SIDE_COLOURS[side] }}
              >
                {matchup[side].aircraft.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th
              colSpan={3}
              scope="colgroup"
              className="pt-1 pb-1 text-left text-[11px] font-semibold uppercase tracking-widest text-amber-300/80"
            >
              At merge · {mergeLabel}
            </th>
          </tr>
          <MetricRows metrics={MERGE_METRICS} matchup={matchup} unit={unit} />
          <tr>
            <th
              colSpan={3}
              scope="colgroup"
              className="pt-4 pb-1 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-400"
            >
              Best case · whole envelope
            </th>
          </tr>
          <MetricRows metrics={ENVELOPE_METRICS} matchup={matchup} unit={unit} />
        </tbody>
      </table>
    </section>
  );
}
