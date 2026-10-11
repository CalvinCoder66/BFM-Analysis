import { useMemo, useState } from 'react';
import { ChartPanel } from './features/charts/ChartPanel';
import { MatchupTable } from './features/comparison/MatchupTable';
import { computeMatchup, type Scenario } from './features/comparison/matchup';
import { VerdictCards } from './features/comparison/VerdictCards';
import { SMOOTH_PILOT_G } from './features/scenario/AircraftControls';
import { ScenarioPanel } from './features/scenario/ScenarioPanel';
import { kmhToMs } from './physics/units';
import { formatSpeed, type SpeedUnit } from './shared/format';

export const DEFAULT_SCENARIO: Scenario = {
  altitude_m: 1_000,
  mergeCas: kmhToMs(800),
  turnDuration_s: 20,
  attacker: {
    aircraftId: 'f-16c',
    fuelFraction: 0.5,
    loadoutId: '2xfox2',
    limiter: 'instructor',
    pilotG: SMOOTH_PILOT_G,
    turnPlane_deg: 0,
  },
  defender: {
    aircraftId: 'mig-29',
    fuelFraction: 0.5,
    loadoutId: '2xfox2',
    limiter: 'instructor',
    pilotG: null,
    turnPlane_deg: 0,
  },
};

export function App() {
  const [scenario, setScenario] = useState<Scenario>(DEFAULT_SCENARIO);
  const [unit, setUnit] = useState<SpeedUnit>('kmh');
  const matchup = useMemo(() => computeMatchup(scenario), [scenario]);
  const mergeLabel = formatSpeed(scenario.mergeCas, unit);

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-emerald-500/20 bg-slate-950/80 px-5 py-3 backdrop-blur">
        <h1 className="font-mono text-lg font-semibold tracking-[0.3em] text-emerald-300">
          BFM ANALYSIS
        </h1>
        <p className="text-xs text-slate-500">4th-gen turn performance comparator</p>
        <p className="ml-auto font-mono text-xs text-slate-400">
          {matchup.attacker.aircraft.name} <span className="text-slate-600">vs</span>{' '}
          {matchup.defender.aircraft.name} <span className="text-slate-600">·</span>{' '}
          {scenario.altitude_m.toLocaleString('en-GB')} m <span className="text-slate-600">·</span>{' '}
          {mergeLabel} merge
          <span className="ml-3 rounded border border-amber-400/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-amber-300/90">
            Mock data
          </span>
        </p>
      </header>
      <div className="grid flex-1 gap-4 p-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside aria-label="Scenario setup">
          <ScenarioPanel
            scenario={scenario}
            unit={unit}
            onScenarioChange={setScenario}
            onUnitChange={setUnit}
          />
        </aside>
        <main className="flex min-w-0 flex-col gap-4">
          <VerdictCards matchup={matchup} unit={unit} turnDuration_s={scenario.turnDuration_s} />
          <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_400px]">
            <ChartPanel matchup={matchup} scenario={scenario} unit={unit} />
            <MatchupTable
              matchup={matchup}
              unit={unit}
              mergeLabel={mergeLabel}
              turnDuration_s={scenario.turnDuration_s}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
