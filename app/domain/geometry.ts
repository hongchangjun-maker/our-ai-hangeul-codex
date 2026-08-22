import { PAGE_PRESETS, type DocumentPage } from './document';

export const CSS_PX_PER_INCH = 96;
export const MM_PER_INCH = 25.4;

export const mmToPx = (mm: number) => (mm / MM_PER_INCH) * CSS_PX_PER_INCH;
export const pxToMm = (px: number) => (px / CSS_PX_PER_INCH) * MM_PER_INCH;

export function pageGeometry(page: DocumentPage) {
  const preset = PAGE_PRESETS[page.preset];
  const portrait = page.orientation === 'portrait';
  const widthMm = portrait ? preset.widthMm : preset.heightMm;
  const heightMm = portrait ? preset.heightMm : preset.widthMm;
  return { widthMm, heightMm, widthPx: mmToPx(widthMm), heightPx: mmToPx(heightMm) };
}

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function snapCoordinate(value: number, candidates: number[], threshold = 6) {
  let nearest = value;
  let distance = threshold + 1;
  for (const candidate of candidates) {
    const nextDistance = Math.abs(value - candidate);
    if (nextDistance <= threshold && nextDistance < distance) {
      nearest = candidate;
      distance = nextDistance;
    }
  }
  return { value: nearest, snapped: distance <= threshold };
}
