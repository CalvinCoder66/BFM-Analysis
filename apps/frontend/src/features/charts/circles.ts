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

/** Axis-aligned box round the scene, its sides on multiples of the grid spacing. */
export interface Box {
  spacing: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  /** Floor of the box: the merge height unless a jet ends up below it. */
  minZ: number;
  maxZ: number;
}

export interface Scene {
  /** Centre of the box, which the camera orbits. */
  centre: Point3;
  /** Radius of a sphere containing the box, so the view fits from any angle. */
  radius: number;
  box: Box;
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
  const down = (v: number) => Math.floor(v / spacing) * spacing;
  const up = (v: number) => Math.ceil(v / spacing) * spacing;
  const box = {
    spacing,
    minX: down(minX),
    maxX: up(maxX),
    minY: down(minY),
    maxY: up(maxY),
    minZ: down(minZ),
    // At least one grid step tall, so a level fight still has a height scale.
    maxZ: Math.max(up(maxZ), spacing),
  };
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

export type Segment = [Point3, Point3];

/** Grid steps from min to max inclusive. */
const steps = (min: number, max: number, spacing: number) =>
  Array.from({ length: Math.round((max - min) / spacing) + 1 }, (_, i) => min + i * spacing);

/** The walls of the box furthest from the camera, so they sit behind the tracks. */
export function backWalls(box: Box, camera: Camera) {
  const depth = (p: Point3) => project(p, camera).depth;
  const mid = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2, z: box.minZ };
  return {
    x: depth({ ...mid, x: box.minX }) >= depth({ ...mid, x: box.maxX }) ? box.minX : box.maxX,
    y: depth({ ...mid, y: box.minY }) >= depth({ ...mid, y: box.maxY }) ? box.minY : box.maxY,
  };
}

/** Gridded floor and back walls, and the box's twelve edges. */
export function boxFrame(box: Box, camera: Camera): { grid: Segment[]; edges: Segment[] } {
  const { spacing, minX, maxX, minY, maxY, minZ, maxZ } = box;
  const wall = backWalls(box, camera);
  const xs = steps(minX, maxX, spacing);
  const ys = steps(minY, maxY, spacing);
  const zs = steps(minZ, maxZ, spacing);
  const grid: Segment[] = [
    // Floor
    ...xs.map(
      (x): Segment => [
        { x, y: minY, z: minZ },
        { x, y: maxY, z: minZ },
      ],
    ),
    ...ys.map(
      (y): Segment => [
        { x: minX, y, z: minZ },
        { x: maxX, y, z: minZ },
      ],
    ),
    // Back wall facing east or west
    ...ys.map(
      (y): Segment => [
        { x: wall.x, y, z: minZ },
        { x: wall.x, y, z: maxZ },
      ],
    ),
    ...zs.map(
      (z): Segment => [
        { x: wall.x, y: minY, z },
        { x: wall.x, y: maxY, z },
      ],
    ),
    // Back wall facing north or south
    ...xs.map(
      (x): Segment => [
        { x, y: wall.y, z: minZ },
        { x, y: wall.y, z: maxZ },
      ],
    ),
    ...zs.map(
      (z): Segment => [
        { x: minX, y: wall.y, z },
        { x: maxX, y: wall.y, z },
      ],
    ),
  ];
  const corners = [minX, maxX].flatMap((x) =>
    [minY, maxY].flatMap((y) => [minZ, maxZ].map((z) => ({ x, y, z }))),
  );
  const edges = corners.flatMap((a, i) =>
    corners
      .slice(i + 1)
      .filter((b) => [a.x === b.x, a.y === b.y, a.z === b.z].filter(Boolean).length === 2)
      .map((b): Segment => [a, b]),
  );
  return { grid, edges };
}

export interface AxisTicks {
  axis: 'x' | 'y' | 'z';
  title: string;
  ticks: { at: Point3; value: number }[];
  /** Where the axis title goes, at the middle of the labelled edge. */
  middle: Point3;
  /** Screen direction (y up) from the box towards the labelled edge, to push labels outward. */
  out: { x: number; y: number };
}

/**
 * Distance scales along three box edges: east and north along the near edges of the floor,
 * height up the corner where a back wall meets the near side. Axes seen end-on are left out.
 */
export function axisTicks(box: Box, camera: Camera): AxisTicks[] {
  const { spacing, minX, maxX, minY, maxY, minZ, maxZ } = box;
  const wall = backWalls(box, camera);
  const nearX = wall.x === minX ? maxX : minX;
  const nearY = wall.y === minY ? maxY : minY;
  const origin = project({ x: 0, y: 0, z: 0 }, camera);
  const middleOfBox = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 };
  const centre = project(middleOfBox, camera);
  const axes = [
    {
      axis: 'x' as const,
      title: 'East (m)',
      unit: { x: 1, y: 0, z: 0 },
      ticks: steps(minX, maxX, spacing).map((v) => ({ at: { x: v, y: nearY, z: minZ }, value: v })),
    },
    {
      axis: 'y' as const,
      title: 'North (m)',
      unit: { x: 0, y: 1, z: 0 },
      // Its two end corners belong to the east scale and the height scale, so leave them out.
      ticks: steps(minY, maxY, spacing)
        .filter((v) => v !== wall.y && v !== nearY)
        .map((v) => ({ at: { x: nearX, y: v, z: minZ }, value: v })),
    },
    {
      axis: 'z' as const,
      title: 'Height (m)',
      unit: { x: 0, y: 0, z: 1 },
      ticks: steps(minZ, maxZ, spacing).map((v) => ({
        at: { x: nearX, y: wall.y, z: v },
        value: v,
      })),
    },
  ];
  return axes
    .filter(({ unit }) => {
      const p = project(unit, camera);
      return Math.hypot(p.x - origin.x, p.y - origin.y) > 0.25;
    })
    .map(({ unit: _, ...axis }) => {
      const first = axis.ticks[0]?.at ?? middleOfBox;
      const last = axis.ticks.at(-1)?.at ?? middleOfBox;
      const middle = {
        x: (first.x + last.x) / 2,
        y: (first.y + last.y) / 2,
        z: (first.z + last.z) / 2,
      };
      const m = project(middle, camera);
      const length = Math.hypot(m.x - centre.x, m.y - centre.y);
      const out =
        length > 1e-6
          ? { x: (m.x - centre.x) / length, y: (m.y - centre.y) / length }
          : { x: 0, y: -1 };
      return { ...axis, middle, out };
    });
}

/** The first round grid spacing (100, 200, 500, 1 000 m …) of at least a fifth of the size. */
export function gridSpacing(size: number): number {
  const target = size / 5;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const step = [1, 2, 5, 10].find((s) => s * magnitude >= target) ?? 10;
  return step * magnitude;
}
