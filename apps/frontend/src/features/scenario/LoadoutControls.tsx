import { useId, useState } from 'react';
import type { Aircraft, Selection, Stores } from '../../data/aircraft-schema';
import {
  choose,
  describeLoad,
  evaluate,
  isA2g,
  type LoadRole,
  loadRole,
  orderedSlots,
  slotLabel,
  slotOptions,
} from '../../data/stores';
import type { SideConfig } from '../comparison/matchup';

const selectClass =
  'w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 focus:border-slate-500 focus:outline-none';
const CUSTOM = '__custom';

const ROLE_BADGE: Record<Exclude<LoadRole, null>, { label: string; className: string }> = {
  a2a: { label: 'A2A', className: 'border-sky-400/40 text-sky-300' },
  a2g: { label: 'A2G', className: 'border-amber-400/40 text-amber-300' },
  mixed: { label: 'Mixed', className: 'border-violet-400/40 text-violet-300' },
};

function RoleBadge({ role }: { role: LoadRole }) {
  if (role === null) return null;
  const { label, className } = ROLE_BADGE[role];
  return (
    <span className={`mr-1.5 rounded border px-1 text-[10px] tracking-wider ${className}`}>
      {label}
    </span>
  );
}

const kg = (v: number) => `${Math.round(v).toLocaleString('en-GB')} kg`;

/**
 * Loadout choice for one side: a quick pick (clean, the game's presets) and, for aircraft with
 * pylon-slot data, a "Customise" panel with one select per slot. Choices the game would not allow
 * are disabled with the reason.
 */
export function LoadoutControls({
  label,
  aircraft,
  config,
  onChange,
}: {
  label: string;
  aircraft: Aircraft;
  config: SideConfig;
  onChange: (config: SideConfig) => void;
}) {
  const id = useId();
  const [a2aOnly, setA2aOnly] = useState(false);
  const { stores } = aircraft;
  const quickPick = aircraft.loadouts.find((l) => l.id === config.loadoutId);
  const selection: Selection = config.stores ?? quickPick?.selection ?? {};
  const roleOf = (picks: Selection | undefined) =>
    stores && picks ? loadRole(evaluate(stores, picks).roles) : null;
  // The A2A filter hides air-to-ground quick picks, but never the one in use.
  const quickPicks = aircraft.loadouts.filter(
    (l) =>
      !a2aOnly ||
      (l.id === config.loadoutId && !config.stores) ||
      !['a2g', 'mixed'].includes(roleOf(l.selection) ?? ''),
  );

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs uppercase tracking-wider text-slate-400">
          {label} loadout
        </label>
        {stores && (
          <label className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300">
            <input
              type="checkbox"
              checked={a2aOnly}
              onChange={(e) => setA2aOnly(e.target.checked)}
              className="accent-slate-400"
            />
            <span>
              <span className="sr-only">{label} </span>A2A only
            </span>
          </label>
        )}
      </div>
      <select
        id={id}
        className={selectClass}
        value={config.stores ? CUSTOM : config.loadoutId}
        onChange={(e) => onChange({ ...config, loadoutId: e.target.value, stores: null })}
      >
        {quickPicks.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name} {l.mass_kg > 0 ? `(+${kg(l.mass_kg)})` : ''}
          </option>
        ))}
        {config.stores && <option value={CUSTOM}>Custom</option>}
      </select>
      {stores && (
        <StoresEditor
          label={label}
          stores={stores}
          selection={selection}
          custom={config.stores !== null}
          a2aOnly={a2aOnly}
          onSelect={(next) => onChange({ ...config, stores: next })}
        />
      )}
    </div>
  );
}

/** Summary of the load and, on demand, one select per pylon slot. */
function StoresEditor({
  label,
  stores,
  selection,
  custom,
  a2aOnly,
  onSelect,
}: {
  label: string;
  stores: Stores;
  selection: Selection;
  custom: boolean;
  a2aOnly: boolean;
  /** New custom picks, or null to go back to the quick pick. */
  onSelect: (selection: Selection | null) => void;
}) {
  const load = evaluate(stores, selection);
  return (
    <details className="group rounded border border-slate-800 bg-slate-950/40 px-2 py-1.5">
      <summary className="cursor-pointer select-none list-none text-xs text-slate-400 hover:text-slate-200">
        <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
        <span className="uppercase tracking-wider">Customise</span>
        <span className="mt-0.5 block font-mono text-slate-300">
          <RoleBadge role={loadRole(load.roles)} />
          {describeLoad(load)}
        </span>
      </summary>
      <div className="mt-2 space-y-2">
        {orderedSlots(stores).map((slot) => {
          const current = selection[slot.index];
          const options = slotOptions(stores, selection, slot.index).filter(
            (o) => !a2aOnly || o.preset === null || o.preset.id === current || !isA2g(o.preset),
          );
          const name = slotLabel(slot);
          return (
            <div key={slot.index} className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
              <label
                htmlFor={`${label}-slot-${slot.index}`}
                className="truncate text-[11px] capitalize text-slate-500"
                title={name}
              >
                {name}
              </label>
              <select
                id={`${label}-slot-${slot.index}`}
                aria-label={`${label} ${name}`}
                className={`${selectClass} py-1 text-xs`}
                value={current ?? ''}
                onChange={(e) =>
                  onSelect(choose(stores, selection, slot.index, e.target.value || null))
                }
              >
                {options.map(({ preset, allowed, reason }) => (
                  <option
                    key={preset?.id ?? ''}
                    value={preset?.id ?? ''}
                    disabled={!allowed}
                    title={reason}
                  >
                    {preset ? preset.name : 'Empty'}
                    {allowed ? '' : ` — ${reason}`}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
        <p className="text-[11px] text-slate-500">
          {kg(load.mass_kg)} of {kg(stores.maxLoad_kg)} maximum load
          {stores.dragValidated ? '' : ' · store drag is an estimate until flight-tested'}
        </p>
        {load.violations.length > 0 && (
          <ul className="space-y-0.5 text-[11px] text-amber-300/90">
            {load.violations.map((v) => (
              <li key={v.reason}>{v.reason}</li>
            ))}
          </ul>
        )}
        {custom && (
          <button
            type="button"
            className="text-[11px] text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
            onClick={() => onSelect(null)}
          >
            Back to the quick pick
          </button>
        )}
      </div>
    </details>
  );
}
