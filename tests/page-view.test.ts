import { describe, expect, it } from 'vitest';
import { pageViewRange, restorePageViewMode, shouldVirtualizePage } from '../app/editor/page-view';

describe('page view preferences', () => {
  it('restores only a supported page view mode', () => {
    expect(restorePageViewMode('spread')).toBe('spread');
    expect(restorePageViewMode('unknown')).toBe('single');
    expect(restorePageViewMode(null)).toBe('single');
  });

  it('labels the current two-page spread without exceeding the last page', () => {
    expect(pageViewRange(0, 8)).toBe('1–2쪽');
    expect(pageViewRange(3, 8)).toBe('3–4쪽');
    expect(pageViewRange(4, 5)).toBe('5쪽');
  });

  it('keeps only nearby pages live and restores every page for output', () => {
    expect(shouldVirtualizePage(300, 149, 149)).toBe(false);
    expect(shouldVirtualizePage(300, 149, 151)).toBe(false);
    expect(shouldVirtualizePage(300, 149, 152)).toBe(true);
    expect(shouldVirtualizePage(300, 149, 299)).toBe(true);
    expect(shouldVirtualizePage(300, 149, 299, true)).toBe(false);
    expect(shouldVirtualizePage(20, 0, 19)).toBe(false);
  });
});
