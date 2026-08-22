import { describe, expect, it } from 'vitest';
import { createDocument, duplicatePage, migrateDocument } from '../app/domain/document';

describe('document domain', () => {
  it('creates a versioned A4 document from each first-run template', () => {
    const report = createDocument('report');
    expect(report.formatVersion).toBe('1.0.0');
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
});
