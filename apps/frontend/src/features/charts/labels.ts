/**
 * Places text labels next to the points they name so they keep clear of each other, the tracks
 * and the markers. Greedy: labels are placed in the order given (most important first), each at
 * the candidate spot round its anchor that collides least. Works in screen (SVG) coordinates,
 * y down, so it re-runs whenever the camera moves.
 */

export interface LabelRequest {
  id: string;
  /** Screen point the label names, e.g. a 5 s dot. */
  anchor: { x: number; y: number };
  text: string;
  /** Font size, screen units. */
  size: number;
  /** Space between the anchor and the nearest edge of the label. */
  gap: number;
}

/** A placed label's box: top-left corner and size. */
export interface PlacedLabel {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Obstacles {
  /** Points along lines to keep clear of (densely sampled tracks). */
  points?: readonly (readonly [number, number])[];
  /** Round markers to keep clear of: dots, the merge cross, arrowheads. */
  dots?: readonly { x: number; y: number; r: number }[];
  /** Visible area; labels spilling out of it are avoided. */
  view?: { x: number; y: number; width: number; height: number };
  /** Clear space kept round each label. */
  padding?: number;
}

/** Rough width of a character as a fraction of the font size (digits and lower case, sans). */
const CHAR_WIDTH = 0.6;

/** Directions round the anchor, in order of preference: above-right first, as labels read. */
const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, -1],
  [1, 0],
  [1, 1],
  [0, -1],
  [0, 1],
  [-1, -1],
  [-1, 0],
  [-1, 1],
];
/** Second ring of spots, further out, for when every close spot is taken. */
const FAR = 2.5;

const COST = {
  /** Per unit² of overlap with an already placed label. */
  labelOverlap: 10,
  /** Per track point inside the label. */
  trackPoint: 1,
  /** Per marker the label touches. */
  dot: 4,
  /** For spilling out of the view. */
  outOfView: 6,
  /** For using the far ring rather than the close one. */
  far: 0.75,
  /** Per step down the preference order, to break ties. */
  preference: 0.01,
} as const;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

/** Distance from a point to the nearest point of a rectangle (0 inside). */
const distanceTo = (r: Rect, x: number, y: number) =>
  Math.hypot(Math.max(r.x - x, 0, x - (r.x + r.width)), Math.max(r.y - y, 0, y - (r.y + r.height)));

/** Box for a label of this size on the given side of the anchor, `gap` away from it. */
function candidate(
  { anchor, gap }: LabelRequest,
  [dx, dy]: readonly [number, number],
  width: number,
  height: number,
): Rect {
  const x = dx > 0 ? anchor.x + gap : dx < 0 ? anchor.x - gap - width : anchor.x - width / 2;
  const y = dy > 0 ? anchor.y + gap : dy < 0 ? anchor.y - gap - height : anchor.y - height / 2;
  return { x, y, width, height };
}

export function placeLabels(requests: LabelRequest[], obstacles: Obstacles = {}): PlacedLabel[] {
  const { points = [], dots = [], view, padding = 0 } = obstacles;
  const placed: PlacedLabel[] = [];
  for (const request of requests) {
    const width = request.text.length * request.size * CHAR_WIDTH;
    const height = request.size;
    const spots = [1, FAR].flatMap((ring) =>
      DIRECTIONS.map((direction) => ({
        ring,
        rect: candidate({ ...request, gap: request.gap * ring }, direction, width, height),
      })),
    );
    let best = { cost: Number.POSITIVE_INFINITY, rect: spots[0]?.rect as Rect };
    spots.forEach(({ ring, rect }, i) => {
      const padded = {
        x: rect.x - padding,
        y: rect.y - padding,
        width: rect.width + 2 * padding,
        height: rect.height + 2 * padding,
      };
      let cost = i * COST.preference + (ring > 1 ? COST.far : 0);
      for (const other of placed) cost += overlap(padded, other) * COST.labelOverlap;
      for (const [x, y] of points) if (distanceTo(padded, x, y) === 0) cost += COST.trackPoint;
      for (const dot of dots) if (distanceTo(padded, dot.x, dot.y) < dot.r) cost += COST.dot;
      if (
        view &&
        (rect.x < view.x ||
          rect.y < view.y ||
          rect.x + rect.width > view.x + view.width ||
          rect.y + rect.height > view.y + view.height)
      ) {
        cost += COST.outOfView;
      }
      if (cost < best.cost) best = { cost, rect };
    });
    placed.push({ id: request.id, ...best.rect });
  }
  return placed;
}
