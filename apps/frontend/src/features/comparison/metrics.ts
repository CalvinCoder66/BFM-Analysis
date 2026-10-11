/** Comparison metrics, shared by the stats panels of each focus view. */
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
import { casAtTas, type Flight, type Matchup, SIDES, type SideResult } from './matchup';

export interface Metric {
  label: string;
  value: (r: SideResult) => number | null;
  format: (v: number, unit: SpeedUnit) => string;
  /** null = informational, no winner highlighted. */
  higherIsBetter: boolean | null;
  /** Hide the row unless this returns true. */
  visible?: (m: Matchup) => boolean;
}

export interface MetricSection {
  title: string;
  metrics: readonly Metric[];
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

export const METRICS = {
  gLimit: {
    label: 'G limit in use',
    value: (r) => r.pull.condition.gLimit,
    format: gFormat,
    higherIsBetter: true,
  },
  pilotG: {
    label: 'Pilot G (as flown)',
    value: (r) => r.flown.condition.gLimit,
    format: gFormat,
    higherIsBetter: null,
  },
  wingBreak: {
    label: 'Wing-break G',
    value: (r) => r.pull.condition.gLimits.wingBreak,
    format: gFormat,
    higherIsBetter: null,
  },
  itrAtMerge: {
    label: 'Max turn rate at merge',
    value: atMerge('pull', (p) => p.itr),
    format: formatRate,
    higherIsBetter: true,
  },
  radiusAtMerge: {
    label: 'Radius at merge',
    value: atMerge('pull', (p) => p.itrRadius),
    format: formatDistance,
    higherIsBetter: false,
  },
  flownRateAtMerge: {
    label: 'Turn rate at merge',
    value: atMerge('flown', (p) => p.itr),
    format: formatRate,
    higherIsBetter: true,
  },
  topOfPlane: {
    label: 'Over the top of the plane',
    value: inclined('top'),
    format: formatRate,
    higherIsBetter: true,
    visible: anyInclined,
  },
  bottomOfPlane: {
    label: 'At the bottom of the plane',
    value: inclined('bottom'),
    format: formatRate,
    higherIsBetter: true,
    visible: anyInclined,
  },
  strAtMerge: {
    label: 'Sustained rate at merge',
    value: atMerge('flown', (p) => p.str),
    format: formatRate,
    higherIsBetter: true,
  },
  psFlown: {
    label: 'Bleed while turning',
    value: atMerge('flown', (p) => p.psAtMaxG),
    format: formatPs,
    higherIsBetter: true,
  },
  psPull: {
    label: 'Bleed at full pull',
    value: atMerge('pull', (p) => p.psAtMaxG),
    format: formatPs,
    higherIsBetter: true,
  },
  ps1g: {
    label: 'Acceleration (Ps at 1 g)',
    value: atMerge('pull', (p) => p.psAt1g),
    format: formatPs,
    higherIsBetter: true,
  },
  headingTurned: {
    label: 'Heading turned',
    value: endOfTurn((p) => p.heading),
    format: (v) => `${Math.round(v)}°`,
    higherIsBetter: true,
  },
  speedLeft: {
    label: 'Airspeed left',
    value: endOfTurn((p) => p.cas),
    format: formatSpeed,
    higherIsBetter: true,
  },
  gAtEnd: {
    label: 'Pulling at end',
    value: endOfTurn((p) => p.g),
    format: gFormat,
    higherIsBetter: null,
  },
  cornerSpeed: {
    label: 'Corner speed',
    value: ({ pull }) =>
      pull.summary.limits.cornerTas === null ? null : casAtTas(pull, pull.summary.limits.cornerTas),
    format: formatSpeed,
    higherIsBetter: null,
  },
  bestItr: {
    label: 'Best ITR',
    value: (r) => r.pull.summary.maxItr.value,
    format: formatRate,
    higherIsBetter: true,
  },
  bestStr: {
    label: 'Best STR',
    value: (r) => r.flown.summary.maxStr.value,
    format: formatRate,
    higherIsBetter: true,
  },
  bestStrSpeed: {
    label: 'Best STR speed',
    value: ({ flown }) => casAtTas(flown, flown.summary.maxStr.tas),
    format: formatSpeed,
    higherIsBetter: null,
  },
  minRadius: {
    label: 'Min radius',
    value: (r) => r.pull.summary.minRadius.value,
    format: formatDistance,
    higherIsBetter: false,
  },
  minRadiusSpeed: {
    label: 'Min radius speed',
    value: ({ pull }) => casAtTas(pull, pull.summary.minRadius.tas),
    format: formatSpeed,
    higherIsBetter: null,
  },
  thrustToWeight: {
    label: 'Thrust / weight',
    value: (r) => r.pull.summary.thrustToWeight,
    format: (v) => v.toFixed(2),
    higherIsBetter: true,
  },
  wingLoading: {
    label: 'Wing loading',
    value: (r) => r.pull.summary.wingLoading_kgm2,
    format: (v) => `${Math.round(v)} kg/m²`,
    higherIsBetter: false,
  },
  mass: {
    label: 'Mass',
    value: (r) => r.pull.summary.mass_kg,
    format: (v) => `${Math.round(v).toLocaleString('en-GB')} kg`,
    higherIsBetter: null,
  },
} satisfies Record<string, Metric>;
