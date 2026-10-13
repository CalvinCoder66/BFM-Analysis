/**
 * Custom loads built from pylon-slot presets, with the rules War Thunder enforces: presets that
 * ban each other (both ways), presets that need another, the total load and the left/right
 * limits. Pure functions over the aircraft's `stores` data, so the editor and the physics agree.
 */
import type { Selection, StorePreset, StoreRole, StoreSlot, Stores } from './aircraft-schema';

export interface Violation {
  /** Slot of the preset the reason is about, or null for whole-load limits. */
  slot: number | null;
  reason: string;
}

export interface LoadSummary {
  mass_kg: number;
  cd0Delta: number;
  /** Store mass on each side of the aircraft (slots without a side count as centre). */
  left_kg: number;
  right_kg: number;
  /** Weapons in the load, totalled by name, in slot order. */
  weapons: { name: string; count: number }[];
  roles: Set<StoreRole>;
  violations: Violation[];
}

/** What a load is for: air-to-air, air-to-ground, both, or neither (clean, tanks, pods). */
export type LoadRole = 'a2a' | 'a2g' | 'mixed' | null;

const A2G_ROLES: readonly StoreRole[] = ['agm', 'bomb', 'rocket'];

const kg = (v: number) => `${Math.round(v).toLocaleString('en-GB')} kg`;

export function slotLabel(slot: StoreSlot): string {
  return slot.name ?? `slot ${slot.index}`;
}

/** Slots in display order. */
export function orderedSlots(stores: Stores): StoreSlot[] {
  return [...stores.slots].sort((a, b) => (a.order ?? a.index) - (b.order ?? b.index));
}

function findSlot(stores: Stores, index: number): StoreSlot | undefined {
  return stores.slots.find((s) => s.index === index);
}

export function findPreset(stores: Stores, slot: number, id: string): StorePreset | undefined {
  return findSlot(stores, slot)?.presets.find((p) => p.id === id);
}

/** The selection's presets with their slots, in display order. */
function picks(stores: Stores, selection: Selection) {
  return orderedSlots(stores).flatMap((slot) => {
    const id = selection[slot.index];
    const preset = id === undefined ? undefined : slot.presets.find((p) => p.id === id);
    return preset ? [{ slot, preset }] : [];
  });
}

const presetAt = (stores: Stores, slot: number, preset: StorePreset) => {
  const where = findSlot(stores, slot);
  return `${preset.name} on ${where ? slotLabel(where) : `slot ${slot}`}`;
};

/** Mass, drag, weapons and every rule the selection breaks. */
export function evaluate(stores: Stores, selection: Selection): LoadSummary {
  const chosen = picks(stores, selection);
  const violations: Violation[] = [];

  for (const [slot, id] of Object.entries(selection)) {
    if (!findPreset(stores, Number(slot), id)) {
      violations.push({ slot: Number(slot), reason: `Unknown preset "${id}" on slot ${slot}` });
    }
  }

  const isChosen = (slot: number, preset: string) => selection[slot] === preset;
  const reported = new Set<string>();
  for (const { slot, preset } of chosen) {
    // Bans count both ways, so a ban listed on either preset of a pair rules the pair out.
    for (const ban of preset.bans) {
      const other = findPreset(stores, ban.slot, ban.preset);
      const key = [`${slot.index}:${preset.id}`, `${ban.slot}:${ban.preset}`].sort().join('|');
      if (other && isChosen(ban.slot, ban.preset) && !reported.has(key)) {
        reported.add(key);
        violations.push({
          slot: slot.index,
          reason: `${presetAt(stores, slot.index, preset)} rules out ${presetAt(stores, ban.slot, other)}`,
        });
      }
    }
    for (const need of preset.requires) {
      const other = findPreset(stores, need.slot, need.preset);
      if (other && !isChosen(need.slot, need.preset)) {
        violations.push({
          slot: slot.index,
          reason: `${presetAt(stores, slot.index, preset)} needs ${presetAt(stores, need.slot, other)}`,
        });
      }
    }
  }

  const sum = (pick: (p: StorePreset) => number, side?: StoreSlot['side']) =>
    chosen
      .filter(({ slot }) => side === undefined || slot.side === side)
      .reduce((total, { preset }) => total + pick(preset), 0);
  const mass_kg = sum((p) => p.mass_kg);
  const left_kg = sum((p) => p.mass_kg, 'left');
  const right_kg = sum((p) => p.mass_kg, 'right');

  if (mass_kg > stores.maxLoad_kg) {
    violations.push({
      slot: null,
      reason: `${kg(mass_kg)} is over the ${kg(stores.maxLoad_kg)} maximum load`,
    });
  }
  for (const [side, mass, limit] of [
    ['Left', left_kg, stores.maxLoadLeft_kg],
    ['Right', right_kg, stores.maxLoadRight_kg],
  ] as const) {
    if (limit !== undefined && mass > limit) {
      violations.push({
        slot: null,
        reason: `${side} side ${kg(mass)} is over its ${kg(limit)} limit`,
      });
    }
  }
  const imbalance = Math.abs(left_kg - right_kg);
  if (stores.maxDisbalance_kg !== undefined && imbalance > stores.maxDisbalance_kg) {
    violations.push({
      slot: null,
      reason: `Left and right differ by ${kg(imbalance)}, more than the ${kg(stores.maxDisbalance_kg)} allowed`,
    });
  }

  const weapons = new Map<string, number>();
  for (const { preset } of chosen) {
    for (const w of preset.weapons) weapons.set(w.name, (weapons.get(w.name) ?? 0) + w.count);
  }

  return {
    mass_kg,
    cd0Delta: sum((p) => p.cd0Delta),
    left_kg,
    right_kg,
    weapons: [...weapons].map(([name, count]) => ({ name, count })),
    roles: new Set(chosen.flatMap(({ preset }) => preset.roles)),
    violations,
  };
}

