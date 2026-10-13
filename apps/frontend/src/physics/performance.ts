/**
 * Quasi-steady point-performance model for turns.
 *
 * Drag polar: CD = (CD0 + ΔCD0_stores) + k·CL², with CL = n·W / (q·S).
 * Specific excess power Ps = V·(T − D) / W.
 *
 * Turns happen in a plane inclined θ from the horizontal (0° = level turn, 90° = vertical loop).
 * Lift must cancel the out-of-plane part of gravity, g·cos θ, leaving g·√(n² − cos²θ) to turn.
 * The in-plane part of gravity, g·sin θ, helps over the top and hurts at the bottom, and slows the
 * jet as it climbs; the point performance here reports the circle average at constant speed,
 * ω = g·√(n² − cos²θ) / V (the level-turn formula when θ = 0), with radius r = V / ω.
 * `timeline.ts` flies the turn with gravity applied round the circle.
 *
 * Everything is SI internally; turn rates are returned in deg/s for convenience because every
 * consumer (charts, cards) displays them that way.
 */

import type { Aircraft } from '../data/aircraft-schema';
import { type Atmosphere, casToTas, G0, isa, tasToCas } from './atmosphere';
import { interp1, interp2 } from './interpolate';
import { degToRad, radToDeg } from './units';

export interface Configuration {
  altitude_m: number;
  /** Internal fuel as a fraction of capacity, 0–1. */
  fuelFraction: number;
  loadoutId: string;
  /** A custom store load (from the pylon-slot editor), used instead of the loadout. */
  customLoad?: { mass_kg: number; cd0Delta: number };
  /** G the pilot chooses to fly at (smooth flying), capped by the instructor. Omit to pull to the limit. */
  pilotG?: number | null;
  /** Turn-plane inclination, degrees: 0 = level turn, 90 = vertical loop. Defaults to 0. */
  turnPlane_deg?: number;
}

export interface GLimits {
  /** Load factor at which the wings fail at the current weight. */
  wingBreak: number;
  /** Highest G the Realistic Battles instructor allows (and the fly-by-wire limit, if any). */
  instructor: number;
}

export interface FlightCondition {
  aircraft: Aircraft;
  altitude_m: number;
  mass_kg: number;
  weight_N: number;
  cd0Delta: number;
  atmosphere: Atmosphere;
  gLimits: GLimits;
  /** G ceiling for this condition: the instructor's, or the pilot's chosen G if lower. */
  gLimit: number;
  /** Turn-plane inclination, radians. */
  turnPlane: number;
}

export function gLimitsFor(aircraft: Aircraft, weight_N: number): GLimits {
  const { wingBreakLoad_N, fcs, instructorFraction } = aircraft.gLimits;
  const wingBreak = wingBreakLoad_N / weight_N;
  const fbw = fcs ?? Number.POSITIVE_INFINITY;
  return {
    wingBreak,
    instructor: Math.min(fbw, wingBreak * instructorFraction),
  };
}

export interface PointPerformance {
  tas: number;
  cas: number;
  mach: number;
  /** Load factor the wing can generate at CLmax. */
  liftLimitG: number;
  /** Available load factor: min(lift limit, condition G limit). */
  maxG: number;
  /** What caps maxG: CLmax, or the G limit (instructor or pilot). */
  limitedBy: 'lift' | 'g-limit';
  /** Instantaneous turn rate at max available G, deg/s (circle average in an inclined plane). */
  itr: number;
  /** Turn radius at max available G, m. */
  itrRadius: number;
  thrust_N: number;
  /** Load factor at which thrust = drag (capped at maxG); < 1 means level flight not sustainable. */
  sustainedG: number;
  /** Sustained turn rate, deg/s (0 when no sustained turn is possible). */
  str: number;
  /** Turn radius at sustained G, m (Infinity when no sustained turn is possible). */
  strRadius: number;
  /** Ps in wings-level 1 g flight, m/s. */
  psAt1g: number;
  /** Ps while pulling max available G (energy bleed rate), m/s. */
  psAtMaxG: number;
}

