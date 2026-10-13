import { z } from 'zod';

const increasing = (values: number[]) =>
  values.every((v, i) => i === 0 || v > (values[i - 1] ?? v));

const axis = z
  .array(z.number().nonnegative())
  .min(2)
  .refine(increasing, { message: 'axis values must be strictly increasing' });

const idSchema = z.string().regex(/^[a-z0-9-]+$/);

/**
 * Stores picked per pylon slot: slot index (as a string, since JSON keys are strings) → preset id.
 * Slots left out are empty.
 */
const selectionSchema = z.record(z.string().regex(/^\d+$/), z.string().min(1));

const loadoutSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Mass of stores and pylons. With a `selection`, must equal the selection's total. */
  mass_kg: z.number().nonnegative(),
  /** Added zero-lift drag coefficient from stores and pylons. */
  cd0Delta: z.number().nonnegative(),
  /** The same load as pylon-slot picks, which the loadout editor starts from. */
  selection: selectionSchema.optional(),
});

/** A preset in one slot, referenced by a ban or a requirement. */
const presetRefSchema = z.object({
  slot: z.number().int().nonnegative(),
  preset: z.string().min(1),
});

export const STORE_ROLES = ['aam', 'agm', 'bomb', 'rocket', 'pod', 'fuel'] as const;

/** One choice for a pylon slot (WT `WeaponSlots[].WeaponPreset`). */
const storePresetSchema = z.object({
  id: z.string().min(1),
  /** Short display name, e.g. "AIM-54C ×2". */
  name: z.string().min(1),
  roles: z.array(z.enum(STORE_ROLES)),
  weapons: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      count: z.number().int().positive(),
    }),
  ),
  /** Mass of the stores and their pylon or launcher. */
  mass_kg: z.number().nonnegative(),
  /** Added zero-lift drag coefficient, referred to the wing area. */
  cd0Delta: z.number().nonnegative(),
  /** Presets this one rules out in other slots (WT `BannedWeaponPreset`); bans work both ways. */
  bans: z.array(presetRefSchema).default([]),
  /** Presets this one needs in other slots (WT `DependentWeaponPreset`), all of them. */
  requires: z.array(presetRefSchema).default([]),
});

const storeSlotSchema = z.object({
  /** WT slot index (0 is the gun, usually left out). */
  index: z.number().int().nonnegative(),
  /** Display order, left to right; defaults to the index. */
  order: z.number().int().optional(),
  /** Display name, e.g. "Front fuselage"; defaults to "Slot <index>". */
  name: z.string().min(1).optional(),
  /** Which side of the aircraft the slot is on, for the left/right load limits. */
  side: z.enum(['left', 'centre', 'right']).optional(),
  presets: z.array(storePresetSchema).min(1),
});

/** Every pylon slot and the rules the game enforces between them. */
const storesSchema = z
  .object({
    /** Total store mass allowed (WT `maxloadMass`). */
    maxLoad_kg: z.number().positive(),
    /** Store mass allowed on each side (WT `maxloadMassLeftConsoles` / `RightConsoles`). */
    maxLoadLeft_kg: z.number().positive().optional(),
    maxLoadRight_kg: z.number().positive().optional(),
    /** Largest allowed difference between the left and right store mass (WT `maxDisbalance`). */
    maxDisbalance_kg: z.number().nonnegative().optional(),
    /** Whether store drag has been checked in flight; until then it is an estimate. */
    dragValidated: z.boolean().default(false),
    slots: z.array(storeSlotSchema).min(1),
  })
  .superRefine((stores, ctx) => {
    const presets = new Map<number, Set<string>>();
    for (const [i, slot] of stores.slots.entries()) {
      if (presets.has(slot.index)) {
        ctx.addIssue({ code: 'custom', path: ['slots', i, 'index'], message: 'duplicate slot' });
      }
      const ids = slot.presets.map((p) => p.id);
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({ code: 'custom', path: ['slots', i], message: 'duplicate preset id' });
      }
      presets.set(slot.index, new Set(ids));
    }
    for (const [i, slot] of stores.slots.entries()) {
      for (const [j, preset] of slot.presets.entries()) {
        for (const key of ['bans', 'requires'] as const) {
          for (const [k, ref] of preset[key].entries()) {
            if (!presets.get(ref.slot)?.has(ref.preset)) {
              ctx.addIssue({
                code: 'custom',
                path: ['slots', i, 'presets', j, key, k],
                message: `no preset "${ref.preset}" in slot ${ref.slot}`,
              });
            }
          }
        }
      }
    }
  });

/** A thrust table: rows = altitude, columns = Mach. */
const thrustTable = z.array(z.array(z.number().nonnegative()));

/**
 * Aircraft performance data. All values SI. Tables are indexed by Mach (aero) and by
 * altitude × Mach (thrust) and interpolated linearly at runtime.
 */
