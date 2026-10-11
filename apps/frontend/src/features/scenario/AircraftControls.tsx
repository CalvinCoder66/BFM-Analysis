import { useId } from 'react';
import { AIRCRAFT, getAircraft } from '../../data/aircraft';
import { Slider } from '../../shared/ui/Slider';
import { SIDE_COLOURS } from '../charts/series';
import type { Side, SideConfig } from '../comparison/matchup';

const SIDE_LABEL: Record<Side, string> = { attacker: 'Attacker', defender: 'Defender' };

const selectClass =
  'w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 focus:border-slate-500 focus:outline-none';

export function AircraftControls({
  side,
  config,
  onChange,
}: {
  side: Side;
  config: SideConfig;
  onChange: (config: SideConfig) => void;
}) {
  const aircraftId = useId();
  const loadoutId = useId();
  const aircraft = getAircraft(config.aircraftId);
  const colour = SIDE_COLOURS[side];

  return (
    <fieldset
      className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3"
      style={{ borderLeft: `3px solid ${colour}` }}
    >
      <legend
        className="px-1 text-xs font-semibold uppercase tracking-widest"
        style={{ color: colour }}
      >
        {SIDE_LABEL[side]}
      </legend>

      <div className="space-y-1">
        <label htmlFor={aircraftId} className="text-xs uppercase tracking-wider text-slate-400">
          {SIDE_LABEL[side]} aircraft
        </label>
        <select
          id={aircraftId}
          className={selectClass}
          value={config.aircraftId}
          onChange={(e) => {
            const next = getAircraft(e.target.value);
            onChange({ ...config, aircraftId: next.id, loadoutId: next.loadouts[0]?.id ?? '' });
          }}
        >
          {AIRCRAFT.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor={loadoutId} className="text-xs uppercase tracking-wider text-slate-400">
          {SIDE_LABEL[side]} loadout
        </label>
        <select
          id={loadoutId}
          className={selectClass}
          value={config.loadoutId}
          onChange={(e) => onChange({ ...config, loadoutId: e.target.value })}
        >
          {aircraft.loadouts.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} {l.mass_kg > 0 ? `(+${l.mass_kg} kg)` : ''}
            </option>
          ))}
        </select>
      </div>

      <Slider
        label={`${SIDE_LABEL[side]} fuel`}
        value={Math.round(config.fuelFraction * 100)}
        min={0}
        max={100}
        step={5}
        display={`${Math.round(config.fuelFraction * 100)}% · ${Math.round(config.fuelFraction * aircraft.internalFuel_kg).toLocaleString('en-GB')} kg`}
        onChange={(pct) => onChange({ ...config, fuelFraction: pct / 100 })}
        accent={colour}
      />

      {aircraft.source === 'mock' && (
        <p className="text-[11px] text-amber-400/80">Mock data, not War Thunder values</p>
      )}
    </fieldset>
  );
}
