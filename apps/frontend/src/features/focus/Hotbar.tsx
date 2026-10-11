import { SIDE_COLOURS } from '../charts/series';
import type { Matchup } from '../comparison/matchup';
import { type FightResult, FOCUSES, type FocusId } from './focus';

function Winner({ result, matchup }: { result: FightResult; matchup: Matchup }) {
  const { winner } = result.verdict;
  if (winner === 'even') return <span className="text-slate-300">Even</span>;
  return <span style={{ color: SIDE_COLOURS[winner] }}>{matchup[winner].aircraft.name}</span>;
}

/**
 * Always-visible bar of the four focus views. Each slot carries its headline result, so the bar
 * doubles as the at-a-glance summary.
 */
export function Hotbar({
  matchup,
  results,
  active,
  onSelect,
}: {
  matchup: Matchup;
  results: readonly FightResult[];
  active: FocusId;
  onSelect: (id: FocusId) => void;
}) {
  return (
    <div role="tablist" aria-label="Focus" className="grid grid-cols-2 gap-2 xl:grid-cols-4">
      {FOCUSES.map((focus) => {
        const result = results.find((r) => r.focus === focus.id);
        const selected = focus.id === active;
        return (
          <button
            key={focus.id}
            type="button"
            role="tab"
            id={`focus-tab-${focus.id}`}
            aria-selected={selected}
            aria-controls="focus-panel"
            onClick={() => onSelect(focus.id)}
            className={`hud-panel px-3 py-2 text-left transition-colors ${
              selected
                ? 'border-emerald-400/60 bg-emerald-950/30 ring-1 ring-emerald-400/40'
                : 'hover:bg-slate-800/60'
            }`}
          >
            <span className="block text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              {focus.label}
            </span>
            {result ? (
              <span className="block truncate text-sm font-semibold">
                <Winner result={result} matchup={matchup} />
                {result.verdict.winner !== 'even' && (
                  <span className="ml-1.5 font-normal text-slate-400">{result.detail}</span>
                )}
              </span>
            ) : (
              <span className="block truncate text-sm text-slate-300">
                {results.map((r, i) => (
                  <span key={r.focus}>
                    {i > 0 && <span className="text-slate-600"> · </span>}
                    {r.label} <Winner result={r} matchup={matchup} />
                  </span>
                ))}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
