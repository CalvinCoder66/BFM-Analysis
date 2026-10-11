/**
 * Merge geometry for the turn-circle view. Both jets pass head-on, left-to-left, with a small
 * lateral gap, then turn:
 * - 2-circle: both turn towards each other, so each flies its own circle (nose-to-tail rate
 *   fight). Each pilot flies as configured (smooth or yanking).
 * - 1-circle: the defender turns away, so both fly round the same circle and meet nose-to-nose
 *   (radius fight). Both pilots pull to the limiter.
 */
import type { TimelinePoint } from '../../physics/timeline';
import type { Matchup, Side } from '../comparison/matchup';

export type FightType = 'one-circle' | 'two-circle';

/** Lateral gap between the jets as they pass, metres. */
export const MERGE_SEPARATION_M = 400;

export interface TrackPoint {
  t: number;
  x: number;
  y: number;
  /** Ground-frame heading, degrees clockwise from north (+y). */
  heading: number;
  /** Total heading change since the merge, degrees. */
  turned: number;
  cas: number;
  g: number;
}

/** Places each side's turn timeline in a shared frame: attacker heads north, defender south. */
export function mergeTracks(m: Matchup, type: FightType): Record<Side, TrackPoint[]> {
  const flight = (side: Side) => (type === 'one-circle' ? m[side].pull : m[side].flown);
  const half = MERGE_SEPARATION_M / 2;
  const place = (
    points: TimelinePoint[],
    transform: (p: TimelinePoint) => Pick<TrackPoint, 'x' | 'y' | 'heading'>,
  ) => points.map((p) => ({ t: p.t, cas: p.cas, g: p.g, turned: p.heading, ...transform(p) }));

  // Timelines are in a local frame: entry heading +y, turning right (towards +x).
  const attacker = place(flight('attacker').timeline, (p) => ({
    x: -half + p.x,
    y: p.y,
    heading: p.heading,
  }));
  // The defender heads south. Turning right (towards the attacker) is a 180° rotation of the
  // local frame; turning left (away) mirrors it first.
  const defender = place(flight('defender').timeline, (p) =>
    type === 'two-circle'
      ? { x: half - p.x, y: -p.y, heading: 180 + p.heading }
      : { x: half + p.x, y: -p.y, heading: 180 - p.heading },
  );
  return { attacker, defender };
}

export interface Bounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

/** Square bounding box around every track point, with padding. */
export function trackBounds(tracks: Record<Side, TrackPoint[]>, padding = 0.08): Bounds {
  const points = [...tracks.attacker, ...tracks.defender];
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const size = Math.max(maxX - minX, maxY - minY, 1) * (1 + 2 * padding);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { minX: cx - size / 2, minY: cy - size / 2, width: size, height: size };
}

/** The first round scale-bar length (100, 200, 500, 1 000 m …) of at least a fifth of the view. */
export function scaleBarLength(viewSize: number): number {
  const target = viewSize / 5;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const step = [1, 2, 5, 10].find((s) => s * magnitude >= target) ?? 10;
  return step * magnitude;
}