/**
 * The selection after putting `preset` (or nothing) in `slot`. Presets the new one needs are
 * added too, and presets whose needs are no longer met are taken off, so paired stores such as
 * drop tanks go on and come off together.
 */
export function choose(
  stores: Stores,
  selection: Selection,
  slot: number,
  preset: string | null,
): Selection {
  const next: Record<string, string> = { ...selection };
  if (preset === null) delete next[slot];
  else next[slot] = preset;

  const queue: [number, string][] = preset === null ? [] : [[slot, preset]];
  const added = new Set<number>([slot]);
  while (queue.length > 0) {
    const [s, id] = queue.pop() as [number, string];
    for (const need of findPreset(stores, s, id)?.requires ?? []) {
      // Each slot is filled at most once, so needs that point at each other cannot loop.
      if (next[need.slot] !== need.preset && !added.has(need.slot)) {
        next[need.slot] = need.preset;
        added.add(need.slot);
        queue.push([need.slot, need.preset]);
      }
    }
  }

  for (let changed = true; changed; ) {
    changed = false;
    for (const [s, id] of Object.entries(next)) {
      const needs = findPreset(stores, Number(s), id)?.requires ?? [];
      if (needs.some((need) => next[need.slot] !== need.preset)) {
        delete next[s];
        changed = true;
      }
    }
  }
  return next;
}

export interface SlotOption {
  /** null = leave the slot empty. */
  preset: StorePreset | null;
  allowed: boolean;
  /** Why it is not allowed: the first rule it would break. */
  reason?: string;
}

/**
 * Every choice for a slot given the rest of the selection. A choice is allowed when picking it
 * (with anything it needs) breaks no rule the selection does not already break.
 */
export function slotOptions(stores: Stores, selection: Selection, slot: number): SlotOption[] {
  const existing = new Set(evaluate(stores, selection).violations.map((v) => v.reason));
  const option = (preset: StorePreset | null): SlotOption => {
    const next = choose(stores, selection, slot, preset?.id ?? null);
    // If the choice could not stay (its needs clash), explain with it forced in.
    const checked = preset && next[slot] !== preset.id ? { ...next, [slot]: preset.id } : next;
    const added = evaluate(stores, checked).violations.find((v) => !existing.has(v.reason));
    return added ? { preset, allowed: false, reason: added.reason } : { preset, allowed: true };
  };
  return [option(null), ...(findSlot(stores, slot)?.presets ?? []).map(option)];
}

export function loadRole(roles: ReadonlySet<StoreRole>): LoadRole {
  const a2a = roles.has('aam');
  const a2g = A2G_ROLES.some((r) => roles.has(r));
  return a2a && a2g ? 'mixed' : a2a ? 'a2a' : a2g ? 'a2g' : null;
}

/** Whether a preset carries air-to-ground weapons (hidden by the "A2A only" filter). */
export function isA2g(preset: StorePreset): boolean {
  return preset.roles.some((r) => A2G_ROLES.includes(r));
}

/** "4× AIM-54C, 2× AIM-7M, 2× AIM-9M · 2,050 kg", or "No stores". */
export function describeLoad(load: LoadSummary): string {
  if (load.weapons.length === 0) return 'No stores';
  const weapons = load.weapons.map((w) => `${w.count}× ${w.name}`).join(', ');
  return `${weapons} · ${kg(load.mass_kg)}`;
}
