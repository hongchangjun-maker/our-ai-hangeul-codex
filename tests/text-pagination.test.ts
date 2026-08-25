import { describe, expect, it } from 'vitest';
import { createPage, type RichTextDocument } from '../app/domain/document';
import { estimateRichTextHeight, paginateRichTextDocument, textPageCapacity } from '../app/domain/text-pagination';

const options = { preset: 'A4' as const, orientation: 'portrait' as const, margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 }, defaultFontSizePt: 11, lineHeight: 1.7 };
const textOf = (flow: RichTextDocument) => JSON.stringify(flow.content).match(/"text":"([^"]*)"/g)?.map((value) => JSON.parse(`{${value}}`).text).join('') ?? '';

describe('rich text page fitting', () => {
  it('moves imported paragraphs onto additional A4 pages before the input height is exceeded', () => {
    const flow: RichTextDocument = { type: 'doc', content: Array.from({ length: 80 }, (_, index) => ({ type: 'paragraph', content: [{ type: 'text', text: `${index}번째 문단은 A4 입력 영역 안에서만 표시되어야 합니다.` }] })) };
    const pages = paginateRichTextDocument(flow, options);
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) expect(estimateRichTextHeight(page, options)).toBeLessThanOrEqual(textPageCapacity(options).heightPx + 0.001);
  });

  it('splits one oversized Korean paragraph without losing text or marks', () => {
    const text = '한글문서자동쪽나누기 '.repeat(650);
    const flow: RichTextDocument = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text, marks: [{ type: 'bold' }] }] }] };
    const pages = paginateRichTextDocument(flow, options);
    expect(pages.length).toBeGreaterThan(2);
    expect(pages.map(textOf).join('')).toBe(text);
    expect(JSON.stringify(pages)).toContain('bold');
    for (const page of pages) expect(estimateRichTextHeight(page, options)).toBeLessThanOrEqual(textPageCapacity(options).heightPx + 0.001);
  });

  it('uses the selected paper and margins instead of a fixed viewport height', () => {
    const a4 = textPageCapacity(options);
    const a5Page = createPage(undefined, 'A5');
    const a5 = textPageCapacity({ ...options, preset: 'A5', margins: a5Page.margins });
    expect(a5.heightPx).toBeLessThan(a4.heightPx);
    expect(a5.widthPx).toBeLessThan(a4.widthPx);
  });
});
