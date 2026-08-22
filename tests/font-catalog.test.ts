import { describe, expect, it } from 'vitest';
import { APP_FONTS, ENGLISH_FONTS, FEATURED_FONT_FAMILIES, KOREAN_FONTS, isBundledFont } from '../app/editor/font-catalog';

describe('bundled font catalog', () => {
  it('keeps Korean and English families separate without duplicate entries', () => {
    expect(KOREAN_FONTS).toHaveLength(7);
    expect(ENGLISH_FONTS).toHaveLength(8);
    expect(new Set(APP_FONTS.map((font) => font.family)).size).toBe(APP_FONTS.length);
  });

  it('keeps all one-click fonts inside the bundled catalog', () => {
    expect(FEATURED_FONT_FAMILIES.every(isBundledFont)).toBe(true);
  });
});
