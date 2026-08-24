import { Document, Packer, PageBreak, Paragraph } from 'docx';
import JSZip from 'jszip';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { createDocument, createPage } from '../app/domain/document';
import { buildDocxBlob, exportHwpx, exportOdt } from '../app/infrastructure/export-service';
import { buildHwpxBlob } from '../app/infrastructure/hwpx-export';
import { importFile } from '../app/infrastructure/file-import';

const downloadBlobs: Blob[] = [];
const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: (blob: Blob) => { downloadBlobs.push(blob); return `blob:test-${downloadBlobs.length}`; } });
Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => undefined });
vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
  expect(this.isConnected).toBe(true);
});

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

  it('restores Word page markers and keeps an embedded picture on its original page', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><w:body><w:p><w:r><w:t>첫째 쪽</w:t><w:br w:type="page"/><w:lastRenderedPageBreak/><w:t>둘째 쪽</w:t><w:drawing><wp:inline><wp:extent cx="952500" cy="476250"/><wp:docPr id="1" name="둘째 쪽 그림"/><a:graphic><a:graphicData><a:blip r:embed="rId1"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`);
    zip.file('word/_rels/document.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>');
    zip.file('word/media/image1.png', new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
    const file = new File([await zip.generateAsync({ type: 'blob' })], 'pages.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const result = await importFile(file);
    expect(result.kind).toBe('document');
    if (result.kind !== 'document') return;
    expect(result.document.pages).toHaveLength(2);
    expect(JSON.stringify(result.document.pages[0].textFlow)).toContain('첫째 쪽');
    expect(JSON.stringify(result.document.pages[1].textFlow)).toContain('둘째 쪽');
    expect(result.document.pages[0].objects).toHaveLength(0);
    expect(result.document.pages[1].objects[0]).toMatchObject({ type: 'image', name: '둘째 쪽 그림' });
  });

  it('keeps text before and after a page-break-only paragraph', async () => {
    const docx = new Document({ sections: [{ children: [new Paragraph('첫째 쪽 보존'), new Paragraph({ children: [new PageBreak()] }), new Paragraph('둘째 쪽 보존')] }] });
    const file = new File([await Packer.toBlob(docx)], 'separate-break.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const result = await importFile(file);
    expect(result.kind).toBe('document');
    if (result.kind !== 'document') return;
    expect(result.document.pages).toHaveLength(2);
    expect(JSON.stringify(result.document.pages[0].textFlow)).toContain('첫째 쪽 보존');
    expect(JSON.stringify(result.document.pages[1].textFlow)).toContain('둘째 쪽 보존');
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

  it('round-trips tables, headers, footers and editable text-box metadata through DOCX and HWPX', async () => {
    const document = createDocument();
    document.pages[0].header = '회사 머리말'; document.pages[0].footer = '보안 문서';
    document.settings.pageNumber = { enabled: true, start: 7, position: 'footer-right', format: 'page-of-total' };
    document.pages[0].textFlow = { type: 'doc', content: [{ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: '항목' }] }] }, { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: '값' }] }] }] }, { type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '합계' }] }] }, { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '100' }] }] }] }] }] };
    document.pages[0].objects = [{ id: 'box-1', type: 'text-box', x: 50, y: 60, width: 220, height: 80, rotation: 0, zIndex: 4, locked: false, opacity: 1, text: '왕복 글상자' }];
    const docxBlob = await buildDocxBlob(document); const docxZip = await JSZip.loadAsync(docxBlob);
    expect(await docxZip.file('word/header1.xml')?.async('text')).toContain('회사 머리말');
    expect(await docxZip.file('word/document.xml')?.async('text')).toContain('<w:tbl>');
    const docxImported = await importFile(new File([docxBlob], 'roundtrip.docx'));
    expect(importedText(docxImported)).toContain('합계');
    if (docxImported.kind === 'document') expect(docxImported.document.pages[0].objects[0].text).toBe('왕복 글상자');
    const hwpxBlob = await buildHwpxBlob(document); const hwpxZip = await JSZip.loadAsync(hwpxBlob);
    expect(await hwpxZip.file('Contents/section0.xml')?.async('text')).toContain('<hp:tbl');
    const hwpxImported = await importFile(new File([hwpxBlob], 'roundtrip.hwpx'));
    expect(importedText(hwpxImported)).toContain('100');
    if (hwpxImported.kind === 'document') { expect(hwpxImported.document.pages[0].header).toBe('회사 머리말'); expect(hwpxImported.document.pages[0].objects[0].text).toBe('왕복 글상자'); }
  });

  it('writes a Hancom-shaped multi-section HWPX package with page layout definitions', async () => {
    const document = createDocument('report');
    document.pages.push(createPage({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '둘째 쪽' }] }] }, 'A5', 'landscape'));
    const blob = await buildHwpxBlob(document);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(8, true)).toBe(0);
    const nameLength = view.getUint16(26, true);
    expect(new TextDecoder().decode(bytes.slice(30, 30 + nameLength))).toBe('mimetype');

    const zip = await JSZip.loadAsync(bytes);
    const header = await zip.file('Contents/header.xml')!.async('text');
    const content = await zip.file('Contents/content.hpf')!.async('text');
    const firstSection = await zip.file('Contents/section0.xml')!.async('text');
    const secondSection = await zip.file('Contents/section1.xml')!.async('text');
    const version = await zip.file('version.xml')!.async('text');
    expect(zip.file('Contents/settings.xml')).toBeTruthy();
    expect(header).toContain('<hh:refList>');
    expect(header).toContain('<hh:charPr id="0"');
    expect(header).toContain('<hh:paraPr id="0"');
    expect(header).toContain('<hh:style id="0"');
    expect(content).toContain('<opf:itemref idref="section0"/>');
    expect(content).toContain('<opf:itemref idref="section1"/>');
    expect(content).not.toContain('<opf:itemref idref="header"/>');
    expect(firstSection).toContain('<hp:secPr');
    expect(firstSection).toContain('<hp:pagePr landscape="NARROWLY"');
    expect(firstSection).toContain('top="7200"');
    expect(secondSection).toContain('<hp:pagePr landscape="WIDELY"');
    expect(secondSection).toContain('둘째 쪽');
    expect(version).toContain('targetApplication="WORDPROC"');
    expect(version).toContain('http://www.hancom.co.kr/hwpml/2011/app');
    for (const path of ['META-INF/container.xml', 'META-INF/manifest.xml', 'Contents/content.hpf', 'Contents/header.xml', 'Contents/settings.xml', 'Contents/section0.xml', 'Contents/section1.xml', 'version.xml']) {
      const source = await zip.file(path)!.async('text');
      expect(new DOMParser().parseFromString(source, 'application/xml').querySelector('parsererror'), path).toBeNull();
    }
  });
});

afterAll(() => {
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreateObjectUrl });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevokeObjectUrl });
});
