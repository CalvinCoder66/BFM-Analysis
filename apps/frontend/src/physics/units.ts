/** Display-layer unit conversions. Physics code works in SI only. */

export const MS_PER_KNOT = 0.514444;
export const MS_PER_KMH = 1 / 3.6;
export const M_PER_FT = 0.3048;

export const msToKnots = (ms: number) => ms / MS_PER_KNOT;
export const knotsToMs = (kts: number) => kts * MS_PER_KNOT;
export const msToKmh = (ms: number) => ms * 3.6;
export const kmhToMs = (kmh: number) => kmh / 3.6;
export const metresToFeet = (m: number) => m / M_PER_FT;
export const radToDeg = (rad: number) => (rad * 180) / Math.PI;
export const degToRad = (deg: number) => (deg * Math.PI) / 180;
