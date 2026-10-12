/**
 * Orbiting orthographic camera for the 3D turn-circle view, in the shared frame: x east, y north,
 * z up, metres from the merge.
 */

export interface Point3 {
  /** East of the merge, m. */
  x: number;
  /** North of the merge, m. */
  y: number;
  /** Height above the merge altitude, m. */
  z: number;
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

/** World directions of the screen's right and up for this camera (unit vectors). */
export function screenAxes({ yaw, pitch }: Camera): { right: Point3; up: Point3 } {
  const psi = (yaw * Math.PI) / 180;
  const phi = (pitch * Math.PI) / 180;
  return {
    right: { x: Math.cos(psi), y: -Math.sin(psi), z: 0 },
    up: {
      x: Math.sin(psi) * Math.sin(phi),
      y: Math.cos(psi) * Math.sin(phi),
      z: Math.cos(phi),
    },
  };
}

/** How close the view is: `zoom` magnifies, `pan` moves the point the camera orbits, metres. */
export interface Framing {
  zoom: number;
  pan: Point3;
}

export const DEFAULT_FRAMING: Framing = { zoom: 1, pan: { x: 0, y: 0, z: 0 } };
export const ZOOM_LIMITS = { min: 0.5, max: 20 } as const;

/**
 * Zooms by `factor` about a point on screen, given as its offset from the view centre in metres
 * (screen axes, y up), keeping that point where it is. Zoom is held within ZOOM_LIMITS.
 */
export function zoomAt(
  framing: Framing,
  camera: Camera,
  factor: number,
  offset: { x: number; y: number } = { x: 0, y: 0 },
): Framing {
  const zoom = Math.min(Math.max(framing.zoom * factor, ZOOM_LIMITS.min), ZOOM_LIMITS.max);
  // The view shrinks by zoom / framing.zoom; moving the centre (1 − framing.zoom / zoom) of the
  // way towards the point keeps the point at the same place on screen.
  const k = 1 - framing.zoom / zoom;
  const { right, up } = screenAxes(camera);
  const { pan } = framing;
  return {
    zoom,
    pan: {
      x: pan.x + (right.x * offset.x + up.x * offset.y) * k,
      y: pan.y + (right.y * offset.x + up.y * offset.y) * k,
      z: pan.z + (right.z * offset.x + up.z * offset.y) * k,
    },
  };
}

/**
 * Moves the point the camera looks at by a drag of (dx, dy) screen metres (y up), so the scene
 * follows the cursor, keeping it within ±`limits` of the scene centre on each axis.
 */
export function panBy(
  framing: Framing,
  camera: Camera,
  dx: number,
  dy: number,
  limits: Point3,
): Framing {
  const { right, up } = screenAxes(camera);
  const { pan } = framing;
  return {
    ...framing,
    pan: clampPan(
      {
        x: pan.x - right.x * dx - up.x * dy,
        y: pan.y - right.y * dx - up.y * dy,
        z: pan.z - right.z * dx - up.z * dy,
      },
      limits,
    ),
  };
}

/** Holds a pan within ±limits on each axis. */
export function clampPan(pan: Point3, limits: Point3): Point3 {
  const clamp = (v: number, limit: number) => Math.min(Math.max(v, -limit), limit);
  return { x: clamp(pan.x, limits.x), y: clamp(pan.y, limits.y), z: clamp(pan.z, limits.z) };
}
