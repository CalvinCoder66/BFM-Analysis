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

export type FightType = 'one-circle' | 'two-circle';

/** Lateral gap between the jets as they pass, metres. */
export const MERGE_SEPARATION_M = 400;

export interface Point3 {
  /** East of the merge, m. */
  x: number;
  /** North of the merge, m. */
  y: number;
  /** Height above the merge altitude, m. */
  z: number;
}

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

/** Orbiting camera, degrees. Yaw turns it round the vertical; pitch 0 = side-on, 90 = top-down. */
export interface Camera {
  yaw: number;
  pitch: number;
}

export const VIEWS = {
  '3d': { yaw: -50, pitch: 30 },
  top: { yaw: 0, pitch: 90 },
  /** From the east, looking west, so loops flown north or south are seen face-on. */
  side: { yaw: -90, pitch: 0 },
} satisfies Record<string, Camera>;

/** Orthographic projection: screen x right, screen y up, depth away from the camera. */
export function project(p: Point3, { yaw, pitch }: Camera) {
  const psi = (yaw * Math.PI) / 180;
  const phi = (pitch * Math.PI) / 180;
  const across = p.x * Math.cos(psi) - p.y * Math.sin(psi);
  const ahead = p.x * Math.sin(psi) + p.y * Math.cos(psi);
  return {
    x: across,
    y: p.z * Math.cos(phi) + ahead * Math.sin(phi),
    depth: ahead * Math.cos(phi) - p.z * Math.sin(phi),
  };
}

/**
 * Drag rotates the scene as if grabbed: sideways spins it round the vertical, down tilts it
 * towards top-down (pitch is held between side-on and top-down).
 */
export function orbit(camera: Camera, dx: number, dy: number, degPerPixel = 0.4): Camera {
  return {
    yaw: camera.yaw + dx * degPerPixel,
    pitch: Math.min(Math.max(camera.pitch + dy * degPerPixel, 0), 90),
  };
}

export interface Scene {
  /** Centre of the scene, which the camera orbits. */
  centre: Point3;
  /** Radius of a sphere containing the tracks and grid, so the view fits from any angle. */
  radius: number;
  /** Ground grid at the merge altitude. */
  grid: { spacing: number; minX: number; maxX: number; minY: number; maxY: number };
}

export function buildScene(tracks: Record<Side, TrackPoint[]>): Scene {
  const points = [...tracks.attacker, ...tracks.defender];
  const range = (pick: (p: Point3) => number) => {
    const values = [0, ...points.map(pick)];
    return [Math.min(...values), Math.max(...values)] as const;
  };
  const [minX, maxX] = range((p) => p.x);
  const [minY, maxY] = range((p) => p.y);
  const [minZ, maxZ] = range((p) => p.z);
  const spacing = gridSpacing(Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1));
  const grid = {
    spacing,
    minX: Math.floor(minX / spacing) * spacing,
    maxX: Math.ceil(maxX / spacing) * spacing,
    minY: Math.floor(minY / spacing) * spacing,
    maxY: Math.ceil(maxY / spacing) * spacing,
  };
  const lo = { x: grid.minX, y: grid.minY, z: minZ };
  const hi = { x: grid.maxX, y: grid.maxY, z: maxZ };
  return {
    centre: { x: (lo.x + hi.x) / 2, y: (lo.y + hi.y) / 2, z: (lo.z + hi.z) / 2 },
    radius: Math.hypot(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z) / 2,
    grid,
  };
}

/** The first round grid spacing (100, 200, 500, 1 000 m …) of at least a fifth of the size. */
export function gridSpacing(size: number): number {
  const target = size / 5;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const step = [1, 2, 5, 10].find((s) => s * magnitude >= target) ?? 10;
  return step * magnitude;
}
