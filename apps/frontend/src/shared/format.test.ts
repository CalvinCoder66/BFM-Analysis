import { formatDistance, formatPs, formatRate, formatSpeed } from './format';

describe('format', () => {
  it('formats speeds in the chosen unit', () => {
    expect(formatSpeed(250, 'kmh')).toBe('900 km/h');
    expect(formatSpeed(250, 'kts')).toBe('486 kts');
  });

  it('signs positive Ps and leaves negatives alone', () => {
    expect(formatPs(12.4)).toBe('+12 m/s');
    expect(formatPs(-77.6)).toBe('-78 m/s');
    expect(formatPs(0.2)).toBe('0 m/s');
  });

  it('shows a dash for infinite distances', () => {
    expect(formatDistance(1234.4)).toBe('1,234 m');
    expect(formatDistance(Number.POSITIVE_INFINITY)).toBe('—');
  });

  it('formats turn rates to one decimal', () => {
    expect(formatRate(21.66)).toBe('21.7°/s');
  });
});
