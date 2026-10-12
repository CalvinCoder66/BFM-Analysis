/**
 * Time history of a sustained hard turn from a given entry speed.
 *
 * Each step the jet pulls the most G its condition allows at the current speed (the G ceiling,
 * or less if lift-limited) and trades energy at Ps. The turn starts level, at the bottom of its
 * turn plane, and pulls up through it. With the plane inclined θ and the jet turned φ round it,
 * the flight path angle γ satisfies sin γ = sin θ · sin φ, so
 *   dV/dt = g·Ps / V − g·sin θ · sin φ        (gravity slows the climb and speeds the dive)
 *   V·dφ/dt = g·√(n² − cos²θ) − g·sin θ · cos φ (gravity hurts at the bottom, helps over the top)
 * In a level turn (θ = 0) altitude is held and only Ps changes the speed. Altitude follows the
 * plane, and the air (density, thrust, CAS) is evaluated at the current altitude.
 * Position is integrated in the turn plane.
 */
import { G0, isa, tasToCas } from './atmosphere';
import { type FlightCondition, pointPerformance, speedLimits, turnRate } from './performance';

export interface TimelinePoint {
  t: number;
  tas: number;
  cas: number;
  /** Altitude, m. Changes only in an inclined turn plane. */
  altitude: number;
  /**
   * CAS the jet would have at the entry altitude with the same total energy (height traded back
   * for speed). Equals `cas` in a level turn; compares energy fairly when one jet is higher.
   */
  energyCas: number;
  /** Load factor being pulled. */
  g: number;
  /** Turn rate, deg/s. */
  rate: number;
  /** Total heading change round the turn plane since entry, degrees. */
  heading: number;
  /**
   * Position in the turn plane relative to the entry point, metres (entry heading = +y, turning
   * towards +x, which is uphill in an inclined plane).
   */
  x: number;
  y: number;
}

export function simulateTurn(
  cond: FlightCondition,
  entryTas: number,
  duration_s: number,
  dt = 0.1,
): TimelinePoint[] {
  const floor = speedLimits(cond).stallTas * 0.9;
  const sinPlane = Math.sin(cond.turnPlane);
  const points: TimelinePoint[] = [];
  let tas = entryTas;
  let heading = 0; // radians
  let x = 0;
  let y = 0;
  const steps = Math.round(duration_s / dt);
  for (let i = 0; i <= steps; i++) {
    const altitude = cond.altitude_m + x * sinPlane;
    const p = pointPerformance({ ...cond, altitude_m: altitude, atmosphere: isa(altitude) }, tas);
    const omega = turnRate(p.maxG, tas, cond.turnPlane) - (G0 * sinPlane * Math.cos(heading)) / tas;
    // Energy height relative to entry, traded back into speed at the entry altitude.
    const energy = altitude - cond.altitude_m + tas ** 2 / (2 * G0);
    points.push({
      t: i * dt,
      tas,
      cas: p.cas,
      altitude,
      energyCas: tasToCas(Math.sqrt(2 * G0 * Math.max(energy, 0)), cond.altitude_m),
      g: p.maxG,
      rate: (omega * 180) / Math.PI,
      heading: (heading * 180) / Math.PI,
      x,
      y,
    });
    if (i === steps) break;
    // Move along the mid-step heading at the mid-step speed so a steady turn stays on its circle.
    const accel = (G0 * p.psAtMaxG) / tas - G0 * sinPlane * Math.sin(heading + (omega * dt) / 2);
    const nextTas = Math.max(tas + accel * dt, floor);
    const midHeading = heading + (omega * dt) / 2;
    const midTas = (tas + nextTas) / 2;
    x += midTas * Math.sin(midHeading) * dt;
    y += midTas * Math.cos(midHeading) * dt;
    heading += omega * dt;
    tas = nextTas;
  }
  return points;
}
