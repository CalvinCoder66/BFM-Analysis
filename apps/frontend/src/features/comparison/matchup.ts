import { getAircraft } from '../../data/aircraft';
import type { Aircraft, Loadout } from '../../data/aircraft-schema';
import { casToTas } from '../../physics/atmosphere';
import {
  envelope,
  type FlightCondition,
  type Limiter,
  type PerformanceSummary,
  type PointPerformance,
  pointPerformance,
  resolveCondition,
  summarise,
} from '../../physics/performance';
import { simulateTurn, type TimelinePoint } from '../../physics/timeline';

export type Side = 'attacker' | 'defender';
export const SIDES: readonly Side[] = ['attacker', 'defender'];

export interface SideConfig {
  aircraftId: string;
  /** 0–1 */
  fuelFraction: number;
  loadoutId: string;
  /** War Thunder instructor on, or off (manual up to wing-break / fly-by-wire limit). */
  limiter: Limiter;
  /** G the pilot holds when flying smoothly; null = yank to the limiter every time. */
  pilotG: number | null;
  /** Turn-plane inclination: 0° level turn … 90° vertical loop. */
  turnPlane_deg: number;
}

export interface Scenario {
  altitude_m: number;
  /** Merge speed as calibrated airspeed (≈ IAS), m/s. */
  mergeCas: number;
  /** How long to fly the turn in the timeline and turn-circle views, seconds. */
  turnDuration_s: number;
  attacker: SideConfig;
  defender: SideConfig;
}

/** Performance of one way of flying the jet (pulling to the limiter, or as the pilot flies it). */
export interface Flight {
  condition: FlightCondition;
  curve: PointPerformance[];
  summary: PerformanceSummary;
  /** Performance at the merge speed, or null if the merge speed is outside this jet's envelope. */
  atMerge: PointPerformance | null;
  /** A sustained turn from the merge speed for the scenario's turn duration. */
  timeline: TimelinePoint[];
}

export interface SideResult {
  aircraft: Aircraft;
  loadout: Loadout;
  config: SideConfig;
  /** Pulling to the limiter, which is how a 1-circle (radius) fight is flown. */
  pull: Flight;
  /** As the pilot chooses to fly: drives rate (2-circle) fights and energy. Same as `pull` when yanking. */
  flown: Flight;
}

export type Matchup = Record<Side, SideResult>;

function fly(condition: FlightCondition, mergeCas: number, duration_s: number): Flight {
  const curve = envelope(condition);
  const summary = summarise(condition, curve);
  const mergeTas = casToTas(mergeCas, condition.altitude_m);
  const { stallTas, maxTas } = summary.limits;
  const inEnvelope = mergeTas >= stallTas && mergeTas <= maxTas + 1e-6;
  const entryTas = Math.min(Math.max(mergeTas, stallTas), maxTas);
  return {
    condition,
    curve,
    summary,
    atMerge: inEnvelope ? pointPerformance(condition, mergeTas) : null,
    timeline: simulateTurn(condition, entryTas, duration_s),
  };
}

export function computeSide(
  config: SideConfig,
  altitude_m: number,
  mergeCas: number,
  turnDuration_s = 20,
): SideResult {
  const aircraft = getAircraft(config.aircraftId);
  const loadout = aircraft.loadouts.find((l) => l.id === config.loadoutId) ?? aircraft.loadouts[0];
  if (!loadout) throw new Error(`${aircraft.id} has no loadouts`);
  const base = {
    altitude_m,
    fuelFraction: config.fuelFraction,
    loadoutId: loadout.id,
    limiter: config.limiter,
    turnPlane_deg: config.turnPlane_deg,
  };
  const pull = fly(resolveCondition(aircraft, base), mergeCas, turnDuration_s);
  const smooth = config.pilotG !== null && config.pilotG < pull.condition.gLimit;
  const flown = smooth
    ? fly(resolveCondition(aircraft, { ...base, pilotG: config.pilotG }), mergeCas, turnDuration_s)
    : pull;
  return { aircraft, loadout, config, pull, flown };
}

