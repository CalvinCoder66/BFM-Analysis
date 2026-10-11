import { z } from 'zod';

const increasing = (values: number[]) =>
  values.every((v, i) => i === 0 || v > (values[i - 1] ?? v));

const axis = z
  .array(z.number().nonnegative())
  .min(2)
  .refine(increasing, { message: 'axis values must be strictly increasing' });

const loadoutSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Mass of stores and pylons. */
  mass_kg: z.number().nonnegative(),
  /** Added zero-lift drag coefficient from stores and pylons. */
  cd0Delta: z.number().nonnegative(),
});

/**
 * Aircraft performance data. All values SI. Tables are indexed by Mach (aero) and by
 * altitude × Mach (thrust) and interpolated linearly at runtime.
 */
export const aircraftSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().min(1),
    nation: z.string().min(1),
    /** `mock` values are estimates for UI development, not datamined figures. */
    source: z.enum(['mock', 'datamine', 'community']),
    /** War Thunder patch the data matches, or null for mock data. */
    gamePatch: z.string().nullable(),
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
      /** Fly-by-wire G limiter that applies with or without the instructor, or null if none. */
      fcs: z.number().min(1).nullable(),
      /** Fraction of wing-break G the WT instructor allows (`overloadMult`, about 0.85–0.92). */
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
      /** Maximum afterburner thrust, rows = altitude, columns = Mach. */
      afterburner_N: z.array(z.array(z.number().nonnegative())),
    }),
    loadouts: z.array(loadoutSchema).min(1),
  })
  .superRefine((a, ctx) => {
    const n = a.aero.mach.length;
    for (const key of ['clMax', 'cd0', 'k'] as const) {
      if (a.aero[key].length !== n) {
        ctx.addIssue({ code: 'custom', path: ['aero', key], message: `expected ${n} values` });
      }
    }
    const { altitude_m, mach, afterburner_N } = a.thrust;
    if (
      afterburner_N.length !== altitude_m.length ||
      afterburner_N.some((row) => row.length !== mach.length)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['thrust', 'afterburner_N'],
        message: `expected ${altitude_m.length} rows × ${mach.length} columns`,
      });
    }
    const ids = a.loadouts.map((l) => l.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: ['loadouts'], message: 'loadout ids must be unique' });
    }
  });

export type Aircraft = z.infer<typeof aircraftSchema>;
export type Loadout = z.infer<typeof loadoutSchema>;
