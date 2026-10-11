import { interp1, interp2 } from './interpolate';

describe('interp1', () => {
  const xs = [0, 1, 3];
  const ys = [10, 20, 0];

  it('interpolates linearly within an uneven segment', () => {
    // Between (1, 20) and (3, 0): halfway is 10, a quarter of the way is 15.
    expect(interp1(xs, ys, 2)).toBeCloseTo(10);
    expect(interp1(xs, ys, 1.5)).toBeCloseTo(15);
    expect(interp1(xs, ys, 0.25)).toBeCloseTo(12.5);
  });

  it('returns exact table values at the knots', () => {
    expect(interp1(xs, ys, 0)).toBe(10);
    expect(interp1(xs, ys, 1)).toBe(20);
    expect(interp1(xs, ys, 3)).toBe(0);
  });

  it('clamps instead of extrapolating outside the table', () => {
    expect(interp1(xs, ys, -5)).toBe(10);
    expect(interp1(xs, ys, 99)).toBe(0);
  });

  it('rejects mismatched tables', () => {
    expect(() => interp1([0, 1], [1], 0.5)).toThrow();
    expect(() => interp1([], [], 0)).toThrow();
  });
});

describe('interp2', () => {
  // value = 100·row + col², sampled on an uneven grid.
  const rows = [0, 2];
  const cols = [0, 1, 4];
  const table = [
    [0, 1, 16],
    [200, 201, 216],
  ];

  it('interpolates bilinearly between grid cells', () => {
    // row 1 is halfway between rows; col 2.5 is halfway between col 1 (1) and col 4 (16) → 8.5.
    expect(interp2(rows, cols, table, 1, 2.5)).toBeCloseTo(100 + 8.5);
    // row 0.5 is a quarter of the way; col 0.5 → 0.5 on row 0, 200.5 on row 2.
    expect(interp2(rows, cols, table, 0.5, 0.5)).toBeCloseTo(0.5 + 0.25 * 200);
  });

  it('clamps on both axes', () => {
    expect(interp2(rows, cols, table, -1, -1)).toBe(0);
    expect(interp2(rows, cols, table, 10, 10)).toBe(216);
  });

  it('rejects tables whose shape does not match the axes', () => {
    expect(() => interp2(rows, cols, [[0, 1, 16]], 1, 1)).toThrow();
    expect(() =>
      interp2(
        rows,
        cols,
        [
          [0, 1],
          [2, 3],
        ],
        1,
        1,
      ),
    ).toThrow();
  });
});
