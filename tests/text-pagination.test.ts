import { describe, expect, it } from 'vitest';
import { createDocument, createPage, defaultMarginsForPreset, type RichTextDocument } from '../app/domain/document';
import { applyPaperPresetToAllPages, estimateRichTextHeight, paginateRichTextDocument, splitOverflowingPage, textPageCapacity } from '../app/domain/text-pagination';

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

  it('applies a selected paper preset and its margins to every page regardless of the active page', () => {
    const document = createDocument(); const firstId = document.pages[0].id;
    document.pages.push(createPage({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '둘째 쪽' }] }] }, 'A4'));
    const updated = applyPaperPresetToAllPages(document, 'A5');
    expect(updated.pages).toHaveLength(2); expect(updated.pages[0].id).toBe(firstId);
    expect(updated.pages.every((page) => page.preset === 'A5')).toBe(true);
    expect(updated.pages.every((page) => JSON.stringify(page.margins) === JSON.stringify(defaultMarginsForPreset('A5')))).toBe(true);
  });

  it('repaginates overflowing text when the whole document changes to a smaller paper size', () => {
    const document = createDocument(); const text = 'A5 전체 변환에서도 글자가 사라지면 안 됩니다. '.repeat(900);
    document.pages[0].textFlow = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
    const updated = applyPaperPresetToAllPages(document, 'A5');
    expect(updated.pages.length).toBeGreaterThan(1); expect(updated.pages.map((page) => textOf(page.textFlow)).join('')).toBe(text);
    expect(updated.pages.every((page) => page.preset === 'A5')).toBe(true);
  });

  it('inserts live overflow directly after the edited page without losing later pages or objects', () => {
    const document = createDocument();
    const originalNext = createPage({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '기존 다음 쪽' }] }] });
    document.pages[0].objects = [{ id: crypto.randomUUID(), type: 'shape', x: 20, y: 20, width: 80, height: 60, rotation: 0, zIndex: 1, locked: false, opacity: 1 }];
    document.pages.push(originalNext);
    const flow: RichTextDocument = { type: 'doc', content: Array.from({ length: 90 }, (_, index) => ({ type: 'paragraph', content: [{ type: 'text', text: `${index + 1}번째 연속 입력 문단` }] })) };
    const result = splitOverflowingPage(document, 0, flow);
    expect(result.didSplit).toBe(true);
    expect(result.nextPageIndex).toBe(result.document.pages.length - 2);
    expect(result.document.pages.at(-1)?.id).toBe(originalNext.id);
    expect(result.document.pages[0].objects).toHaveLength(1);
    expect(result.document.pages.flatMap((page) => textOf(page.textFlow)).join('')).toContain('90번째 연속 입력 문단');
  });

  it('treats null Tiptap paragraph spacing as the normal CSS paragraph margin', () => {
    const flow: RichTextDocument = { type: 'doc', content: Array.from({ length: 40 }, (_, index) => ({ type: 'paragraph', attrs: { lineHeight: null, spaceBeforePx: null, spaceAfterPx: null }, content: [{ type: 'text', text: `${index + 1}번째 문단` }] })) };
    const pages = paginateRichTextDocument(flow, options);
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) expect(estimateRichTextHeight(page, options)).toBeLessThanOrEqual(textPageCapacity(options).heightPx + 0.001);
  });
});