export function resolveCondition(aircraft: Aircraft, config: Configuration): FlightCondition {
  const loadout = config.customLoad ?? aircraft.loadouts.find((l) => l.id === config.loadoutId);
  if (!loadout) throw new Error(`Unknown loadout "${config.loadoutId}" for ${aircraft.id}`);
  const fuelFraction = Math.min(Math.max(config.fuelFraction, 0), 1);
  const mass_kg = aircraft.emptyMass_kg + fuelFraction * aircraft.internalFuel_kg + loadout.mass_kg;
  const weight_N = mass_kg * G0;
  const gLimits = gLimitsFor(aircraft, weight_N);
  return {
    aircraft,
    altitude_m: config.altitude_m,
    mass_kg,
    weight_N,
    cd0Delta: loadout.cd0Delta,
    atmosphere: isa(config.altitude_m),
    gLimits,
    gLimit: Math.min(gLimits.instructor, config.pilotG ?? Number.POSITIVE_INFINITY),
    turnPlane: degToRad(config.turnPlane_deg ?? 0),
  };
}

/** Circle-average turn rate in rad/s for load factor n at true airspeed v in a plane inclined θ. */
export function turnRate(n: number, v: number, plane = 0): number {
  const cos = Math.cos(plane);
  return n > cos ? (G0 * Math.sqrt(n * n - cos * cos)) / v : 0;
}

/** Circle-average turn radius in metres (V / ω). */
export function turnRadius(n: number, v: number, plane = 0): number {
  const omega = turnRate(n, v, plane);
  return omega > 0 ? v / omega : Number.POSITIVE_INFINITY;
}

function aeroAt(cond: FlightCondition, mach: number) {
  const { aero } = cond.aircraft;
  return {
    clMax: interp1(aero.mach, aero.clMax, mach),
    cd0: interp1(aero.mach, aero.cd0, mach) + cond.cd0Delta,
    k: interp1(aero.mach, aero.k, mach),
  };
}

export function thrustAt(aircraft: Aircraft, altitude_m: number, mach: number): number {
  const { altitude_m: alts, mach: machs, afterburner_N } = aircraft.thrust;
  return interp2(alts, machs, afterburner_N, altitude_m, mach);
}

/** Solves V = √(2·n·W / (ρ·S·CLmax(M))) for V, where CLmax depends on Mach. */
function speedForLiftLimit(cond: FlightCondition, n: number): number {
  const { density, speedOfSound } = cond.atmosphere;
  const s = cond.aircraft.wingArea_m2;
  let v = 100;
  for (let i = 0; i < 30; i++) {
    const { clMax } = aeroAt(cond, v / speedOfSound);
    v = Math.sqrt((2 * n * cond.weight_N) / (density * s * clMax));
  }
  return v;
}

export function pointPerformance(cond: FlightCondition, tas: number): PointPerformance {
  const { density, speedOfSound } = cond.atmosphere;
  const { wingArea_m2: s } = cond.aircraft;
  const { gLimit, turnPlane } = cond;
  const w = cond.weight_N;
  const mach = tas / speedOfSound;
  const q = 0.5 * density * tas * tas;
  const qs = q * s;
  const { clMax, cd0, k } = aeroAt(cond, mach);

  const liftLimitG = (qs * clMax) / w;
  const maxG = Math.min(liftLimitG, gLimit);
  const thrust = thrustAt(cond.aircraft, cond.altitude_m, mach);
  const drag = (n: number) => qs * cd0 + (k * n * n * w * w) / qs;
  const ps = (n: number) => (tas * (thrust - drag(n))) / w;

  const nSq = ((thrust - qs * cd0) * qs) / (k * w * w);
  const sustainedG = Math.min(Math.sqrt(Math.max(nSq, 0)), maxG);

  return {
    tas,
    cas: tasToCas(tas, cond.altitude_m),
    mach,
    liftLimitG,
    maxG,
    limitedBy: liftLimitG < gLimit ? 'lift' : 'g-limit',
    itr: radToDeg(turnRate(maxG, tas, turnPlane)),
    itrRadius: turnRadius(maxG, tas, turnPlane),
    thrust_N: thrust,
    sustainedG,
    str: radToDeg(turnRate(sustainedG, tas, turnPlane)),
    strRadius: turnRadius(sustainedG, tas, turnPlane),
    psAt1g: ps(1),
    psAtMaxG: ps(maxG),
  };
}