export function computeMatchup(scenario: Scenario): Matchup {
  const side = (config: SideConfig) =>
    computeSide(config, scenario.altitude_m, scenario.mergeCas, scenario.turnDuration_s);
  return { attacker: side(scenario.attacker), defender: side(scenario.defender) };
}

export interface Verdict {
  winner: Side | 'even';
  /** Absolute difference in the deciding metric. */
  margin: number;
}

/** Relative difference below which a metric is called even. */
export const EVEN_THRESHOLD = 0.02;

/** Compares a metric between the two sides. `higherIsBetter` false for radius-type metrics. */
export function compareMetric(
  attacker: number,
  defender: number,
  higherIsBetter: boolean,
): Verdict {
  const margin = Math.abs(attacker - defender);
  const scale = Math.max(Math.abs(attacker), Math.abs(defender));
  if (scale === 0 || margin / scale < EVEN_THRESHOLD) return { winner: 'even', margin };
  const attackerBetter = higherIsBetter ? attacker > defender : attacker < defender;
  return { winner: attackerBetter ? 'attacker' : 'defender', margin };
}

/** 1-circle (nose-to-nose) fights are won by the tighter radius, flown at full pull. */
export function oneCircleVerdict(m: Matchup): Verdict {
  return compareMetric(
    m.attacker.pull.summary.minRadius.value,
    m.defender.pull.summary.minRadius.value,
    false,
  );
}

/** 2-circle (nose-to-tail) fights are won by the higher sustained turn rate, as flown. */
export function twoCircleVerdict(m: Matchup): Verdict {
  return compareMetric(
    m.attacker.flown.summary.maxStr.value,
    m.defender.flown.summary.maxStr.value,
    true,
  );
}

/** Who has turned further after the scenario's turn duration, as flown from the merge. */
export function timelineVerdict(m: Matchup): Verdict {
  const heading = (r: SideResult) => r.flown.timeline.at(-1)?.heading ?? 0;
  return compareMetric(heading(m.attacker), heading(m.defender), true);
}

export interface DeltaPoint {
  cas: number;
  /** attacker − defender, deg/s; null where either aircraft cannot fly this speed. */
  itr: number | null;
  str: number | null;
}

/** Turn-rate advantage (attacker − defender) as flown, on a shared CAS grid. */
export function turnRateDelta(m: Matchup, altitude_m: number, points = 120): DeltaPoint[] {
  const a = m.attacker.flown;
  const d = m.defender.flown;
  const minCas = Math.min(a.curve[0]?.cas ?? 0, d.curve[0]?.cas ?? 0);
  const maxCas = Math.max(a.curve.at(-1)?.cas ?? 0, d.curve.at(-1)?.cas ?? 0);
  return Array.from({ length: points }, (_, i) => {
    const cas = minCas + ((maxCas - minCas) * i) / (points - 1);
    const tas = casToTas(cas, altitude_m);
    const inside = (f: Flight) =>
      tas >= f.summary.limits.stallTas && tas <= f.summary.limits.maxTas + 1e-6;
    if (!inside(a) || !inside(d)) return { cas, itr: null, str: null };
    const pa = pointPerformance(a.condition, tas);
    const pd = pointPerformance(d.condition, tas);
    return { cas, itr: pa.itr - pd.itr, str: pa.str - pd.str };
  });
}

/** CAS of a point on the flight's envelope curve (falls back to the TAS if not on the curve). */
export function casAtTas(f: Flight, tas: number): number {
  return f.curve.find((p) => p.tas === tas)?.cas ?? tas;
}

/** Energy retention: who has more airspeed left after the turn from the merge, as flown. */
export function energyVerdict(m: Matchup): Verdict {
  const speed = (r: SideResult) => r.flown.timeline.at(-1)?.cas ?? 0;
  return compareMetric(speed(m.attacker), speed(m.defender), true);
}
