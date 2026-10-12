import { sideConfig, testScenario } from '../../test/scenarios';
import { computeMatchup } from '../comparison/matchup';
import {
  axisTicks,
  backWalls,
  boxFrame,
  buildScene,
  gridSpacing,
  MERGE_SEPARATION_M,
  mergeTracks,
  orbit,
  type Point3,
  project,
  VIEWS,
} from './circles';

const matchup = computeMatchup(
  testScenario({ attacker: sideConfig('f-16c', { pilotG: 6 }), turnDuration_s: 10 }),
);

describe('mergeTracks', () => {
  it('starts both jets either side of the merge, heading in opposite directions', () => {
    const { attacker, defender } = mergeTracks(matchup, 'two-circle');
    expect([attacker[0]?.x, attacker[0]?.y, attacker[0]?.z]).toEqual([-200, 0, 0]);
    expect(defender[0]?.x).toBe(MERGE_SEPARATION_M / 2);
    expect(defender[0]?.y).toBeCloseTo(0, 9);
    // First second: attacker flies north, defender south.
    expect(attacker[10]?.y).toBeGreaterThan(100);
    expect(defender[10]?.y).toBeLessThan(-100);
  });

  it('turns both jets towards each other in a 2-circle fight', () => {
    const { attacker, defender } = mergeTracks(matchup, 'two-circle');
    // Attacker turns right (east, +x); defender heading south turns right (west, −x).
    expect(attacker[30]?.x).toBeGreaterThan(-MERGE_SEPARATION_M / 2);
    expect(defender[30]?.x).toBeLessThan(MERGE_SEPARATION_M / 2);
  });

  it('turns the defender away in a 1-circle fight so both circle the same side', () => {
    const { attacker, defender } = mergeTracks(matchup, 'one-circle');
    expect(attacker[30]?.x).toBeGreaterThan(-MERGE_SEPARATION_M / 2);
    expect(defender[30]?.x).toBeGreaterThan(MERGE_SEPARATION_M / 2);
  });

  it('flies the 2-circle fight as the pilot does and the 1-circle fight at full pull', () => {
    const two = mergeTracks(matchup, 'two-circle').attacker;
    const one = mergeTracks(matchup, 'one-circle').attacker;
    expect(two[1]?.g).toBeCloseTo(6, 9);
    expect(one[1]?.g).toBeGreaterThan(6);
    expect(two.at(-1)?.turned).toBeCloseTo(matchup.attacker.flown.timeline.at(-1)?.heading ?? 0, 9);
    expect(one.at(-1)?.turned).toBeCloseTo(matchup.attacker.pull.timeline.at(-1)?.heading ?? 0, 9);
  });

  it('stands a vertical loop upright and tilts an oblique turn', () => {
    const tilted = (turnPlane_deg: number) =>
      mergeTracks(
        computeMatchup(testScenario({ attacker: sideConfig('f-16c', { turnPlane_deg }) })),
        'two-circle',
      ).attacker;
    const loop = tilted(90);
    // The loop stays in the north–up plane through the attacker's merge position.
    for (const p of loop) expect(p.x).toBeCloseTo(-MERGE_SEPARATION_M / 2, 6);
    expect(Math.max(...loop.map((p) => p.z))).toBeGreaterThan(500);
    // At 60° the sideways displacement shrinks to cos 60° = ½ of the in-plane offset and the
    // rest becomes height: z / (x + 200) = tan 60°.
    const p = tilted(60)[40];
    expect((p?.z ?? 0) / ((p?.x ?? 0) + 200)).toBeCloseTo(Math.sqrt(3), 6);
    for (const level of mergeTracks(matchup, 'two-circle').defender) expect(level.z).toBe(0);
  });
});

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

describe('buildScene', () => {
  it('boxes every point on grid-step sides and fits the box in view from any angle', () => {
    const tracks = mergeTracks(
      computeMatchup(testScenario({ attacker: sideConfig('f-16c', { turnPlane_deg: 90 }) })),
      'two-circle',
    );
    const { centre, radius, box } = buildScene(tracks);
    const points = [...tracks.attacker, ...tracks.defender];
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(box.minX);
      expect(p.x).toBeLessThanOrEqual(box.maxX);
      expect(p.z).toBeLessThanOrEqual(box.maxZ);
    }
    for (const side of [box.minX, box.maxX, box.minY, box.maxY, box.minZ, box.maxZ]) {
      expect(Math.abs(side % box.spacing)).toBe(0);
    }
    const corners = [box.minX, box.maxX].flatMap((x) =>
      [box.minY, box.maxY].flatMap((y) => [box.minZ, box.maxZ].map((z) => ({ x, y, z }))),
    );
    for (const camera of [VIEWS['3d'], VIEWS.top, VIEWS.side, { yaw: 137, pitch: 71 }]) {
      const c = project(centre, camera);
      for (const p of [...points, ...corners]) {
        const q = project(p, camera);
        expect(Math.hypot(q.x - c.x, q.y - c.y)).toBeLessThanOrEqual(radius + 1e-6);
      }
    }
  });

  it('gives a level fight a box one grid step tall, floored at merge height', () => {
    const { box } = buildScene(mergeTracks(matchup, 'two-circle'));
    expect([box.minZ, box.maxZ]).toEqual([0, box.spacing]);
  });
});

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
