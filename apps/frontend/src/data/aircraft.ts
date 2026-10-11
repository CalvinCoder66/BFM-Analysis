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
