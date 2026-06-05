import { describe, it, expect } from 'vitest';
import { haversineKm } from '../haversine';

describe('haversineKm', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haversineKm(43.677, -79.630, 43.677, -79.630)).toBe(0);
  });

  it('calculates distance between YYZ and NRT (~10,300 km)', () => {
    const km = haversineKm(43.677, -79.630, 35.765, 140.386);
    expect(km).toBeGreaterThan(10000);
    expect(km).toBeLessThan(11000);
  });

  it('calculates a short city distance correctly (~2 km)', () => {
    const km = haversineKm(35.689, 139.691, 35.705, 139.711);
    expect(km).toBeGreaterThan(1);
    expect(km).toBeLessThan(3);
  });
});