export const aircraftSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1),
    /** Display name, e.g. "USA". */
    nation: z.string().min(1),
    /** Realistic Battles battle rating. */
    br: z.number().positive().optional(),
    /** Every vehicle sharing this flight model (nation copies, sub-variants), for search. */
    variants: z
      .array(
        z.object({
          id: z.string().min(1),
          name: z.string().min(1),
          nation: z.string().min(1),
          br: z.number().positive().optional(),
        }),
      )
      .optional(),
    /** `mock` values are estimates for UI development, not datamined figures. */
    source: z.enum(['mock', 'datamine', 'community']),
    /** War Thunder patch the data matches, or null for mock data. */
    gamePatch: z.string().nullable(),
    /** Where real data came from, and whether it has passed the flight checks. */
    provenance: z
      .object({
        /** Datamine tag, e.g. "2.59.0.65". */
        datamineRef: z.string().min(1),
        commit: z.string().regex(/^[0-9a-f]{7,40}$/),
        /** Checked against test flights (docs/FINDINGS.md); unvalidated data is shown as such. */
        validated: z.boolean(),
      })
      .optional(),
    notes: z.string(),
    wingArea_m2: z.number().positive(),
    /** Empty mass including pilot, gun and ammunition. */
    emptyMass_kg: z.number().positive(),
    internalFuel_kg: z.number().positive(),
    /**
     * G limits, following War Thunder's model. The wing-break load is a force, so the wing-break
     * load factor falls as the aircraft gets heavier.
     */
    gLimits: z.object({
      /** Total lift at which the wings fail (WT `Strength.CritOverload`). */
      wingBreakLoad_N: z.number().positive(),
      /** Fly-by-wire G limit, a hard cap even below the instructor's, or null if none. */
      fcs: z.number().min(1).nullable(),
      /** Fraction of wing-break G the RB instructor holds (about 1.0 in flight tests). */
      instructorFraction: z.number().gt(0).max(1),
    }),
    /** Placard limits: whichever is reached first caps the speed range. */
    maxIas_kmh: z.number().positive(),
    maxMach: z.number().positive(),
    aero: z.object({
      mach: axis,
      clMax: z.array(z.number().positive()),
      cd0: z.array(z.number().positive()),
      /** Induced drag factor k in CD = CD0 + k·CL². */
      k: z.array(z.number().positive()),
    }),
    thrust: z.object({
      altitude_m: axis,
      mach: axis,
      /** Maximum thrust (full afterburner, or military power if there is none). */
      afterburner_N: thrustTable,
      /** Military (dry) thrust, where known. */
      military_N: thrustTable.optional(),
    }),
    /** Quick picks: no stores, the game's presets and the like. */
    loadouts: z.array(loadoutSchema).min(1),
    /** Pylon slots for building a custom load; aircraft without it offer the quick picks only. */
    stores: storesSchema.optional(),
  })
  .superRefine((a, ctx) => {
    const n = a.aero.mach.length;
    for (const key of ['clMax', 'cd0', 'k'] as const) {
      if (a.aero[key].length !== n) {
        ctx.addIssue({ code: 'custom', path: ['aero', key], message: `expected ${n} values` });
      }
    }
    const { altitude_m, mach } = a.thrust;
    for (const key of ['afterburner_N', 'military_N'] as const) {
      const table = a.thrust[key];
      if (
        table &&
        (table.length !== altitude_m.length || table.some((row) => row.length !== mach.length))
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['thrust', key],
          message: `expected ${altitude_m.length} rows × ${mach.length} columns`,
        });
      }
    }
    const ids = a.loadouts.map((l) => l.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: ['loadouts'], message: 'loadout ids must be unique' });
    }
    // A loadout's slot picks must name real slots and presets.
    for (const [i, loadout] of a.loadouts.entries()) {
      for (const [slot, preset] of Object.entries(loadout.selection ?? {})) {
        const found = a.stores?.slots
          .find((s) => s.index === Number(slot))
          ?.presets.some((p) => p.id === preset);
        if (!found) {
          ctx.addIssue({
            code: 'custom',
            path: ['loadouts', i, 'selection', slot],
            message: `no preset "${preset}" in slot ${slot}`,
          });
        }
      }
    }
  });

export type Aircraft = z.infer<typeof aircraftSchema>;
export type Loadout = z.infer<typeof loadoutSchema>;
export type Stores = z.infer<typeof storesSchema>;
export type StoreSlot = z.infer<typeof storeSlotSchema>;
export type StorePreset = z.infer<typeof storePresetSchema>;
export type StoreRole = (typeof STORE_ROLES)[number];
/** Slot index (as a string) → preset id; slots left out are empty. */
export type Selection = z.infer<typeof selectionSchema>;
