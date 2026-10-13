import { type Aircraft, aircraftSchema } from './aircraft-schema';

// Every JSON file in /data/aircraft is validated at load time so a bad edit fails loudly.
const files = import.meta.glob<unknown>('../../../../data/aircraft/*.json', {
  eager: true,
  import: 'default',
});

export function parseAircraftFiles(entries: Record<string, unknown>): Aircraft[] {
  return Object.entries(entries)
    .map(([path, json]) => {
      const result = aircraftSchema.safeParse(json);
      if (!result.success) {
        throw new Error(`Invalid aircraft data in ${path}: ${result.error.message}`);
      }
      return result.data;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const AIRCRAFT: readonly Aircraft[] = parseAircraftFiles(files);

export function getAircraft(id: string): Aircraft {
  const aircraft = AIRCRAFT.find((a) => a.id === id);
  if (!aircraft) throw new Error(`Unknown aircraft "${id}"`);
  return aircraft;
}

/** Whether the aircraft's name, nation or any variant's name contains the query (any case). */
export function matchesQuery(aircraft: Aircraft, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return [aircraft.name, aircraft.nation, ...(aircraft.variants ?? []).map((v) => v.name)].some(
    (text) => text.toLowerCase().includes(q),
  );
}

/** Aircraft grouped by battle rating, highest first, then by name; unrated ones last. */
export function groupByBr(
  aircraft: readonly Aircraft[],
): { br: number | null; aircraft: Aircraft[] }[] {
  const groups = new Map<number | null, Aircraft[]>();
  for (const a of aircraft) groups.set(a.br ?? null, [...(groups.get(a.br ?? null) ?? []), a]);
  return [...groups]
    .sort(([a], [b]) => (b ?? Number.NEGATIVE_INFINITY) - (a ?? Number.NEGATIVE_INFINITY))
    .map(([br, list]) => ({ br, aircraft: list.sort((x, y) => x.name.localeCompare(y.name)) }));
}

export type DataStatus = 'mock' | 'unvalidated' | 'validated';

/** Mock data; real data not yet checked in flight; or real data that passed the flight checks. */
export function dataStatus(aircraft: Aircraft): DataStatus {
  if (aircraft.source === 'mock') return 'mock';
  return aircraft.provenance?.validated ? 'validated' : 'unvalidated';
}

/** "WT 2.59" from a patch such as "2.59.0.65", or null for mock data. */
export function patchLabel(aircraft: Aircraft): string | null {
  return aircraft.gamePatch ? `WT ${aircraft.gamePatch.split('.').slice(0, 2).join('.')}` : null;
}
