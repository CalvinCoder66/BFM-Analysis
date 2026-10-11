import type { SpeedUnit } from '../../shared/format';
import { ChartArea } from '../charts/ChartArea';
import { SIDE_COLOURS } from '../charts/series';
import type { Matchup, Scenario } from '../comparison/matchup';
import { StatsPanel } from '../comparison/StatsPanel';
import type { FightResult, Focus, FocusId } from './focus';

function SummaryList({
  matchup,
  results,
  onSelect,
}: {
  matchup: Matchup;
  results: readonly FightResult[];
  onSelect: (id: FocusId) => void;
}) {
  return (
    <ul className="space-y-2">
      {results.map((r) => {
        const { winner } = r.verdict;
        return (
          <li key={r.focus} className="rounded border border-slate-800 bg-slate-950/40 px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                {r.label}
              </span>
              <button
                type="button"
                onClick={() => onSelect(r.focus)}
                className="text-xs text-emerald-300/80 hover:text-emerald-200"
              >
                Details ›
              </button>
            </div>
            <p className="font-semibold">
              {winner === 'even' ? (
                <span className="text-slate-200">Even</span>
              ) : (
                <>
                  <span style={{ color: SIDE_COLOURS[winner] }}>
                    {matchup[winner].aircraft.name}
                  </span>
                  <span className="ml-2 text-sm font-normal text-slate-400">{r.detail}</span>
                </>
              )}
            </p>
            <p className="flex justify-between gap-2 text-xs">
              <span className="text-slate-500">{r.figures[0]}</span>
              <span className="font-mono">
                <span style={{ color: SIDE_COLOURS.attacker }}>{r.figures[1]}</span>
                <span className="text-slate-600"> / </span>
                <span style={{ color: SIDE_COLOURS.defender }}>{r.figures[2]}</span>
              </span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/** One focus view: its chart(s) beside the stats that matter for it. */
export function FocusView({
  focus,
  matchup,
  scenario,
  unit,
  results,
  onSelect,
}: {
  focus: Focus;
  matchup: Matchup;
  scenario: Scenario;
  unit: SpeedUnit;
  results: readonly FightResult[];
  onSelect: (id: FocusId) => void;
}) {
  return (
    <div
      id="focus-panel"
      role="tabpanel"
      aria-labelledby={`focus-tab-${focus.id}`}
      className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]"
    >
      {/* Remount per focus so each view starts on its own first chart. */}
      <ChartArea
        key={focus.id}
        matchup={matchup}
        scenario={scenario}
        unit={unit}
        charts={focus.charts}
        fightType={focus.fightType}
      />
      <aside className="hud-panel space-y-3 p-3" aria-label={`${focus.label} stats`}>
        <p className="text-sm leading-relaxed text-slate-300">{focus.question}</p>
        {focus.id === 'summary' && (
          <SummaryList matchup={matchup} results={results} onSelect={onSelect} />
        )}
        <StatsPanel
          key={focus.id}
          matchup={matchup}
          unit={unit}
          sections={focus.sections(scenario)}
          moreSections={focus.more(scenario)}
          moreLabel={focus.id === 'summary' ? 'all stats' : 'more stats'}
        />
      </aside>
    </div>
  );
}
