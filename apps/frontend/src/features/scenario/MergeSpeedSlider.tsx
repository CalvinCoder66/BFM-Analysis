import { SPEED_UNITS, type SpeedUnit } from '../../shared/format';
import { Slider } from '../../shared/ui/Slider';

const MERGE_RANGE: Record<SpeedUnit, { min: number; max: number; step: number }> = {
  kmh: { min: 300, max: 1400, step: 10 },
  kts: { min: 160, max: 760, step: 5 },
};

/** Merge speed (CAS, m/s) slider in the display unit: the scenario's, or one jet's own. */
export function MergeSpeedSlider({
  label,
  cas,
  unit,
  onChange,
  accent,
}: {
  label: string;
  cas: number;
  unit: SpeedUnit;
  onChange: (cas: number) => void;
  accent: string;
}) {
  const speed = SPEED_UNITS[unit];
  const value = Math.round(speed.fromMs(cas));
  return (
    <Slider
      label={label}
      value={value}
      {...MERGE_RANGE[unit]}
      display={`${value} ${speed.label}`}
      onChange={(v) => onChange(speed.toMs(v))}
      accent={accent}
    />
  );
}
