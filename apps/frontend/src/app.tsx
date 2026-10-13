import { useMemo, useState } from 'react';
import { type DataStatus, dataStatus, patchLabel } from './data/aircraft';
import { computeMatchup, type Scenario, SIDES, sideMergeCas } from './features/comparison/matchup';
import { FocusView } from './features/focus/FocusView';
import { type FocusId, fightResults, getFocus } from './features/focus/focus';
import { Hotbar } from './features/focus/Hotbar';
import { SMOOTH_PILOT_G } from './features/scenario/AircraftControls';
import { ScenarioPanel } from './features/scenario/ScenarioPanel';
import { kmhToMs } from './physics/units';
import { formatSpeed, SPEED_UNITS, type SpeedUnit } from './shared/format';
import { DataBadge } from './shared/ui/DataBadge';

export const DEFAULT_SCENARIO: Scenario = {
  altitude_m: 1_000,
  mergeCas: kmhToMs(800),
  turnDuration_s: 20,
  attacker: {
    aircraftId: 'f-16c',
    fuelFraction: 0.5,
    loadoutId: '2xfox2',
    stores: null,
    pilotG: SMOOTH_PILOT_G,
    turnPlane_deg: 0,
    mergeCas: null,
  },
  defender: {
    aircraftId: 'mig-29',
    fuelFraction: 0.5,
    loadoutId: '2xfox2',
    stores: null,
    pilotG: null,
    turnPlane_deg: 0,
    mergeCas: null,
  },
};

export function App() {
  const [scenario, setScenario] = useState<Scenario>(DEFAULT_SCENARIO);
  const [unit, setUnit] = useState<SpeedUnit>('kmh');
  const [focusId, setFocusId] = useState<FocusId>('summary');
  const matchup = useMemo(() => computeMatchup(scenario), [scenario]);
  const results = fightResults(matchup, scenario, unit);
  // The header shows the least trustworthy of the two jets' data.
  const statuses = SIDES.map((side) => dataStatus(matchup[side].aircraft));
  const headerStatus = (['mock', 'unvalidated', 'validated'] as const).find((s) =>
    statuses.includes(s),
  ) as DataStatus;
  // Each jet flies its own merge speed if set; show both when they differ.
  const attackerMerge = sideMergeCas(scenario, 'attacker');
  const defenderMerge = sideMergeCas(scenario, 'defender');
  const mergeLabel =
    attackerMerge === defenderMerge
      ? formatSpeed(attackerMerge, unit)
      : `${Math.round(SPEED_UNITS[unit].fromMs(attackerMerge))} vs ${formatSpeed(defenderMerge, unit)}`;

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
          <span className="ml-3">
            <DataBadge status={headerStatus} patch={patchLabel(matchup.attacker.aircraft)} />
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
          <Hotbar matchup={matchup} results={results} active={focusId} onSelect={setFocusId} />
          <FocusView
            focus={getFocus(focusId)}
            matchup={matchup}
            scenario={scenario}
            unit={unit}
            results={results}
            onSelect={setFocusId}
          />
        </main>
      </div>
      <footer className="px-5 pb-4 text-[11px] text-slate-600">
        Flight-model data from War Thunder © Gaijin Entertainment, extracted by{' '}
        <a
          href="https://github.com/gszabi99/War-Thunder-Datamine"
          className="underline-offset-2 hover:text-slate-400 hover:underline"
        >
          gszabi99/War-Thunder-Datamine
        </a>
        . Not affiliated with Gaijin.
      </footer>
    </div>
  );
}
