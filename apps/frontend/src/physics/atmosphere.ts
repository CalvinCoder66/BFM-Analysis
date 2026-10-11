/**
 * International Standard Atmosphere (ISA) up to 20 km, plus airspeed conversions.
 * All values SI: metres, kelvin, pascals, kg/m³, m/s.
 */

export const G0 = 9.80665; // m/s²
const R = 287.05287; // J/(kg·K), specific gas constant for dry air
const GAMMA = 1.4;
const T0 = 288.15; // K
const P0 = 101_325; // Pa
const RHO0 = 1.225; // kg/m³
const LAPSE = 0.0065; // K/m, troposphere
const TROPOPAUSE = 11_000; // m

export interface Atmosphere {
  temperature: number;
  pressure: number;
  density: number;
  speedOfSound: number;
}

const EARTH_RADIUS = 6_356_766; // m, used for geometric → geopotential altitude

/** ISA properties at a geometric altitude in metres (clamped to 0–20 km). */
export function isa(altitude: number): Atmosphere {
  const z = Math.min(Math.max(altitude, 0), 20_000);
  const h = (EARTH_RADIUS * z) / (EARTH_RADIUS + z); // geopotential altitude
  let temperature: number;
  let pressure: number;
  if (h <= TROPOPAUSE) {
    temperature = T0 - LAPSE * h;
    pressure = P0 * (temperature / T0) ** (G0 / (LAPSE * R));
  } else {
    const tTrop = T0 - LAPSE * TROPOPAUSE;
    const pTrop = P0 * (tTrop / T0) ** (G0 / (LAPSE * R));
    temperature = tTrop;
    pressure = pTrop * Math.exp((-G0 * (h - TROPOPAUSE)) / (R * tTrop));
  }
  const density = pressure / (R * temperature);
  return { temperature, pressure, density, speedOfSound: Math.sqrt(GAMMA * R * temperature) };
}

const A0 = Math.sqrt(GAMMA * R * T0);

/**
 * Impact pressure for a subsonic or supersonic flow (Rayleigh pitot formula above Mach 1).
 */
function impactPressure(mach: number, pressure: number): number {
  if (mach <= 1) return pressure * ((1 + 0.2 * mach ** 2) ** 3.5 - 1);
  const m2 = mach ** 2;
  return pressure * ((166.92158 * mach ** 7) / (7 * m2 - 1) ** 2.5 - 1);
}

function machFromImpactPressure(qc: number, pressure: number): number {
  // Invert by bisection; impactPressure is monotonic in Mach.
  let lo = 0;
  let hi = 5;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (impactPressure(mid, pressure) < qc) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** True airspeed → calibrated airspeed (≈ IAS as shown in War Thunder). */
export function tasToCas(tas: number, altitude: number): number {
  const atm = isa(altitude);
  const qc = impactPressure(tas / atm.speedOfSound, atm.pressure);
  // Calibrated airspeed is the sea-level speed giving the same impact pressure.
  return A0 * machFromImpactPressure(qc, P0);
}

/** Calibrated airspeed → true airspeed. */
export function casToTas(cas: number, altitude: number): number {
  const atm = isa(altitude);
  const qc = impactPressure(cas / A0, P0);
  return machFromImpactPressure(qc, atm.pressure) * atm.speedOfSound;
}

export const SEA_LEVEL_DENSITY = RHO0;
