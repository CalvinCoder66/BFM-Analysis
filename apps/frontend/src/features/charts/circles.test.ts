import { sideConfig, testScenario } from '../../test/scenarios';
import { computeMatchup } from '../comparison/matchup';
import {
  buildScene,
  gridSpacing,
  MERGE_SEPARATION_M,
  mergeTracks,
  orbit,
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
  it('keeps every point within the view radius from any angle', () => {
    const tracks = mergeTracks(
      computeMatchup(testScenario({ attacker: sideConfig('f-16c', { turnPlane_deg: 90 }) })),
      'two-circle',
    );
    const { centre, radius, grid } = buildScene(tracks);
    const corners = [
      { x: grid.minX, y: grid.minY, z: 0 },
      { x: grid.maxX, y: grid.maxY, z: 0 },
    ];
    for (const camera of [VIEWS['3d'], VIEWS.top, VIEWS.side, { yaw: 137, pitch: 71 }]) {
      const c = project(centre, camera);
      for (const p of [...tracks.attacker, ...tracks.defender, ...corners]) {
        const q = project(p, camera);
        expect(Math.hypot(q.x - c.x, q.y - c.y)).toBeLessThanOrEqual(radius + 1e-6);
      }
    }
  });
});

describe('gridSpacing', () => {
  it('picks the first round length of at least a fifth of the size', () => {
    expect(gridSpacing(2_000)).toBe(500);
    expect(gridSpacing(2_600)).toBe(1_000);
    expect(gridSpacing(450)).toBe(100);
  });
});
