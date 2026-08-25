import type { EditorDocument, Orientation, PageMargins, PagePreset } from './document';
import { PAGE_PRESETS } from './document';
import { clamp, fitPageObjects } from './geometry';

export type PageLayoutScope = 'current' | 'all';

const roundMm = (value: number) => Math.round(value * 10) / 10;

export function normalizePageMargins(
  preset: PagePreset,
  orientation: Orientation,
  margins: PageMargins,
): PageMargins {
  const paper = PAGE_PRESETS[preset];
  const widthMm = orientation === 'portrait' ? paper.widthMm : paper.heightMm;
  const heightMm = orientation === 'portrait' ? paper.heightMm : paper.widthMm;
  const minimumTextAreaMm = 12;
  const left = clamp(roundMm(margins.left), 0, widthMm - minimumTextAreaMm);
  const right = clamp(roundMm(margins.right), 0, widthMm - left - minimumTextAreaMm);
  const top = clamp(roundMm(margins.top), 0, heightMm - minimumTextAreaMm);
  const bottom = clamp(roundMm(margins.bottom), 0, heightMm - top - minimumTextAreaMm);
  return { top, right, bottom, left };
}

export function applyPageLayout(
  document: EditorDocument,
  currentPage: number,
  scope: PageLayoutScope,
  preset: PagePreset,
  orientation: Orientation,
  margins: PageMargins,
): EditorDocument {
  const normalizedMargins = normalizePageMargins(preset, orientation, margins);
  return {
    ...document,
    pages: document.pages.map((page, index) => {
      if (scope === 'current' && index !== currentPage) return page;
      return fitPageObjects({ ...page, preset, orientation, margins: { ...normalizedMargins }, customSizeMm: undefined, guideStyle: 'box' });
    }),
  };
}
