import { useId } from 'react';

interface SegmentedProps<T extends string> {
  /** Accessible group name. */
  legend: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Show the legend visually (otherwise screen-reader only). */
  showLegend?: boolean;
}

/** Radio group styled as a segmented button. */
export function Segmented<T extends string>({
  legend,
  options,
  value,
  onChange,
  showLegend = false,
}: SegmentedProps<T>) {
  const name = useId();
  return (
    <fieldset className="space-y-1">
      <legend
        className={showLegend ? 'text-xs uppercase tracking-wider text-slate-400' : 'sr-only'}
      >
        {legend}
      </legend>
      <div className="flex overflow-hidden rounded border border-slate-700 text-xs">
        {options.map((option) => (
          <label
            key={option.value}
            className={`flex-1 cursor-pointer px-2 py-1 text-center transition-colors ${
              option.value === value
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
