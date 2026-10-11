/**
 * Time history of a sustained hard turn from a given entry speed.
 *
 * Each step the jet pulls the most G its condition allows at the current speed (the G ceiling,
 * or less if lift-limited), turns at the circle-average rate for its turn plane and trades
 * energy at Ps: altitude is held, so dV/dt = g·Ps / V. Position is integrated in the turn plane.
 */
import { G0 } from './atmosphere';
import { type FlightCondition, pointPerformance, speedLimits, turnRate } from './performance';

export interface TimelinePoint {
  t: number;
  tas: number;
  cas: number;
  /** Load factor being pulled. */
  g: number;
  /** Turn rate, deg/s. */
  rate: number;
  /** Total heading change since entry, degrees. */
  heading: number;
  /** Position in the turn plane relative to the entry point, metres (entry heading = +y). */
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
  const points: TimelinePoint[] = [];
  let tas = entryTas;
  let heading = 0; // radians
  let x = 0;
  let y = 0;
  const steps = Math.round(duration_s / dt);
  for (let i = 0; i <= steps; i++) {
    const p = pointPerformance(cond, tas);
    const omega = turnRate(p.maxG, tas, cond.turnPlane);
    points.push({
      t: i * dt,
      tas,
      cas: p.cas,
      g: p.maxG,
      rate: (omega * 180) / Math.PI,
      heading: (heading * 180) / Math.PI,
      x,
      y,
    });
    if (i === steps) break;
    // Move along the mid-step heading at the mid-step speed so a steady turn stays on its circle.
    const nextTas = Math.max(tas + ((G0 * p.psAtMaxG) / tas) * dt, floor);
    const midHeading = heading + (omega * dt) / 2;
    const midTas = (tas + nextTas) / 2;
    x += midTas * Math.sin(midHeading) * dt;
    y += midTas * Math.cos(midHeading) * dt;
    heading += omega * dt;
    tas = nextTas;
  }
  return points;
}
