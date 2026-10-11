import { resolveCondition, summarise } from '../physics/performance';
import { AIRCRAFT, getAircraft, parseAircraftFiles } from './aircraft';
import { aircraftSchema } from './aircraft-schema';

const valid = getAircraft('f-16c');

describe('aircraft data files', () => {
  it('loads every aircraft with a unique id', () => {
    expect(AIRCRAFT.length).toBeGreaterThanOrEqual(3);
    const ids = AIRCRAFT.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('marks mock data as unpatched so it cannot pass for real data', () => {
    for (const a of AIRCRAFT.filter((x) => x.source === 'mock')) expect(a.gamePatch).toBeNull();
  });

  it.each(AIRCRAFT.map((a) => [a.name, a] as const))(
    '%s has plausible clean sea-level turn figures',
    (_, aircraft) => {
      const s = summarise(
        resolveCondition(aircraft, { altitude_m: 0, fuelFraction: 0.5, loadoutId: 'clean' }),
      );
      expect(s.maxItr.value).toBeGreaterThan(18);
      expect(s.maxItr.value).toBeLessThan(35);
      expect(s.maxStr.value).toBeGreaterThan(12);
      expect(s.maxStr.value).toBeLessThan(s.maxItr.value);
      expect(s.limits.cornerTas).not.toBeNull();
      // War Thunder-style G limits: instructor below wing-break, in a plausible 4th-gen range.
      const { gLimits } = resolveCondition(aircraft, {
        altitude_m: 0,
        fuelFraction: 0.5,
        loadoutId: 'clean',
      });
      expect(gLimits.instructor).toBeGreaterThanOrEqual(8);
      expect(gLimits.instructor).toBeLessThan(gLimits.wingBreak);
      expect(gLimits.wingBreak).toBeLessThan(18);
    },
  );

  it('throws for unknown aircraft ids', () => {
    expect(() => getAircraft('spitfire')).toThrow(/unknown aircraft/i);
  });
});

describe('aircraftSchema', () => {
  it('rejects aero tables whose length does not match the Mach axis', () => {
    const bad = { ...valid, aero: { ...valid.aero, cd0: valid.aero.cd0.slice(1) } };
    expect(aircraftSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects non-increasing axes', () => {
    const bad = { ...valid, aero: { ...valid.aero, mach: [...valid.aero.mach].reverse() } };
    expect(aircraftSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects thrust tables with the wrong shape', () => {
    const bad = {
      ...valid,
      thrust: { ...valid.thrust, afterburner_N: valid.thrust.afterburner_N.slice(1) },
    };
    expect(aircraftSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects duplicate loadout ids', () => {
    const first = valid.loadouts[0];
    const bad = { ...valid, loadouts: [first, first] };
    expect(aircraftSchema.safeParse(bad).success).toBe(false);
  });
});

describe('parseAircraftFiles', () => {
  it('names the offending file when data is invalid', () => {
    expect(() =>
      parseAircraftFiles({ 'data/aircraft/broken.json': { ...valid, wingArea_m2: -1 } }),
    ).toThrow(/broken\.json/);
  });
});
