import { describe, expect, it } from 'vitest';
import { createDocument, createPage } from '../app/domain/document';
import { applyPageLayout, normalizePageMargins } from '../app/domain/page-layout';

describe('page layout application', () => {
  it('applies exact A4 portrait dimensions and margins to every page', () => {
    const document = createDocument();
    document.pages.push(createPage(undefined, 'A5'));
    const margins = { top: 20, right: 18, bottom: 20, left: 18 };
    const next = applyPageLayout(document, 1, 'all', 'A4', 'portrait', margins);

    expect(next.pages).toHaveLength(2);
    for (const page of next.pages) {
      expect(page.preset).toBe('A4');
      expect(page.orientation).toBe('portrait');
      expect(page.margins).toEqual(margins);
    }
  });

  it('can change only the selected page', () => {
    const document = createDocument();
    document.pages.push(createPage());
    const next = applyPageLayout(document, 1, 'current', 'B5', 'landscape', { top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 });

    expect(next.pages[0].preset).toBe('A4');
    expect(next.pages[1].preset).toBe('B5');
    expect(next.pages[1].orientation).toBe('landscape');
  });

  it('keeps a minimum editable area when supplied margins exceed the paper', () => {
    expect(normalizePageMargins('A5', 'portrait', { top: 500, right: 500, bottom: 500, left: 500 })).toEqual({
      top: 198,
      right: 0,
      bottom: 0,
      left: 136,
    });
  });
});
