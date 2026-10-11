/**
 * The four focus views selected from the hotbar: a summary of who wins, then a drill-down for
 * each kind of fight and for energy. Each view picks its charts and the stats that matter for it;
 * everything else sits behind "show more".
 */
import { formatDistance, formatRate, formatSpeed, type SpeedUnit } from '../../shared/format';
import type { ChartId } from '../charts/ChartArea';
import type { FightType } from '../charts/circles';
import {
  energyVerdict,
  type Matchup,
  oneCircleVerdict,
  type Scenario,
  type SideResult,
  twoCircleVerdict,
  type Verdict,
} from '../comparison/matchup';
import { METRICS as M, type MetricSection } from '../comparison/metrics';

export type FocusId = 'summary' | 'one-circle' | 'two-circle' | 'energy';

export interface Focus {
  id: FocusId;
  label: string;
  /** The question this view answers. */
  question: string;
  charts: readonly ChartId[];
  fightType?: FightType;
  sections: (s: Scenario) => MetricSection[];
  more: (s: Scenario) => MetricSection[];
}

export interface FightResult {
  focus: Exclude<FocusId, 'summary'>;
  label: string;
  verdict: Verdict;
  /** Why the winner wins, e.g. "57 m tighter". */
  detail: string;
  /** The deciding figure for each side: [label, attacker, defender]. */
  figures: [string, string, string];
}

/** Who wins each kind of fight, for the hotbar and the summary. */
export function fightResults(m: Matchup, scenario: Scenario, unit: SpeedUnit): FightResult[] {
  const one = oneCircleVerdict(m);
  const two = twoCircleVerdict(m);
  const energy = energyVerdict(m);
  const both = (f: (r: SideResult) => string): [string, string] => [f(m.attacker), f(m.defender)];
  const speedLeft = (r: SideResult) => formatSpeed(r.flown.timeline.at(-1)?.cas ?? 0, unit);
  return [
    {
      focus: 'one-circle',
      label: '1-circle',
      verdict: one,
      detail: `${formatDistance(one.margin)} tighter`,
      figures: ['Min radius', ...both((r) => formatDistance(r.pull.summary.minRadius.value))],
    },
    {
      focus: 'two-circle',
      label: '2-circle',
      verdict: two,
      detail: `+${formatRate(two.margin)} sustained`,
      figures: ['Best sustained rate', ...both((r) => formatRate(r.flown.summary.maxStr.value))],
    },
    {
      focus: 'energy',
      label: 'Energy',
      verdict: energy,
      detail: `+${formatSpeed(energy.margin, unit)} after ${scenario.turnDuration_s} s`,
      figures: [`Speed after ${scenario.turnDuration_s} s turning`, ...both(speedLeft)],
    },
  ];
}

const ALL_SECTIONS = (s: Scenario): MetricSection[] => [
  { title: 'G limits', metrics: [M.gLimit, M.pilotG, M.wingBreak] },
  {
    title: 'At the merge',
    metrics: [
      M.itrAtMerge,
      M.radiusAtMerge,
      M.flownRateAtMerge,
      M.topOfPlane,
      M.bottomOfPlane,
      M.strAtMerge,
      M.psFlown,
      M.psPull,
      M.ps1g,
    ],
  },
  {
    title: `After ${s.turnDuration_s} s turning`,
    metrics: [M.headingTurned, M.speedLeft, M.gAtEnd],
  },
  {
    title: 'Whole envelope',
    metrics: [
      M.cornerSpeed,
      M.bestItr,
      M.bestStr,
      M.bestStrSpeed,
      M.minRadius,
      M.thrustToWeight,
      M.wingLoading,
      M.mass,
    ],
  },
];

export const FOCUSES: readonly Focus[] = [
  {
    id: 'summary',
    label: 'Summary',
    question: 'Who wins each kind of fight, on one E-M diagram.',
    charts: ['em', 'advantage'],
    sections: () => [],
    more: ALL_SECTIONS,
  },
  {
    id: 'one-circle',
    label: '1-circle',
    question:
      'Nose-to-nose radius fight. Both pilots pull to the limiter; the tighter circle wins.',
    charts: ['circles', 'radius'],
    fightType: 'one-circle',
    sections: () => [
      {
        title: 'Radius fight · full pull',
        metrics: [M.minRadius, M.minRadiusSpeed, M.radiusAtMerge],
      },
    ],
    more: () => [
      { title: 'Limits', metrics: [M.gLimit, M.wingBreak, M.itrAtMerge, M.bestItr, M.cornerSpeed] },
    ],
  },
  {
    id: 'two-circle',
    label: '2-circle',
    question:
      'Nose-to-tail rate fight, flown as each pilot flies it. The higher sustained rate wins in the long run.',
    charts: ['circles', 'timeline', 'advantage'],
    fightType: 'two-circle',
    sections: (s) => [
      { title: 'Rate fight · as flown', metrics: [M.bestStr, M.bestStrSpeed, M.pilotG] },
      { title: `First ${s.turnDuration_s} s from the merge`, metrics: [M.headingTurned] },
    ],
    more: () => [
      {
        title: 'At the merge',
        metrics: [M.flownRateAtMerge, M.strAtMerge, M.topOfPlane, M.bottomOfPlane],
      },
      { title: 'End of the turn', metrics: [M.gAtEnd] },
    ],
  },
  {
    id: 'energy',
    label: 'Energy',
    question:
      'Energy retention: how much speed each jet keeps, and how fast it bleeds or gains it.',
    charts: ['energy', 'timeline'],
    sections: (s) => [
      { title: `After ${s.turnDuration_s} s turning`, metrics: [M.speedLeft] },
      { title: 'At the merge', metrics: [M.psFlown, M.ps1g] },
    ],
    more: () => [
      { title: 'Energy state', metrics: [M.psPull, M.thrustToWeight, M.wingLoading, M.mass] },
    ],
  },
];

export function getFocus(id: FocusId): Focus {
  return FOCUSES.find((f) => f.id === id) ?? (FOCUSES[0] as Focus);
}
