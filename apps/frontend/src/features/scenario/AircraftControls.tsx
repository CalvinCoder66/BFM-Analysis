import { useId } from 'react';
import { AIRCRAFT, getAircraft } from '../../data/aircraft';
import { resolveCondition } from '../../physics/performance';
import { formatSpeed, type SpeedUnit } from '../../shared/format';
import { Segmented } from '../../shared/ui/Segmented';
import { Slider } from '../../shared/ui/Slider';
import { SIDE_COLOURS } from '../charts/series';
import type { Side, SideConfig } from '../comparison/matchup';
import { MergeSpeedSlider } from './MergeSpeedSlider';

const SIDE_LABEL: Record<Side, string> = { attacker: 'Attacker', defender: 'Defender' };
/** Default G for a pilot who flies smoothly instead of yanking. */
export const SMOOTH_PILOT_G = 7;

const selectClass =
  'w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 focus:border-slate-500 focus:outline-none';

function planeLabel(deg: number) {
  if (deg === 0) return '0° · level';
  if (deg === 90) return '90° · vertical';
  return `${deg}° · oblique`;
}

export function AircraftControls({
  side,
  config,
  mergeCas,
  unit,
  onChange,
}: {
  side: Side;
  config: SideConfig;
  /** The scenario's merge speed, which this jet flies unless it has its own. */
  mergeCas: number;
  unit: SpeedUnit;
  onChange: (config: SideConfig) => void;
}) {
  const aircraftId = useId();
  const loadoutId = useId();
  const aircraft = getAircraft(config.aircraftId);
  const colour = SIDE_COLOURS[side];
  const label = SIDE_LABEL[side];
  // G limits depend only on weight, so altitude does not matter here.
  const { gLimits } = resolveCondition(aircraft, {
    altitude_m: 0,
    fuelFraction: config.fuelFraction,
    loadoutId: config.loadoutId,
  });
  const ceiling = config.limiter === 'off' ? gLimits.manual : gLimits.instructor;
  const pilotMax = Math.floor(ceiling * 2) / 2;

  return (
    <fieldset className="hud-panel space-y-3 p-3" style={{ borderLeft: `3px solid ${colour}` }}>
      <legend
        className="px-1 text-xs font-semibold uppercase tracking-widest"
        style={{ color: colour }}
      >
        {label}
      </legend>

      <div className="space-y-1">
        <label htmlFor={aircraftId} className="text-xs uppercase tracking-wider text-slate-400">
          {label} aircraft
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
          {label} loadout
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
        label={`${label} fuel`}
        value={Math.round(config.fuelFraction * 100)}
        min={0}
        max={100}
        step={5}
        display={`${Math.round(config.fuelFraction * 100)}% · ${Math.round(config.fuelFraction * aircraft.internalFuel_kg).toLocaleString('en-GB')} kg`}
        onChange={(pct) => onChange({ ...config, fuelFraction: pct / 100 })}
        accent={colour}
      />

      {/* Optional override of the scenario's merge speed, kept low-key until it is used. */}
      <div className="space-y-2">
        <label className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300">
          <input
            type="checkbox"
            checked={config.mergeCas !== null}
            onChange={(e) => onChange({ ...config, mergeCas: e.target.checked ? mergeCas : null })}
            style={{ accentColor: colour }}
          />
          <span>
            <span className="sr-only">{label} </span>Own merge speed
          </span>
          {config.mergeCas === null && (
            <span className="text-slate-600">· using {formatSpeed(mergeCas, unit)}</span>
          )}
        </label>
        {config.mergeCas !== null && (
          <MergeSpeedSlider
            label={`${label} merge speed`}
            cas={config.mergeCas}
            unit={unit}
            onChange={(cas) => onChange({ ...config, mergeCas: cas })}
            accent={colour}
          />
        )}
      </div>

      <details className="group space-y-3 rounded border border-slate-800 bg-slate-950/40 px-2 py-1.5">
        <summary className="cursor-pointer select-none list-none text-xs text-slate-400 hover:text-slate-200">
          <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
          <span className="uppercase tracking-wider">Pilot &amp; limits</span>
          <span className="mt-0.5 block font-mono text-slate-300">
            {config.limiter === 'off' ? 'Off' : 'Instructor'} {ceiling.toFixed(1)} g ·{' '}
            {config.pilotG === null
              ? 'yanks'
              : `smooth ${Math.min(config.pilotG, ceiling).toFixed(1)} g`}{' '}
            · {config.turnPlane_deg}° plane
          </span>
        </summary>
        <Segmented
          legend={`${label} G limiter`}
          showLegend
          value={config.limiter}
          options={[
            { value: 'instructor', label: `Instructor ${gLimits.instructor.toFixed(1)} g` },
            { value: 'off', label: `Off ${gLimits.manual.toFixed(1)} g` },
          ]}
          onChange={(limiter) => onChange({ ...config, limiter })}
        />
        <p className="-mt-2 text-[11px] text-slate-500">
          {aircraft.gLimits.fcs !== null
            ? `Fly-by-wire limits to ${aircraft.gLimits.fcs} g either way. `
            : ''}
          Wings fail at {gLimits.wingBreak.toFixed(1)} g at this weight.
        </p>

        <Segmented
          legend={`${label} pilot`}
          showLegend
          value={config.pilotG === null ? 'yank' : 'smooth'}
          options={[
            { value: 'yank', label: 'Yanks to limit' },
            { value: 'smooth', label: 'Smooth' },
          ]}
          onChange={(style) =>
            onChange({
              ...config,
              pilotG: style === 'yank' ? null : Math.min(SMOOTH_PILOT_G, pilotMax),
            })
          }
        />
        {config.pilotG !== null && (
          <Slider
            label={`${label} pilot G`}
            value={Math.min(config.pilotG, pilotMax)}
            min={3}
            max={pilotMax}
            step={0.5}
            display={`${Math.min(config.pilotG, ceiling).toFixed(1)} g`}
            onChange={(pilotG) => onChange({ ...config, pilotG })}
            accent={colour}
          />
        )}

        <Slider
          label={`${label} turn plane`}
          value={config.turnPlane_deg}
          min={0}
          max={90}
          step={5}
          display={planeLabel(config.turnPlane_deg)}
          onChange={(turnPlane_deg) => onChange({ ...config, turnPlane_deg })}
          accent={colour}
        />
      </details>

      {aircraft.source === 'mock' && (
        <p className="text-[11px] text-amber-400/80">Mock data, not War Thunder values</p>
      )}
    </fieldset>
  );
}
