import { resolveCondition, summarise } from '../physics/performance';
import {
  AIRCRAFT,
  dataStatus,
  getAircraft,
  groupByBr,
  matchesQuery,
  parseAircraftFiles,
  patchLabel,
} from './aircraft';
import { aircraftSchema } from './aircraft-schema';
import { evaluate } from './stores';

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
      // War Thunder-style G limits: instructor at or below wing-break, in a plausible range.
      const { gLimits } = resolveCondition(aircraft, {
        altitude_m: 0,
        fuelFraction: 0.5,
        loadoutId: 'clean',
      });
      expect(gLimits.instructor).toBeGreaterThanOrEqual(8);
      expect(gLimits.instructor).toBeLessThanOrEqual(gLimits.wingBreak);
      expect(gLimits.wingBreak).toBeLessThan(18);
    },
  );

  it('throws for unknown aircraft ids', () => {
    expect(() => getAircraft('spitfire')).toThrow(/unknown aircraft/i);
  });
});

describe('loadouts with slot picks', () => {
  const withStores = AIRCRAFT.filter((a) => a.stores);

  it('includes at least one aircraft with pylon slots', () => {
    expect(withStores.length).toBeGreaterThan(0);
  });

  it.each(withStores.map((a) => [a.name, a] as const))(
    '%s quick picks are legal and match their slot picks',
    (_, aircraft) => {
      for (const loadout of aircraft.loadouts.filter((l) => l.selection)) {
        if (!aircraft.stores) return;
        const load = evaluate(aircraft.stores, loadout.selection ?? {});
        expect(load.violations, loadout.id).toEqual([]);
        expect(load.mass_kg, loadout.id).toBeCloseTo(loadout.mass_kg, 0);
        expect(load.cd0Delta, loadout.id).toBeCloseTo(loadout.cd0Delta, 6);
      }
    },
  );
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

  it('accepts real-data fields and rejects store rules that point nowhere', () => {
    const f14 = getAircraft('f-14d');
    expect(f14.stores?.slots.length).toBeGreaterThan(0);
    const real = {
      ...valid,
      source: 'datamine',
      gamePatch: '2.59.0.65',
      br: 13.7,
      variants: [{ id: 'f_16c_block_50', name: 'F-16CM Block 50', nation: 'USA', br: 13.7 }],
      provenance: { datamineRef: '2.59.0.65', commit: '9507196', validated: false },
      thrust: { ...valid.thrust, military_N: valid.thrust.afterburner_N },
    };
    expect(aircraftSchema.safeParse(real).success).toBe(true);

    const [first, ...rest] = f14.stores?.slots ?? [];
    const dangling = {
      ...f14,
      stores: {
        ...f14.stores,
        slots: [
          { ...first, presets: [{ ...first?.presets[0], bans: [{ slot: 4, preset: 'nope' }] }] },
          ...rest,
        ],
      },
    };
    expect(aircraftSchema.safeParse(dangling).success).toBe(false);
    const badPick = {
      ...f14,
      loadouts: [{ id: 'x', name: 'X', mass_kg: 0, cd0Delta: 0, selection: { 4: 'nope' } }],
    };
    expect(aircraftSchema.safeParse(badPick).success).toBe(false);
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

describe('aircraft picker helpers', () => {
  const at = (id: string, br?: number) => ({ ...valid, id, name: id.toUpperCase(), br });

  it('finds aircraft by name, nation or a variant name, ignoring case', () => {
    const f14 = getAircraft('f-14d');
    expect(matchesQuery(f14, 'tomcat')).toBe(true);
    expect(matchesQuery(f14, 'usa')).toBe(true);
    expect(matchesQuery(f14, 'vf-11')).toBe(true);
    expect(matchesQuery(f14, 'mig')).toBe(false);
    expect(matchesQuery(f14, '  ')).toBe(true);
  });

  it('groups by battle rating, highest first and unrated last, sorted by name', () => {
    const groups = groupByBr([at('b', 13), at('x'), at('a', 13), at('c', 14.3)]);
    expect(groups.map((g) => [g.br, g.aircraft.map((a) => a.id)])).toEqual([
      [14.3, ['c']],
      [13, ['a', 'b']],
      [null, ['x']],
    ]);
  });
});

describe('data status', () => {
  it('labels mock, unvalidated and validated real data', () => {
    expect(dataStatus(valid)).toBe('mock');
    expect(patchLabel(valid)).toBeNull();
    const real = { ...valid, source: 'datamine' as const, gamePatch: '2.59.0.65' };
    const provenance = { datamineRef: '2.59.0.65', commit: '9507196', validated: false };
    expect(dataStatus({ ...real, provenance })).toBe('unvalidated');
    expect(dataStatus({ ...real, provenance: { ...provenance, validated: true } })).toBe(
      'validated',
    );
    expect(patchLabel(real)).toBe('WT 2.59');
  });
});
