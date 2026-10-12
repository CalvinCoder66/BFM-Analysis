import { type PlacedLabel, placeLabels } from './labels';

// "10s" at size 2 is 3 × 2 × 0.6 = 3.6 wide and 2 tall.
const label = (id: string, x = 0, y = 0) => ({
  id,
  anchor: { x, y },
  text: '10s',
  size: 2,
  gap: 1,
});
const overlaps = (a: PlacedLabel, b: PlacedLabel) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const contains = (r: PlacedLabel, x: number, y: number) =>
  x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;

describe('placeLabels', () => {
  it('puts a label above and to the right of its point when nothing is in the way', () => {
    // Screen y runs down: above means a smaller y.
    expect(placeLabels([label('a', 10, 10)])).toEqual([
      { id: 'a', x: 11, y: 7, width: expect.closeTo(3.6, 9), height: 2 },
    ]);
  });

  it('keeps labels for nearby points apart', () => {
    const placed = placeLabels([label('a', 0, 0), label('b', 1, 0), label('c', 0, 1)]);
    for (const [i, a] of placed.entries()) {
      for (const b of placed.slice(i + 1)) expect(overlaps(a, b)).toBe(false);
    }
  });

  it('moves off a line that runs through its usual spot', () => {
    // A track running right from the point, just above it, through the above-right spot.
    const line = Array.from({ length: 40 }, (_, i) => [i * 0.25, -2] as const);
    const [placed] = placeLabels([label('a')], { points: line, padding: 0.2 });
    expect(placed).toBeDefined();
    for (const [x, y] of line) expect(contains(placed as PlacedLabel, x, y)).toBe(false);
  });

  it('stays inside the view when its point is at the edge', () => {
    const [placed] = placeLabels([label('a', 99, 50)], {
      view: { x: 0, y: 0, width: 100, height: 100 },
    });
    expect((placed?.x ?? 0) + (placed?.width ?? 0)).toBeLessThanOrEqual(100);
  });

  it('keeps clear of markers such as other dots', () => {
    // A dot sits where the above-right label would go.
    const [placed] = placeLabels([label('a')], { dots: [{ x: 2.5, y: -2, r: 0.7 }] });
    expect(contains(placed as PlacedLabel, 2.5, -2)).toBe(false);
  });
});
