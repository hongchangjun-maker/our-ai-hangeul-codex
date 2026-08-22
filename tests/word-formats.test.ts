import { Document, Packer, Paragraph } from 'docx';
import JSZip from 'jszip';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { createDocument } from '../app/domain/document';
import { exportHwpx, exportOdt } from '../app/infrastructure/export-service';
import { importFile } from '../app/infrastructure/file-import';

const downloadBlobs: Blob[] = [];
const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: (blob: Blob) => { downloadBlobs.push(blob); return `blob:test-${downloadBlobs.length}`; } });
Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => undefined });
vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

afterEach(() => { downloadBlobs.length = 0; });

function importedText(result: Awaited<ReturnType<typeof importFile>>) {
  expect(result.kind).toBe('document');
  if (result.kind !== 'document') return '';
  return JSON.stringify(result.document.pages[0].textFlow);
}

describe('word document format boundary', () => {
  it('imports DOCX body text through the browser conversion path', async () => {
    const docx = new Document({ sections: [{ children: [new Paragraph('DOCX 문서 본문')] }] });
    const file = new File([await Packer.toBlob(docx)], 'example.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    expect(importedText(await importFile(file))).toContain('DOCX 문서 본문');
  });

  it('imports a standards-shaped HWPX text section', async () => {
    const zip = new JSZip();
    zip.file('mimetype', 'application/hwp+zip');
    zip.file('Contents/section0.xml', '<?xml version="1.0"?><hs:sec xmlns:hs="http://www.owpml.org/owpml/2021/section" xmlns:hp="http://www.owpml.org/owpml/2021/paragraph"><hp:p><hp:run><hp:t>HWPX 본문</hp:t></hp:run></hp:p></hs:sec>');
    const file = new File([await zip.generateAsync({ type: 'blob' })], 'example.hwpx', { type: 'application/hwp+zip' });
    expect(importedText(await importFile(file))).toContain('HWPX 본문');
  });

  it('imports ODT, RTF, HTML, and Markdown text without executing markup', async () => {
    const zip = new JSZip();
    zip.file('mimetype', 'application/vnd.oasis.opendocument.text');
    zip.file('content.xml', '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text><text:h>ODT 제목</text:h><text:p>ODT 본문</text:p></office:text></office:body></office:document-content>');
    const odt = new File([await zip.generateAsync({ type: 'blob' })], 'example.odt', { type: 'application/vnd.oasis.opendocument.text' });
    expect(importedText(await importFile(odt))).toContain('ODT 본문');
    expect(importedText(await importFile(new File(['{\\rtf1\\ansi RTF 본문\\par}'], 'example.rtf')))).toContain('RTF 본문');
    const html = importedText(await importFile(new File(['<h1>HTML 제목</h1><script>bad()</script><p>HTML 본문</p><table><tr><td>표 셀</td></tr></table>'], 'example.html', { type: 'text/html' })));
    expect(html).toContain('HTML 본문');
    expect(html).toContain('표 셀');
    expect(importedText(await importFile(new File(['# Markdown 제목\n\n- Markdown 본문'], 'example.md', { type: 'text/markdown' })))).toContain('Markdown 본문');
  });

  it('writes HWPX and ODT ZIP packages that can be read back by the app', async () => {
    const document = createDocument('report');
    document.name = '왕복 검증';
    await exportHwpx(document);
    await exportOdt(document);
    expect(downloadBlobs).toHaveLength(2);
    const hwpxZip = await JSZip.loadAsync(await downloadBlobs[0].arrayBuffer());
    const odtZip = await JSZip.loadAsync(await downloadBlobs[1].arrayBuffer());
    expect(await hwpxZip.file('mimetype')?.async('text')).toBe('application/hwp+zip');
    expect(hwpxZip.file('Contents/section0.xml')).toBeTruthy();
    expect(await odtZip.file('mimetype')?.async('text')).toBe('application/vnd.oasis.opendocument.text');
    expect(importedText(await importFile(new File([downloadBlobs[0]], 'roundtrip.hwpx')))).toContain('보고서 제목');
    expect(importedText(await importFile(new File([downloadBlobs[1]], 'roundtrip.odt')))).toContain('보고서 제목');
  });
});

afterAll(() => {
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreateObjectUrl });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevokeObjectUrl });
});
