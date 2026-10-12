/**
 * Merge geometry for the turn-circle view, in 3D. Both jets pass head-on, left-to-left, with a
 * small lateral gap, then turn:
 * - 2-circle: both turn towards each other, so each flies its own circle (nose-to-tail rate
 *   fight). Each pilot flies as configured (smooth or yanking).
 * - 1-circle: the defender turns away, so both fly round the same circle and meet nose-to-nose
 *   (radius fight). Both pilots pull to the limiter.
 * Each jet turns in its own plane, tilted up from the horizontal by its turn-plane angle, so a
 * vertical loop stands upright and a level turn lies flat. The view is an orthographic projection
 * from an orbiting camera.
 */
import type { Matchup, Side } from '../comparison/matchup';
import { type Box, boxAround } from './box';
import type { Point3 } from './camera';

export type FightType = 'one-circle' | 'two-circle';

/** Lateral gap between the jets as they pass, metres. */
export const MERGE_SEPARATION_M = 400;

export interface TrackPoint extends Point3 {
  t: number;
  /** Total heading change round the turn plane since the merge, degrees. */
  turned: number;
  cas: number;
  g: number;
}

/** Places each side's turn in a shared 3D frame: attacker heads north, defender south. */
export function mergeTracks(m: Matchup, type: FightType): Record<Side, TrackPoint[]> {
  const half = MERGE_SEPARATION_M / 2;
  const place = (side: Side, toGround: (across: number, along: number) => [number, number]) => {
    const flight = type === 'one-circle' ? m[side].pull : m[side].flown;
    const { altitude_m, turnPlane } = flight.condition;
    // Timelines are in their turn plane: entry heading +y, turning right towards +x, which is
    // tilted up by the turn-plane angle. Split it into its horizontal and vertical parts.
    return flight.timeline.map((p): TrackPoint => {
      const [x, y] = toGround(p.x * Math.cos(turnPlane), p.y);
      return { t: p.t, x, y, z: p.altitude - altitude_m, turned: p.heading, cas: p.cas, g: p.g };
    });
  };
  return {
    attacker: place('attacker', (across, along) => [-half + across, along]),
    // The defender heads south. Turning right (towards the attacker) is a 180° rotation of the
    // local frame; turning left (away) mirrors it first.
    defender: place('defender', (across, along) =>
      type === 'two-circle' ? [half - across, -along] : [half + across, -along],
    ),
  };
}

export interface Scene {
  /** Centre of the box, which the camera orbits. */
  centre: Point3;
  /** Radius of a sphere containing the box, so the view fits from any angle. */
  radius: number;
  box: Box;
}

export function buildScene(tracks: Record<Side, TrackPoint[]>): Scene {
  const box = boxAround([...tracks.attacker, ...tracks.defender]);
  return {
    centre: {
      x: (box.minX + box.maxX) / 2,
      y: (box.minY + box.maxY) / 2,
      z: (box.minZ + box.maxZ) / 2,
    },
    radius: Math.hypot(box.maxX - box.minX, box.maxY - box.minY, box.maxZ - box.minZ) / 2,
    box,
  };
}
