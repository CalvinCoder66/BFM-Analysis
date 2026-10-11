import type { Scenario, SideConfig } from '../features/comparison/matchup';
import { kmhToMs } from '../physics/units';

/** A side config with test defaults: 50% fuel, clean, instructor on, yanking, level turn. */
export const sideConfig = (
  aircraftId: string,
  overrides: Partial<SideConfig> = {},
): SideConfig => ({
  aircraftId,
  fuelFraction: 0.5,
  loadoutId: 'clean',
  limiter: 'instructor',
  pilotG: null,
  turnPlane_deg: 0,
  ...overrides,
});

/** F-16C vs MiG-29 at 1 000 m, 800 km/h merge, 20 s turn, unless overridden. */
export const testScenario = (overrides: Partial<Scenario> = {}): Scenario => ({
  altitude_m: 1_000,
  mergeCas: kmhToMs(800),
  turnDuration_s: 20,
  attacker: sideConfig('f-16c'),
  defender: sideConfig('mig-29'),
  ...overrides,
});
