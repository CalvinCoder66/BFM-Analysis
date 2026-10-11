import { getAircraft } from '../../data/aircraft';
import type { Aircraft, Loadout } from '../../data/aircraft-schema';
import { casToTas } from '../../physics/atmosphere';
import {
  envelope,
  type FlightCondition,
  type PerformanceSummary,
  type PointPerformance,
  pointPerformance,
  resolveCondition,
  summarise,
} from '../../physics/performance';

export type Side = 'attacker' | 'defender';
export const SIDES: readonly Side[] = ['attacker', 'defender'];

export interface SideConfig {
  aircraftId: string;
  /** 0–1 */
  fuelFraction: number;
  loadoutId: string;
}

export interface Scenario {
  altitude_m: number;
  /** Merge speed as calibrated airspeed (≈ IAS), m/s. */
  mergeCas: number;
  attacker: SideConfig;
  defender: SideConfig;
}

export interface SideResult {
  aircraft: Aircraft;
  loadout: Loadout;
  condition: FlightCondition;
  curve: PointPerformance[];
  summary: PerformanceSummary;
  /** Performance at the merge speed, or null if the merge speed is outside this jet's envelope. */
  atMerge: PointPerformance | null;
}

export type Matchup = Record<Side, SideResult>;

export function computeSide(config: SideConfig, altitude_m: number, mergeCas: number): SideResult {
  const aircraft = getAircraft(config.aircraftId);
  const loadout = aircraft.loadouts.find((l) => l.id === config.loadoutId) ?? aircraft.loadouts[0];
  if (!loadout) throw new Error(`${aircraft.id} has no loadouts`);
  const condition = resolveCondition(aircraft, {
    altitude_m,
    fuelFraction: config.fuelFraction,
    loadoutId: loadout.id,
  });
  const curve = envelope(condition);
  const summary = summarise(condition, curve);
  const mergeTas = casToTas(mergeCas, altitude_m);
  const inEnvelope =
    mergeTas >= summary.limits.stallTas && mergeTas <= summary.limits.maxTas + 1e-6;
  return {
    aircraft,
    loadout,
    condition,
    curve,
    summary,
    atMerge: inEnvelope ? pointPerformance(condition, mergeTas) : null,
  };
}

export function computeMatchup(scenario: Scenario): Matchup {
  return {
    attacker: computeSide(scenario.attacker, scenario.altitude_m, scenario.mergeCas),
    defender: computeSide(scenario.defender, scenario.altitude_m, scenario.mergeCas),
  };
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

/** 1-circle (nose-to-nose) fights are won by the tighter minimum turn radius. */
export function oneCircleVerdict(m: Matchup): Verdict {
  return compareMetric(
    m.attacker.summary.minRadius.value,
    m.defender.summary.minRadius.value,
    false,
  );
}

/** 2-circle (nose-to-tail) fights are won by the higher sustained turn rate. */
export function twoCircleVerdict(m: Matchup): Verdict {
  return compareMetric(m.attacker.summary.maxStr.value, m.defender.summary.maxStr.value, true);
}

export interface DeltaPoint {
  cas: number;
  /** attacker − defender, deg/s; null where either aircraft cannot fly this speed. */
  itr: number | null;
  str: number | null;
}

/** Turn-rate advantage (attacker − defender) on a shared CAS grid. */
export function turnRateDelta(m: Matchup, altitude_m: number, points = 120): DeltaPoint[] {
  const a = m.attacker;
  const d = m.defender;
  const minCas = Math.min(a.curve[0]?.cas ?? 0, d.curve[0]?.cas ?? 0);
  const maxCas = Math.max(a.curve.at(-1)?.cas ?? 0, d.curve.at(-1)?.cas ?? 0);
  return Array.from({ length: points }, (_, i) => {
    const cas = minCas + ((maxCas - minCas) * i) / (points - 1);
    const tas = casToTas(cas, altitude_m);
    const inside = (r: SideResult) =>
      tas >= r.summary.limits.stallTas && tas <= r.summary.limits.maxTas + 1e-6;
    if (!inside(a) || !inside(d)) return { cas, itr: null, str: null };
    const pa = pointPerformance(a.condition, tas);
    const pd = pointPerformance(d.condition, tas);
    return { cas, itr: pa.itr - pd.itr, str: pa.str - pd.str };
  });
}

/** CAS of a point on the side's envelope curve (falls back to the TAS if not on the curve). */
export function casAtTas(r: SideResult, tas: number): number {
  return r.curve.find((p) => p.tas === tas)?.cas ?? tas;
}
