import { metresToFeet } from '../../physics/units';
import { SPEED_UNITS, type SpeedUnit } from '../../shared/format';
import { Slider } from '../../shared/ui/Slider';
import type { Scenario } from '../comparison/matchup';
import { AircraftControls } from './AircraftControls';

const MERGE_RANGE: Record<SpeedUnit, { min: number; max: number; step: number }> = {
  kmh: { min: 300, max: 1400, step: 10 },
  kts: { min: 160, max: 760, step: 5 },
};

export function ScenarioPanel({
  scenario,
  unit,
  onScenarioChange,
  onUnitChange,
}: {
  scenario: Scenario;
  unit: SpeedUnit;
  onScenarioChange: (scenario: Scenario) => void;
  onUnitChange: (unit: SpeedUnit) => void;
}) {
  const speed = SPEED_UNITS[unit];
  const mergeValue = Math.round(speed.fromMs(scenario.mergeCas));

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-300">
            Scenario
          </h2>
          <fieldset className="flex overflow-hidden rounded border border-slate-700 text-xs">
            <legend className="sr-only">Speed unit</legend>
            {(Object.keys(SPEED_UNITS) as SpeedUnit[]).map((u) => (
              <label
                key={u}
                className={`cursor-pointer px-2 py-0.5 ${u === unit ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
              >
                <input
                  type="radio"
                  name="speed-unit"
                  value={u}
                  checked={u === unit}
                  onChange={() => onUnitChange(u)}
                  className="sr-only"
                />
                {SPEED_UNITS[u].label}
              </label>
            ))}
          </fieldset>
        </div>

        <Slider
          label="Altitude"
          value={scenario.altitude_m}
          min={0}
          max={12_000}
          step={250}
          display={`${scenario.altitude_m.toLocaleString('en-GB')} m · ${Math.round(metresToFeet(scenario.altitude_m)).toLocaleString('en-GB')} ft`}
          onChange={(altitude_m) => onScenarioChange({ ...scenario, altitude_m })}
        />
        <Slider
          label="Merge speed (IAS)"
          value={mergeValue}
          min={MERGE_RANGE[unit].min}
          max={MERGE_RANGE[unit].max}
          step={MERGE_RANGE[unit].step}
          display={`${mergeValue} ${speed.label}`}
          onChange={(v) => onScenarioChange({ ...scenario, mergeCas: speed.toMs(v) })}
          accent="#facc15"
        />
      </section>

      <AircraftControls
        side="attacker"
        config={scenario.attacker}
        onChange={(attacker) => onScenarioChange({ ...scenario, attacker })}
      />
      <AircraftControls
        side="defender"
        config={scenario.defender}
        onChange={(defender) => onScenarioChange({ ...scenario, defender })}
      />
    </div>
  );
}
