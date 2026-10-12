import { DEFAULT_FRAMING, orbit, project, screenAxes, VIEWS, ZOOM_LIMITS, zoomAt } from './camera';

describe('project', () => {
  const p = { x: 300, y: 500, z: 200 };

  it('looks straight down from the top: north up, east right', () => {
    const q = project(p, VIEWS.top);
    expect([q.x, q.y]).toEqual([expect.closeTo(300, 9), expect.closeTo(500, 9)]);
  });

  it('looks west from the east side: north right, height up', () => {
    const q = project(p, VIEWS.side);
    expect([q.x, q.y]).toEqual([expect.closeTo(500, 9), expect.closeTo(200, 9)]);
    // Points further west are further away.
    expect(project({ ...p, x: 200 }, VIEWS.side).depth).toBeGreaterThan(q.depth);
  });

  it('foreshortens height by cos(pitch)', () => {
    expect(project({ x: 0, y: 0, z: 100 }, { yaw: 40, pitch: 60 }).y).toBeCloseTo(50, 9);
  });
});

describe('orbit', () => {
  it('turns with sideways drags and tilts with vertical ones, between side-on and top-down', () => {
    expect(orbit({ yaw: 0, pitch: 30 }, 50, -25)).toEqual({ yaw: 20, pitch: 20 });
    expect(orbit({ yaw: 0, pitch: 80 }, 0, 100).pitch).toBe(90);
    expect(orbit({ yaw: 0, pitch: 10 }, 0, -100).pitch).toBe(0);
  });
});

describe('screenAxes', () => {
  it('gives the world directions that project to screen right and up', () => {
    for (const camera of [VIEWS['3d'], VIEWS.top, VIEWS.side, { yaw: 137, pitch: 71 }]) {
      const { right, up } = screenAxes(camera);
      const r = project(right, camera);
      const u = project(up, camera);
      expect([r.x, r.y, u.x, u.y]).toEqual([1, 0, 0, 1].map((v) => expect.closeTo(v, 9)));
    }
  });
});

describe('zoomAt', () => {
  it('moves the centre towards the point zoomed on, so it stays under the cursor', () => {
    // From the top, screen right is east and up is north. Doubling the zoom halves the view, so
    // the centre moves half-way to the point 100 m east and 50 m north of it.
    const zoomed = zoomAt(DEFAULT_FRAMING, VIEWS.top, 2, { x: 100, y: 50 });
    expect(zoomed.zoom).toBe(2);
    expect([zoomed.pan.x, zoomed.pan.y, zoomed.pan.z]).toEqual([
      expect.closeTo(50, 9),
      expect.closeTo(25, 9),
      expect.closeTo(0, 9),
    ]);
  });

  it('keeps the point under the cursor from any angle', () => {
    const camera = { yaw: 137, pitch: 71 };
    const before = { zoom: 1.5, pan: { x: 30, y: -40, z: 10 } };
    const offset = { x: -220, y: 140 };
    const { right, up } = screenAxes(camera);
    const point = {
      x: before.pan.x + right.x * offset.x + up.x * offset.y,
      y: before.pan.y + right.y * offset.x + up.y * offset.y,
      z: before.pan.z + right.z * offset.x + up.z * offset.y,
    };
    const after = zoomAt(before, camera, 3, offset);
    const p = project(point, camera);
    const c = project(after.pan, camera);
    // Three times the zoom: the point is a third as many metres from the centre, the same pixels.
    expect(p.x - c.x).toBeCloseTo(offset.x / 3, 9);
    expect(p.y - c.y).toBeCloseTo(offset.y / 3, 9);
  });

  it('stops at the zoom limits', () => {
    expect(zoomAt({ ...DEFAULT_FRAMING, zoom: 16 }, VIEWS.top, 2).zoom).toBe(ZOOM_LIMITS.max);
    expect(zoomAt(DEFAULT_FRAMING, VIEWS.top, 0.1).zoom).toBe(ZOOM_LIMITS.min);
    // Zooming about the centre never pans.
    expect(zoomAt(DEFAULT_FRAMING, VIEWS['3d'], 4).pan).toEqual({ x: 0, y: 0, z: 0 });
  });
});
