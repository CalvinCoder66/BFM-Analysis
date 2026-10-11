import { casToTas, isa, tasToCas } from './atmosphere';
import { knotsToMs, msToKnots } from './units';

describe('isa', () => {
  // Reference values from the U.S. Standard Atmosphere 1976 tables (geometric altitude).
  it.each([
    { h: 0, temperature: 288.15, pressure: 101_325, density: 1.225, speedOfSound: 340.29 },
    { h: 5_000, temperature: 255.65, pressure: 54_048, density: 0.7364, speedOfSound: 320.53 },
    { h: 11_000, temperature: 216.77, pressure: 22_700, density: 0.3648, speedOfSound: 295.15 },
    { h: 15_000, temperature: 216.65, pressure: 12_111, density: 0.1948, speedOfSound: 295.07 },
  ])(
    'matches the standard table at $h m',
    ({ h, temperature, pressure, density, speedOfSound }) => {
      const atm = isa(h);
      expect(atm.temperature).toBeCloseTo(temperature, 1);
      expect(atm.pressure / pressure).toBeCloseTo(1, 3);
      expect(atm.density / density).toBeCloseTo(1, 3);
      expect(atm.speedOfSound).toBeCloseTo(speedOfSound, 1);
    },
  );

  it('clamps negative altitudes to sea level', () => {
    expect(isa(-500).density).toBeCloseTo(1.225, 4);
  });
});

describe('airspeed conversion', () => {
  it('treats CAS and TAS as equal at sea level, subsonic and supersonic', () => {
    for (const v of [100, 250, 400, 500]) {
      expect(tasToCas(v, 0)).toBeCloseTo(v, 3);
      expect(casToTas(v, 0)).toBeCloseTo(v, 3);
    }
  });

  it('matches the rule of thumb that 300 KCAS at FL300 is about Mach 0.79', () => {
    const altitude = 9_144;
    const tas = casToTas(knotsToMs(300), altitude);
    expect(tas / isa(altitude).speedOfSound).toBeCloseTo(0.79, 2);
    expect(msToKnots(tas)).toBeGreaterThan(460);
    expect(msToKnots(tas)).toBeLessThan(470);
  });

  it('round-trips at altitude across Mach 1', () => {
    for (const tas of [150, 290, 300, 450, 600]) {
      expect(casToTas(tasToCas(tas, 8_000), 8_000)).toBeCloseTo(tas, 2);
    }
  });

  it('gives a lower CAS than TAS at altitude', () => {
    expect(tasToCas(250, 6_000)).toBeLessThan(250);
  });
});
