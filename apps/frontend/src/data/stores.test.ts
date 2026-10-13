import type { StorePreset, StoreRole, Stores } from './aircraft-schema';
import { choose, describeLoad, evaluate, loadRole, slotOptions } from './stores';

const preset = (
  id: string,
  name: string,
  mass_kg: number,
  roles: StoreRole[],
  extra: Partial<StorePreset> = {},
): StorePreset => ({
  id,
  name,
  roles,
  weapons: [{ id, name: name.replace(/ ×\d$/, ''), count: Number(name.match(/×(\d)$/)?.[1] ?? 1) }],
  mass_kg,
  cd0Delta: 0.0005,
  bans: [],
  requires: [],
  ...extra,
});

// A small, made-up aircraft: two wing slots, two fuselage slots and paired intake tanks.
const stores: Stores = {
  maxLoad_kg: 3_000,
  maxLoadLeft_kg: 1_200,
  maxLoadRight_kg: 1_300,
  maxDisbalance_kg: 500,
  dragValidated: false,
  slots: [
    {
      index: 1,
      name: 'left wing',
      side: 'left',
      presets: [
        preset('aim9', 'AIM-9M', 86, ['aam']),
        preset('gbu12', 'GBU-12', 277, ['bomb'], { requires: [{ slot: 3, preset: 'pod' }] }),
        preset('mk84', 'Mk 84', 925, ['bomb']),
      ],
    },
    {
      index: 2,
      name: 'front fuselage',
      side: 'centre',
      presets: [
        preset('phoenix2', 'AIM-54C ×2', 926, ['aam'], {
          cd0Delta: 0.002,
          bans: [{ slot: 4, preset: 'sparrow2' }],
        }),
      ],
    },
    {
      index: 3,
      name: 'right wing',
      side: 'right',
      presets: [preset('aim9', 'AIM-9M', 86, ['aam']), preset('pod', 'LANTIRN', 236, ['pod'])],
    },
    {
      index: 4,
      name: 'rear fuselage',
      side: 'centre',
      presets: [preset('sparrow2', 'AIM-7M ×2', 462, ['aam'])],
    },
    {
      index: 5,
      name: 'left intake',
      side: 'left',
      presets: [
        preset('tank', 'Drop tank', 980, ['fuel'], { requires: [{ slot: 6, preset: 'tank' }] }),
      ],
    },
    {
      index: 6,
      name: 'right intake',
      side: 'right',
      presets: [
        preset('tank', 'Drop tank', 980, ['fuel'], { requires: [{ slot: 5, preset: 'tank' }] }),
      ],
    },
  ],
};
const reasons = (selection: Record<string, string>) =>
  evaluate(stores, selection).violations.map((v) => v.reason);

describe('evaluate', () => {
  it('adds up mass and drag and totals the weapons by name', () => {
    const load = evaluate(stores, { 1: 'aim9', 2: 'phoenix2', 3: 'aim9' });
    // 86 + 926 + 86 kg; drag 0.0005 + 0.002 + 0.0005.
    expect(load.mass_kg).toBe(1_098);
    expect(load.cd0Delta).toBeCloseTo(0.003, 12);
    expect([load.left_kg, load.right_kg]).toEqual([86, 86]);
    expect(describeLoad(load)).toBe('2× AIM-9M, 2× AIM-54C · 1,098 kg');
    expect(load.violations).toEqual([]);
    expect(describeLoad(evaluate(stores, {}))).toBe('No stores');
  });

  it('reports a ban once, whichever preset lists it', () => {
    expect(reasons({ 2: 'phoenix2', 4: 'sparrow2' })).toEqual([
      'AIM-54C ×2 on front fuselage rules out AIM-7M ×2 on rear fuselage',
    ]);
  });

  it('reports a preset whose companion is missing', () => {
    expect(reasons({ 1: 'gbu12' })).toEqual(['GBU-12 on left wing needs LANTIRN on right wing']);
  });

  it('enforces the total, per-side and left/right balance limits', () => {
    // 980 × 2 + 926 + 86 × 2 = 3,058 kg.
    expect(reasons({ 1: 'aim9', 2: 'phoenix2', 3: 'aim9', 5: 'tank', 6: 'tank' })).toEqual([
      '3,058 kg is over the 3,000 kg maximum load',
    ]);
    // Left: 277 + 980 = 1,257 kg over 1,200; right: 236 + 980 = 1,216 kg, under its 1,300.
    expect(reasons({ 1: 'gbu12', 3: 'pod', 5: 'tank', 6: 'tank' })).toEqual([
      'Left side 1,257 kg is over its 1,200 kg limit',
    ]);
    expect(reasons({ 1: 'mk84' })).toEqual([
      'Left and right differ by 925 kg, more than the 500 kg allowed',
    ]);
  });
});

describe('choose', () => {
  it('adds what a preset needs and takes off what loses its companion', () => {
    expect(choose(stores, {}, 1, 'gbu12')).toEqual({ 1: 'gbu12', 3: 'pod' });
    expect(choose(stores, { 1: 'gbu12', 3: 'pod' }, 3, null)).toEqual({});
    expect(choose(stores, { 1: 'gbu12', 3: 'pod' }, 3, 'aim9')).toEqual({ 3: 'aim9' });
  });

  it('puts paired tanks on and off together', () => {
    const tanks = choose(stores, { 2: 'phoenix2' }, 5, 'tank');
    expect(tanks).toEqual({ 2: 'phoenix2', 5: 'tank', 6: 'tank' });
    expect(evaluate(stores, tanks).violations).toEqual([]);
    expect(choose(stores, tanks, 6, null)).toEqual({ 2: 'phoenix2' });
  });
});

describe('slotOptions', () => {
  const summary = (selection: Record<string, string>, slot: number) =>
    slotOptions(stores, selection, slot).map((o) => [o.preset?.id ?? 'empty', o.allowed, o.reason]);

  it('allows presets that fit, with what they need, and explains the rest', () => {
    expect(summary({}, 1)).toEqual([
      ['empty', true, undefined],
      ['aim9', true, undefined],
      // Brings the LANTIRN along: 277 kg left, 236 kg right.
      ['gbu12', true, undefined],
      ['mk84', false, 'Left and right differ by 925 kg, more than the 500 kg allowed'],
    ]);
  });

  it('rules out banned presets from either side of the ban', () => {
    expect(summary({ 4: 'sparrow2' }, 2)[1]).toEqual([
      'phoenix2',
      false,
      'AIM-54C ×2 on front fuselage rules out AIM-7M ×2 on rear fuselage',
    ]);
    expect(summary({ 2: 'phoenix2' }, 4)[1]?.[1]).toBe(false);
  });

  it('lets a companion be removed, taking its dependant with it', () => {
    expect(summary({ 1: 'gbu12', 3: 'pod' }, 3)[0]).toEqual(['empty', true, undefined]);
  });
});

describe('loadRole', () => {
  it('tells air-to-air, air-to-ground and mixed loads apart', () => {
    expect(loadRole(new Set<StoreRole>(['aam', 'fuel']))).toBe('a2a');
    expect(loadRole(new Set<StoreRole>(['bomb', 'pod']))).toBe('a2g');
    expect(loadRole(new Set<StoreRole>(['aam', 'rocket']))).toBe('mixed');
    expect(loadRole(new Set<StoreRole>(['fuel', 'pod']))).toBeNull();
  });
});
