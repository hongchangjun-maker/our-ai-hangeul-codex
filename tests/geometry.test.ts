import { describe, expect, it } from 'vitest';
import { createPage } from '../app/domain/document';
import { mmToPx, pageGeometry, pxToMm, snapCoordinate } from '../app/domain/geometry';

describe('page geometry', () => {
  it('uses one reversible mm/px policy', () => {
    expect(mmToPx(25.4)).toBeCloseTo(96, 8);
    expect(pxToMm(mmToPx(210))).toBeCloseTo(210, 8);
  });

  it('projects A4 portrait and landscape from the same preset', () => {
    const portrait = createPage();
    const landscape = { ...portrait, orientation: 'landscape' as const };
    expect(pageGeometry(portrait).widthMm).toBe(210);
    expect(pageGeometry(portrait).heightMm).toBe(297);
    expect(pageGeometry(landscape).widthMm).toBe(297);
    expect(pageGeometry(landscape).heightMm).toBe(210);
  });

  it('snaps only inside the guide threshold', () => {
    expect(snapCoordinate(97, [100], 4)).toEqual({ value: 100, snapped: true });
    expect(snapCoordinate(94, [100], 4)).toEqual({ value: 94, snapped: false });
  });
});
