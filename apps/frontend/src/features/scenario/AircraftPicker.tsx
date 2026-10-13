import { useId, useState } from 'react';
import { AIRCRAFT, getAircraft, groupByBr, matchesQuery } from '../../data/aircraft';

const inputClass =
  'w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 focus:border-slate-500 focus:outline-none';

/** Aircraft select grouped by battle rating, with a search box that also matches variant names. */
export function AircraftPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (aircraftId: string) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const selected = getAircraft(value);
  // The selected aircraft always stays in the list, so the select keeps showing it.
  const shown = AIRCRAFT.filter((a) => a.id === value || matchesQuery(a, query));
  const others = (selected.variants ?? []).filter((v) => v.name !== selected.name);

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs uppercase tracking-wider text-slate-400">
        {label} aircraft
      </label>
      <input
        type="search"
        aria-label={`Search ${label.toLowerCase()} aircraft`}
        placeholder="Search name, nation or variant"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className={`${inputClass} py-1 text-xs placeholder:text-slate-600`}
      />
      <select
        id={id}
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {groupByBr(shown).map(({ br, aircraft }) => (
          <optgroup key={br ?? 'none'} label={br === null ? 'No BR' : `BR ${br.toFixed(1)}`}>
            {aircraft.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.nation}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {shown.length === 1 && query.trim() !== '' && !matchesQuery(selected, query) && (
        <p className="text-[11px] text-slate-500">No aircraft match “{query.trim()}”.</p>
      )}
      {others.length > 0 && (
        <p className="text-[11px] text-slate-500">
          Also flown as {others.map((v) => v.name).join(', ')}
        </p>
      )}
    </div>
  );
}
