import { useId } from 'react';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** Text shown next to the label, e.g. "3 000 m". */
  display: string;
  accent?: string;
}

export function Slider({ label, value, min, max, step, onChange, display, accent }: SliderProps) {
  const id = useId();
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <label htmlFor={id} className="uppercase tracking-wider text-slate-400">
          {label}
        </label>
        <output htmlFor={id} className="font-mono text-sm text-slate-100">
          {display}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        style={{ accentColor: accent ?? '#94a3b8' }}
      />
    </div>
  );
}
