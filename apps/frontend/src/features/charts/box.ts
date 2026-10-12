/**
 * The box drawn round the 3D turn circles: its size, the gridded floor and back walls, the faint
 * lattice through the inside, its edges and the distance scales. Pure geometry; `SceneBox.tsx`
 * draws it, and its colours and line weights live there.
 */
import { type Camera, type Point3, project } from './camera';

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

/** Smallest box on grid steps round the points and the merge, at least one grid step tall. */
export function boxAround(points: Point3[]): Box {
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
  return {
    spacing,
    minX: down(minX),
    maxX: up(maxX),
    minY: down(minY),
    maxY: up(maxY),
    minZ: down(minZ),
    // At least one grid step tall, so a level fight still has a height scale.
    maxZ: Math.max(up(maxZ), spacing),
  };
}

/**
 * How far the camera may be panned from the centre of the box on each axis: to the box's walls
 * plus half its largest side, so there is room to look past the edges without losing the fight.
 */
export function panLimits(box: Box): Point3 {
  const sizes = { x: box.maxX - box.minX, y: box.maxY - box.minY, z: box.maxZ - box.minZ };
  const slack = Math.max(sizes.x, sizes.y, sizes.z) / 2;
  return { x: sizes.x / 2 + slack, y: sizes.y / 2 + slack, z: sizes.z / 2 + slack };
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

/**
 * Gridded floor and back walls, the box's twelve edges, and the lattice of lines through the
 * inside that divides it into grid-step cubes (leaving out lines already on the walls or edges).
 */
export function boxFrame(
  box: Box,
  camera: Camera,
): { grid: Segment[]; edges: Segment[]; lattice: Segment[] } {
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
  const isEnd = (v: number, min: number, max: number) => v === min || v === max;
  const lattice: Segment[] = [
    // Along east–west, at each (north, height)
    ...ys.flatMap((y) =>
      zs
        .filter((z) => z !== minZ && y !== wall.y && !(isEnd(y, minY, maxY) && z === maxZ))
        .map(
          (z): Segment => [
            { x: minX, y, z },
            { x: maxX, y, z },
          ],
        ),
    ),
    // Along north–south, at each (east, height)
    ...xs.flatMap((x) =>
      zs
        .filter((z) => z !== minZ && x !== wall.x && !(isEnd(x, minX, maxX) && z === maxZ))
        .map(
          (z): Segment => [
            { x, y: minY, z },
            { x, y: maxY, z },
          ],
        ),
    ),
    // Vertical, at each (east, north)
    ...xs.flatMap((x) =>
      ys
        .filter(
          (y) => x !== wall.x && y !== wall.y && !(isEnd(x, minX, maxX) && isEnd(y, minY, maxY)),
        )
        .map(
          (y): Segment => [
            { x, y, z: minZ },
            { x, y, z: maxZ },
          ],
        ),
    ),
  ];
  return { grid, edges, lattice };
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
