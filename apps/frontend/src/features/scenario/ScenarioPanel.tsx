import { metresToFeet } from '../../physics/units';
import { SPEED_UNITS, type SpeedUnit } from '../../shared/format';
import { Segmented } from '../../shared/ui/Segmented';
import { Slider } from '../../shared/ui/Slider';
import { type Scenario, SIDES } from '../comparison/matchup';
import { AircraftControls } from './AircraftControls';
import { MergeSpeedSlider } from './MergeSpeedSlider';

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
  const overridden = SIDES.filter((side) => scenario[side].mergeCas !== null);

  return (
    <div className="space-y-4">
      <section className="hud-panel space-y-3 p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-300">
            Scenario
          </h2>
          <div className="w-28">
            <Segmented
              legend="Speed unit"
              value={unit}
              options={(Object.keys(SPEED_UNITS) as SpeedUnit[]).map((u) => ({
                value: u,
                label: SPEED_UNITS[u].label,
              }))}
              onChange={onUnitChange}
            />
          </div>
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
        <div className="space-y-1">
          <MergeSpeedSlider
            label="Merge speed (IAS)"
            cas={scenario.mergeCas}
            unit={unit}
            onChange={(mergeCas) => onScenarioChange({ ...scenario, mergeCas })}
            accent="#facc15"
          />
          {overridden.length > 0 && (
            <p className="text-[11px] text-slate-500">
              {overridden.length === 2
                ? 'Both jets fly their own merge speed.'
                : `The ${overridden[0]} flies its own merge speed.`}
            </p>
          )}
        </div>
        <Slider
          label="Turn duration"
          value={scenario.turnDuration_s}
          min={5}
          max={60}
          step={5}
          display={`${scenario.turnDuration_s} s`}
          onChange={(turnDuration_s) => onScenarioChange({ ...scenario, turnDuration_s })}
        />
      </section>

      {SIDES.map((side) => (
        <AircraftControls
          key={side}
          side={side}
          config={scenario[side]}
          mergeCas={scenario.mergeCas}
          unit={unit}
          onChange={(config) => onScenarioChange({ ...scenario, [side]: config })}
        />
      ))}
    </div>
  );
}
