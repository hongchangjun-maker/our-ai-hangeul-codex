import { describe, expect, it } from 'vitest';
import { importFile } from '../app/infrastructure/file-import';
import { getAsset } from '../app/infrastructure/local-storage';

describe('file import boundary', () => {
  it('parses quoted CSV into a table without running file content', async () => {
    const file = new File(['name,note\n"홍길동","쉼표, 포함"'], 'people.csv', { type: 'text/csv' });
    const result = await importFile(file);
    expect(result.kind).toBe('table');
    if (result.kind === 'table') expect(result.rows).toEqual([['name', 'note'], ['홍길동', '쉼표, 포함']]);
  });

  it('rejects executable SVG payloads', async () => {
    const file = new File(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], 'unsafe.svg', { type: 'image/svg+xml' });
    await expect(importFile(file)).rejects.toThrow('실행 가능한 코드');
  });

  it('stores image bytes in IndexedDB and keeps only an asset id in the document object', async () => {
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'photo.png', { type: 'image/png' });
    const result = await importFile(file, { x: 20, y: 30 });
    expect(result.kind).toBe('image');
    if (result.kind !== 'image') return;
    expect(result.object.x).toBe(20);
    expect(result.object.assetId).toBeTruthy();
    expect((await getAsset(result.object.assetId!))?.name).toBe('photo.png');
  });

  it('keeps unsupported office files as truthful attachments', async () => {
    const file = new File(['placeholder'], 'sample.hwpx', { type: 'application/zip' });
    const result = await importFile(file);
    expect(result.kind).toBe('attachment');
    if (result.kind === 'attachment') expect(result.notice).toContain('2차 호환 엔진');
  });
});
