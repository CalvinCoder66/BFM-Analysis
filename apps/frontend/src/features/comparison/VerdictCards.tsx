import type { ReactNode } from 'react';
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
  type Matchup,
  oneCircleVerdict,
  SIDES,
  type SideResult,
  twoCircleVerdict,
  type Verdict,
} from './matchup';

function Headline({
  verdict,
  matchup,
  detail,
}: {
  verdict: Verdict;
  matchup: Matchup;
  detail: string;
}) {
  if (verdict.winner === 'even') {
    return <p className="text-lg font-semibold text-slate-200">Even</p>;
  }
  return (
    <p className="text-lg font-semibold" style={{ color: SIDE_COLOURS[verdict.winner] }}>
      {matchup[verdict.winner].aircraft.name}
      <span className="ml-2 text-sm font-normal text-slate-300">{detail}</span>
    </p>
  );
}

function Row({ label, values }: { label: string; values: [ReactNode, ReactNode] }) {
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-slate-400">{label}</span>
      <span className="font-mono">
        <span style={{ color: SIDE_COLOURS.attacker }}>{values[0]}</span>
        <span className="text-slate-600"> / </span>
        <span style={{ color: SIDE_COLOURS.defender }}>{values[1]}</span>
      </span>
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <article
      className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3"
      aria-label={title}
    >
      <header>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-300">{title}</h3>
        <p className="text-[11px] text-slate-500">{subtitle}</p>
      </header>
      {children}
    </article>
  );
}

const pair = <T,>(m: Matchup, pick: (r: SideResult) => T): [T, T] =>
  SIDES.map((s) => pick(m[s])) as [T, T];

const orDash = (v: number | undefined, f: (n: number) => string) => (v === undefined ? '—' : f(v));

export function VerdictCards({ matchup, unit }: { matchup: Matchup; unit: SpeedUnit }) {
  const one = oneCircleVerdict(matchup);
  const two = twoCircleVerdict(matchup);
  const bleed = (() => {
    const [a, d] = pair(matchup, (r) => r.atMerge?.psAtMaxG);
    return a === undefined || d === undefined
      ? ({ winner: 'even', margin: 0 } as Verdict)
      : compareMetric(a, d, true);
  })();

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Card title="1-circle · radius fight" subtitle="Nose-to-nose: the tighter circle wins">
        <Headline
          verdict={one}
          matchup={matchup}
          detail={`${formatDistance(one.margin)} tighter`}
        />
        <Row
          label="Min radius"
          values={pair(matchup, (r) => formatDistance(r.summary.minRadius.value))}
        />
        <Row
          label="…at speed"
          values={pair(matchup, (r) => formatSpeed(casAtTas(r, r.summary.minRadius.tas), unit))}
        />
        <Row
          label="Radius at merge"
          values={pair(matchup, (r) => orDash(r.atMerge?.itrRadius, formatDistance))}
        />
      </Card>
      <Card title="2-circle · rate fight" subtitle="Nose-to-tail: the higher sustained rate wins">
        <Headline verdict={two} matchup={matchup} detail={`+${formatRate(two.margin)} sustained`} />
        <Row label="Best STR" values={pair(matchup, (r) => formatRate(r.summary.maxStr.value))} />
        <Row
          label="…at speed"
          values={pair(matchup, (r) => formatSpeed(casAtTas(r, r.summary.maxStr.tas), unit))}
        />
        <Row
          label="ITR at merge"
          values={pair(matchup, (r) => orDash(r.atMerge?.itr, formatRate))}
        />
      </Card>
      <Card title="Energy at merge" subtitle="Ps while pulling max G: who bleeds less">
        <Headline
          verdict={bleed}
          matchup={matchup}
          detail={`bleeds ${Math.round(bleed.margin)} m/s less`}
        />
        <Row
          label="Ps at max G"
          values={pair(matchup, (r) => orDash(r.atMerge?.psAtMaxG, formatPs))}
        />
        <Row label="Ps at 1 g" values={pair(matchup, (r) => orDash(r.atMerge?.psAt1g, formatPs))} />
        <Row
          label="Available G"
          values={pair(matchup, (r) => orDash(r.atMerge?.maxG, (g) => `${g.toFixed(1)} g`))}
        />
      </Card>
    </div>
  );
}
