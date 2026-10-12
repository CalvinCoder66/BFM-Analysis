import { kmhToMs, knotsToMs, msToKmh, msToKnots } from '../physics/units';

export type SpeedUnit = 'kmh' | 'kts';

export const SPEED_UNITS: Record<
  SpeedUnit,
  { label: string; fromMs: (ms: number) => number; toMs: (v: number) => number }
> = {
  kmh: { label: 'km/h', fromMs: msToKmh, toMs: kmhToMs },
  kts: { label: 'kts', fromMs: msToKnots, toMs: knotsToMs },
};

export function formatSpeed(ms: number, unit: SpeedUnit): string {
  return `${Math.round(SPEED_UNITS[unit].fromMs(ms))} ${SPEED_UNITS[unit].label}`;
}

export function formatRate(degPerSec: number): string {
  return `${degPerSec.toFixed(1)}°/s`;
}

export function formatDistance(metres: number): string {
  return Number.isFinite(metres) ? `${Math.round(metres).toLocaleString('en-GB')} m` : '—';
}

/** Height change, signed: "+312 m", "−57 m". */
export function formatClimb(metres: number): string {
  return `${metres < 0 ? '−' : '+'}${formatDistance(Math.abs(metres))}`;
}

export function formatPs(ms: number): string {
  const rounded = Math.round(ms);
  return `${rounded > 0 ? '+' : ''}${rounded} m/s`;
}
