import { describe, expect, it } from 'vitest';
import { createDocument, duplicatePage, migrateDocument } from '../app/domain/document';
import { fitPageObjects, pageGeometry } from '../app/domain/geometry';

describe('document domain', () => {
  it('creates a versioned A4 document from each first-run template', () => {
    const report = createDocument('report');
    expect(report.formatVersion).toBe('1.2.0');
    expect(report.settings.pageNumber).toEqual({ enabled: true, start: 1, position: 'footer-center', format: 'number' });
    expect(report.settings.documentStyleId).toBe('modern');
    expect(report.pages).toHaveLength(1);
    expect(report.pages[0].preset).toBe('A4');
    expect(report.pages[0].objects).toEqual([]);
    expect(report.pages[0].textFlow.content?.length).toBeGreaterThan(2);
  });

  it('duplicates a page without reusing page or object ids', () => {
    const document = createDocument();
    document.pages[0].objects.push({ id: 'image-1', type: 'image', x: 1, y: 2, width: 100, height: 80, rotation: 0, zIndex: 1, locked: false, opacity: 1 });
    const copy = duplicatePage(document.pages[0]);
    expect(copy.id).not.toBe(document.pages[0].id);
    expect(copy.objects[0].id).not.toBe('image-1');
    expect(copy.objects[0].x).toBe(1);
  });

  it('rejects unknown document versions instead of guessing a migration', () => {
    const document = { ...createDocument(), formatVersion: '9.0.0' };
    expect(() => migrateDocument(document)).toThrow('지원하지 않는 문서 버전');
  });

  it('migrates a 1.0 document with a safe default document style', () => {
    const document = createDocument();
    const legacySettings = Object.fromEntries(Object.entries(document.settings).filter(([key]) => !['headingFont', 'headingColor', 'lineHeight', 'documentStyleId'].includes(key)));
    const migrated = migrateDocument({ ...document, formatVersion: '1.0.0', settings: legacySettings });
    expect(migrated.formatVersion).toBe('1.2.0');
    expect(migrated.settings.documentStyleId).toBe('modern');
    expect(migrated.settings.headingFont).toBe('Pretendard');
  });

  it('migrates 1.1 documents with page numbering defaults', () => {
    const document = createDocument();
    const settings = Object.fromEntries(Object.entries(document.settings).filter(([key]) => key !== 'pageNumber'));
    const migrated = migrateDocument({ ...document, formatVersion: '1.1.0', settings });
    expect(migrated.settings.pageNumber.start).toBe(1);
  });

  it('applies administrator defaults only to new documents', () => {
    const document = createDocument('blank', { defaultFont: 'SUIT', autosaveDelayMs: 2000 });
    expect(document.settings.defaultFont).toBe('SUIT');
    expect(document.settings.autosaveDelayMs).toBe(2000);
  });

  it('rejects malformed current documents before page geometry can crash', () => {
    const document = createDocument();
    expect(() => migrateDocument({ ...document, pages: [{ ...document.pages[0], preset: 'UNKNOWN' }] })).toThrow('페이지 데이터');
    expect(() => migrateDocument({ ...document, pages: [{ ...document.pages[0], objects: [{ id: 'bad', type: 'shape', x: Number.NaN }] }] })).toThrow('개체 데이터');
  });

  it('keeps free objects inside a resized or rotated page', () => {
    const page = createDocument().pages[0];
    page.preset = 'A5';
    page.objects = [{ id: 'shape', type: 'shape', x: 900, y: -10, width: 900, height: 1200, rotation: 0, zIndex: 1, locked: false, opacity: 1 }];
    const fitted = fitPageObjects(page);
    const geometry = pageGeometry(fitted);
    expect(fitted.objects[0].x).toBeGreaterThanOrEqual(0);
    expect(fitted.objects[0].y).toBeGreaterThanOrEqual(0);
    expect(fitted.objects[0].x + fitted.objects[0].width).toBeLessThanOrEqual(geometry.widthPx);
    expect(fitted.objects[0].y + fitted.objects[0].height).toBeLessThanOrEqual(geometry.heightPx);
  });
});
