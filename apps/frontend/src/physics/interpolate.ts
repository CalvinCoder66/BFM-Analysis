/**
 * Table interpolation used for Mach- and altitude-dependent aircraft data.
 * Inputs outside the table range are clamped to the nearest edge (no extrapolation).
 */

function bracket(xs: readonly number[], x: number): { i: number; t: number } {
  const last = xs.length - 1;
  if (x <= (xs[0] as number)) return { i: 0, t: 0 };
  if (x >= (xs[last] as number)) return { i: Math.max(last - 1, 0), t: last === 0 ? 0 : 1 };
  let i = 0;
  while (x > (xs[i + 1] as number)) i++;
  const x0 = xs[i] as number;
  const x1 = xs[i + 1] as number;
  return { i, t: (x - x0) / (x1 - x0) };
}

/** Linear interpolation of `ys` over strictly increasing `xs`. */
export function interp1(xs: readonly number[], ys: readonly number[], x: number): number {
  if (xs.length === 0 || xs.length !== ys.length) {
    throw new Error(`interp1: xs (${xs.length}) and ys (${ys.length}) must be non-empty and equal`);
  }
  if (xs.length === 1) return ys[0] as number;
  const { i, t } = bracket(xs, x);
  const y0 = ys[i] as number;
  const y1 = ys[i + 1] as number;
  return y0 + (y1 - y0) * t;
}

/**
 * Bilinear interpolation over a grid where `table[row][col]` is the value at
 * (`rows[row]`, `cols[col]`).
 */
export function interp2(
  rows: readonly number[],
  cols: readonly number[],
  table: readonly (readonly number[])[],
  row: number,
  col: number,
): number {
  if (table.length !== rows.length || table.some((r) => r.length !== cols.length)) {
    throw new Error('interp2: table dimensions must match rows × cols');
  }
  if (rows.length === 1) return interp1(cols, table[0] as number[], col);
  const { i, t } = bracket(rows, row);
  const lower = interp1(cols, table[i] as number[], col);
  const upper = interp1(cols, table[i + 1] as number[], col);
  return lower + (upper - lower) * t;
}