/**
 * Turn rate (deg/s) at which Ps equals `ps` at the given speed, or null if that point lies
 * outside the flight envelope (below 1 g or above the available G).
 */
export function turnRateAtPs(cond: FlightCondition, tas: number, ps: number): number | null {
  const { density, speedOfSound } = cond.atmosphere;
  const w = cond.weight_N;
  const mach = tas / speedOfSound;
  const qs = 0.5 * density * tas * tas * cond.aircraft.wingArea_m2;
  const { clMax, cd0, k } = aeroAt(cond, mach);
  const thrust = thrustAt(cond.aircraft, cond.altitude_m, mach);
  const nSq = ((thrust - qs * cd0 - (ps * w) / tas) * qs) / (k * w * w);
  const maxG = Math.min((qs * clMax) / w, cond.gLimit);
  if (nSq < 1 || Math.sqrt(nSq) > maxG + 1e-9) return null;
  return radToDeg(turnRate(Math.sqrt(nSq), tas, cond.turnPlane));
}

export interface SpeedLimits {
  /** 1 g stall speed (TAS). */
  stallTas: number;
  /** Placard limit (TAS): lower of max IAS and max Mach. */
  maxTas: number;
  /** Corner speed (TAS) where lift limit meets the G limit, or null if beyond maxTas. */
  cornerTas: number | null;
}

export function speedLimits(cond: FlightCondition): SpeedLimits {
  const { maxIas_kmh, maxMach } = cond.aircraft;
  const maxTas = Math.min(
    casToTas(maxIas_kmh / 3.6, cond.altitude_m),
    maxMach * cond.atmosphere.speedOfSound,
  );
  const corner = speedForLiftLimit(cond, cond.gLimit);
  return {
    stallTas: speedForLiftLimit(cond, 1),
    maxTas,
    cornerTas: corner <= maxTas ? corner : null,
  };
}

/** Point performance across the speed envelope, stall → placard limit, including corner speed. */
export function envelope(cond: FlightCondition, points = 150): PointPerformance[] {
  const { stallTas, maxTas, cornerTas } = speedLimits(cond);
  if (stallTas >= maxTas) return [];
  const speeds = Array.from(
    { length: points },
    (_, i) => stallTas + ((maxTas - stallTas) * i) / (points - 1),
  );
  if (cornerTas !== null) speeds.push(cornerTas);
  speeds.sort((a, b) => a - b);
  return speeds.map((v) => pointPerformance(cond, v));
}

export interface PerformanceSummary {
  mass_kg: number;
  wingLoading_kgm2: number;
  /** Sea-level static afterburner thrust / weight. */
  thrustToWeight: number;
  limits: SpeedLimits;
  maxItr: { value: number; tas: number };
  maxStr: { value: number; tas: number };
  minRadius: { value: number; tas: number };
}

export function summarise(cond: FlightCondition, curve = envelope(cond)): PerformanceSummary {
  const best = (pick: (p: PointPerformance) => number, mode: 'max' | 'min') =>
    curve.reduce<{ value: number; tas: number }>(
      (acc, p) => {
        const value = pick(p);
        return (mode === 'max' ? value > acc.value : value < acc.value)
          ? { value, tas: p.tas }
          : acc;
      },
      { value: mode === 'max' ? 0 : Number.POSITIVE_INFINITY, tas: 0 },
    );
  return {
    mass_kg: cond.mass_kg,
    wingLoading_kgm2: cond.mass_kg / cond.aircraft.wingArea_m2,
    thrustToWeight: thrustAt(cond.aircraft, 0, 0) / cond.weight_N,
    limits: speedLimits(cond),
    maxItr: best((p) => p.itr, 'max'),
    maxStr: best((p) => p.str, 'max'),
    minRadius: best((p) => p.itrRadius, 'min'),
  };
}
