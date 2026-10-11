import { Fragment } from 'react';
import { turnRateExtremes } from '../../physics/performance';
import type { TimelinePoint } from '../../physics/timeline';
import { radToDeg } from '../../physics/units';
import {
  formatDistance,
  formatPs,
  formatRate,
  formatSpeed,
  type SpeedUnit,
} from '../../shared/format';
import { SIDE_COLOURS } from '../charts/series';
import {
  casAtTas,
  compareMetric,
  type Flight,
  type Matchup,
  SIDES,
  type SideResult,
} from './matchup';

interface Metric {
  label: string;
  value: (r: SideResult) => number | null;
  format: (v: number, unit: SpeedUnit) => string;
  /** null = informational, no winner highlighted. */
  higherIsBetter: boolean | null;
  /** Hide the row unless this returns true. */
  visible?: (m: Matchup) => boolean;
}

const atMerge =
  (flight: 'pull' | 'flown', pick: (p: NonNullable<Flight['atMerge']>) => number) =>
  (r: SideResult): number | null => {
    const p = r[flight].atMerge;
    return p ? pick(p) : null;
  };
const endOfTurn =
  (pick: (p: TimelinePoint) => number) =>
  (r: SideResult): number | null => {
    const p = r.flown.timeline.at(-1);
    return p ? pick(p) : null;
  };
const gFormat = (v: number) => `${v.toFixed(1)} g`;
/** As-flown turn rate at the top or bottom of an inclined turn, at the merge. */
const inclined =
  (where: 'top' | 'bottom') =>
  (r: SideResult): number | null => {
    const p = r.flown.atMerge;
    return p ? radToDeg(turnRateExtremes(p.maxG, p.tas, r.flown.condition.turnPlane)[where]) : null;
  };
const anyInclined = (m: Matchup) => SIDES.some((s) => m[s].config.turnPlane_deg > 0);

export const LIMIT_METRICS: readonly Metric[] = [
  {
    label: 'G limit in use',
    value: (r) => r.pull.condition.gLimit,
    format: gFormat,
    higherIsBetter: true,
  },
  {
    label: 'Pilot G (as flown)',
    value: (r) => r.flown.condition.gLimit,
    format: gFormat,
    higherIsBetter: null,
  },
  {
    label: 'Wing-break G',
    value: (r) => r.pull.condition.gLimits.wingBreak,
    format: gFormat,
    higherIsBetter: null,
  },
];

export const MERGE_METRICS: readonly Metric[] = [
  {
    label: 'Max turn rate (full pull)',
    value: atMerge('pull', (p) => p.itr),
    format: formatRate,
    higherIsBetter: true,
  },
  {
    label: 'Radius at full pull',
    value: atMerge('pull', (p) => p.itrRadius),
    format: formatDistance,
    higherIsBetter: false,
  },
  {
    label: 'Turn rate as flown',
    value: atMerge('flown', (p) => p.itr),
    format: formatRate,
    higherIsBetter: true,
  },
  {
    label: 'Over the top of the plane',
    value: inclined('top'),
    format: formatRate,
    higherIsBetter: true,
    visible: anyInclined,
  },
  {
    label: 'At the bottom of the plane',
    value: inclined('bottom'),
    format: formatRate,
    higherIsBetter: true,
    visible: anyInclined,
  },
  {
    label: 'Sustained turn rate',
    value: atMerge('flown', (p) => p.str),
    format: formatRate,
    higherIsBetter: true,
  },
  {
    label: 'Ps as flown (bleed)',
    value: atMerge('flown', (p) => p.psAtMaxG),
    format: formatPs,
    higherIsBetter: true,
  },
  {
    label: 'Ps at 1 g (accel)',
    value: atMerge('pull', (p) => p.psAt1g),
    format: formatPs,
    higherIsBetter: true,
  },
];

export const TIMELINE_METRICS: readonly Metric[] = [
  {
    label: 'Heading turned',
    value: endOfTurn((p) => p.heading),
    format: (v) => `${Math.round(v)}°`,
    higherIsBetter: true,
  },
  {
    label: 'Airspeed left',
    value: endOfTurn((p) => p.cas),
    format: formatSpeed,
    higherIsBetter: true,
  },
  {
    label: 'Pulling',
    value: endOfTurn((p) => p.g),
    format: gFormat,
    higherIsBetter: null,
  },
];

export const ENVELOPE_METRICS: readonly Metric[] = [
  {
    label: 'Corner speed',
    value: ({ pull }) =>
      pull.summary.limits.cornerTas === null ? null : casAtTas(pull, pull.summary.limits.cornerTas),
    format: formatSpeed,
    higherIsBetter: null,
  },
  {
    label: 'Best ITR',
    value: (r) => r.pull.summary.maxItr.value,
    format: formatRate,
    higherIsBetter: true,
  },
  {
    label: 'Best STR',
    value: (r) => r.flown.summary.maxStr.value,
    format: formatRate,
    higherIsBetter: true,
  },
  {
    label: 'Best STR speed',
    value: ({ flown }) => casAtTas(flown, flown.summary.maxStr.tas),
    format: formatSpeed,
    higherIsBetter: null,
  },
  {
    label: 'Min radius',
    value: (r) => r.pull.summary.minRadius.value,
    format: formatDistance,
    higherIsBetter: false,
  },
  {
    label: 'Thrust / weight',
    value: (r) => r.pull.summary.thrustToWeight,
    format: (v) => v.toFixed(2),
    higherIsBetter: true,
  },
  {
    label: 'Wing loading',
    value: (r) => r.pull.summary.wingLoading_kgm2,
    format: (v) => `${Math.round(v)} kg/m²`,
    higherIsBetter: false,
  },
  {
    label: 'Mass',
    value: (r) => r.pull.summary.mass_kg,
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
  return metrics
    .filter((metric) => metric.visible?.(matchup) ?? true)
    .map((metric) => {
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
                className={`py-1.5 pl-3 text-right font-mono ${best ? 'font-semibold' : 'text-slate-300'}`}
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
  turnDuration_s,
}: {
  matchup: Matchup;
  unit: SpeedUnit;
  mergeLabel: string;
  turnDuration_s: number;
}) {
  return (
    <section className="hud-panel p-3">
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
          {[
            { title: 'G limits', metrics: LIMIT_METRICS, tone: 'text-slate-400' },
            {
              title: `At merge · ${mergeLabel}`,
              metrics: MERGE_METRICS,
              tone: 'text-amber-300/80',
            },
            {
              title: `After ${turnDuration_s} s turning · as flown`,
              metrics: TIMELINE_METRICS,
              tone: 'text-slate-400',
            },
            {
              title: 'Best case · whole envelope',
              metrics: ENVELOPE_METRICS,
              tone: 'text-slate-400',
            },
          ].map((section) => (
            <Fragment key={section.title}>
              <tr>
                <th
                  colSpan={3}
                  scope="colgroup"
                  className={`pt-3 pb-1 text-left text-[11px] font-semibold uppercase tracking-widest ${section.tone}`}
                >
                  {section.title}
                </th>
              </tr>
              <MetricRows metrics={section.metrics} matchup={matchup} unit={unit} />
            </Fragment>
          ))}
        </tbody>
      </table>
    </section>
  );
}
