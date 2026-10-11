import { useMemo, useState } from 'react';
import { ChartPanel } from './features/charts/ChartPanel';
import { MatchupTable } from './features/comparison/MatchupTable';
import { computeMatchup, type Scenario } from './features/comparison/matchup';
import { VerdictCards } from './features/comparison/VerdictCards';
import { ScenarioPanel } from './features/scenario/ScenarioPanel';
import { kmhToMs } from './physics/units';
import { formatSpeed, type SpeedUnit } from './shared/format';

export const DEFAULT_SCENARIO: Scenario = {
  altitude_m: 1_000,
  mergeCas: kmhToMs(800),
  attacker: { aircraftId: 'f-16c', fuelFraction: 0.5, loadoutId: '2xfox2' },
  defender: { aircraftId: 'mig-29', fuelFraction: 0.5, loadoutId: '2xfox2' },
};

export function App() {
  const [scenario, setScenario] = useState<Scenario>(DEFAULT_SCENARIO);
  const [unit, setUnit] = useState<SpeedUnit>('kmh');
  const matchup = useMemo(() => computeMatchup(scenario), [scenario]);

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-baseline gap-3 border-b border-slate-800 px-5 py-3">
        <h1 className="font-mono text-lg font-semibold tracking-widest text-slate-100">
          BFM ANALYSIS
        </h1>
        <p className="text-xs text-slate-500">
          4th-gen turn performance comparator · level turns · mock data
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
          <VerdictCards matchup={matchup} unit={unit} />
          <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_380px]">
            <ChartPanel matchup={matchup} scenario={scenario} unit={unit} />
            <MatchupTable
              matchup={matchup}
              unit={unit}
              mergeLabel={formatSpeed(scenario.mergeCas, unit)}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
