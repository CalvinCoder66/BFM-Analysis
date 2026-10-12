import { axisTicks, backWalls, boxFrame, gridSpacing, panLimits } from './box';
import { type Point3, VIEWS } from './camera';

describe('box frame and distance scales', () => {
  const box = {
    spacing: 500,
    minX: -1_000,
    maxX: 500,
    minY: -500,
    maxY: 1_000,
    minZ: 0,
    maxZ: 1_500,
  };

  it('grids the walls behind the fight, whichever way the camera faces', () => {
    // The 3D view looks north-west from the south-east, so the west and north walls are behind.
    expect(backWalls(box, VIEWS['3d'])).toEqual({ x: -1_000, y: 1_000 });
    expect(backWalls(box, { yaw: 130, pitch: 30 })).toEqual({ x: 500, y: -500 });

    const { grid, edges } = boxFrame(box, VIEWS['3d']);
    const onBack = (p: Point3) => p.z === 0 || p.x === -1_000 || p.y === 1_000;
    for (const [a, b] of grid) {
      const sameFace =
        (a.z === 0 && b.z === 0) ||
        (a.x === -1_000 && b.x === -1_000) ||
        (a.y === 1_000 && b.y === 1_000);
      expect(onBack(a) && onBack(b) && sameFace).toBe(true);
    }
    expect(edges).toHaveLength(12);
  });

  it('divides the inside of the box into grid-step cubes without redrawing walls or edges', () => {
    const { lattice } = boxFrame(box, VIEWS['3d']);
    // 4 × 4 grid positions per direction. Leaving out the floor and the back wall leaves 3 × 3,
    // and one of those is a front edge of the box: 8 lines in each of the three directions.
    expect(lattice).toHaveLength(24);
    for (const [a, b] of lattice) {
      expect(a.z === 0 && b.z === 0).toBe(false);
      expect(a.x === -1_000 && b.x === -1_000).toBe(false);
      expect(a.y === 1_000 && b.y === 1_000).toBe(false);
    }
  });

  it('scales east and north along the near floor edges and height up a back corner', () => {
    const axes = axisTicks(box, VIEWS['3d']);
    const values = (axis: string) => axes.find((a) => a.axis === axis)?.ticks.map((t) => t.value);
    expect(values('x')).toEqual([-1_000, -500, 0, 500]);
    // North leaves its end corners to the east and height scales.
    expect(values('y')).toEqual([0, 500]);
    expect(values('z')).toEqual([0, 500, 1_000, 1_500]);
    const height = axes.find((a) => a.axis === 'z')?.ticks ?? [];
    for (const { at } of height) expect([at.x, at.y]).toEqual([500, 1_000]);
    for (const { at } of axes.find((a) => a.axis === 'x')?.ticks ?? []) expect(at.y).toBe(-500);
  });

  it('drops the scale that points at the camera', () => {
    expect(axisTicks(box, VIEWS.top).map((a) => a.axis)).toEqual(['x', 'y']);
    expect(axisTicks(box, VIEWS.side).map((a) => a.axis)).toEqual(['y', 'z']);
  });
});

describe('gridSpacing', () => {
  it('picks the first round length of at least a fifth of the size', () => {
    expect(gridSpacing(2_000)).toBe(500);
    expect(gridSpacing(2_600)).toBe(1_000);
    expect(gridSpacing(450)).toBe(100);
  });
});

describe('panLimits', () => {
  it('lets the camera look up to half the largest side past each wall', () => {
    const box = { spacing: 500, minX: 0, maxX: 2_000, minY: 0, maxY: 1_000, minZ: 0, maxZ: 500 };
    // Half of each side, plus half of the largest (2 000 m).
    expect(panLimits(box)).toEqual({ x: 2_000, y: 1_500, z: 1_250 });
  });
});
