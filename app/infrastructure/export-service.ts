import type { DocumentObject, EditorDocument, RichTextDocument } from '../domain/document';
import type { ParagraphChild, TextRun as DocxTextRun } from 'docx';
import { pageGeometry } from '../domain/geometry';
import { downloadBlob } from './download';
import { buildHwpxBlob } from './hwpx-export';
import { getAsset } from './local-storage';
import { normalizedCrop } from '../domain/image-quality';

function safeName(name: string) {
  return (name.trim() || '새 문서').replace(/[\\/:*?"<>|]/g, '_');
}

function textFromNode(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const value = node as { type?: string; text?: string; content?: unknown[] };
  if (value.type === 'text') return value.text ?? '';
  const content = value.content?.map(textFromNode).join('') ?? '';
  return ['paragraph', 'heading', 'listItem', 'tableRow'].includes(value.type ?? '') ? `${content}\n` : content;
}

type RichTextNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
  content?: RichTextNode[];
};

function nodeFontFamilies(node: unknown, result: Set<string>) {
  if (!node || typeof node !== 'object') return;
  const value = node as RichTextNode;
  for (const mark of value.marks ?? []) {
    const family = mark.type === 'textStyle' ? mark.attrs?.fontFamily : undefined;
    if (typeof family === 'string' && family) result.add(family);
  }
  value.content?.forEach((child) => nodeFontFamilies(child, result));
}

export function collectDocumentFontFamilies(document: EditorDocument) {
  const families = new Set<string>([document.settings.defaultFont, document.settings.headingFont]);
  document.pages.forEach((page) => nodeFontFamilies(page.textFlow, families));
  return [...families].filter(Boolean);
}

export function documentToText(document: EditorDocument) {
  return document.pages.map((page, index) => `${document.pages.length > 1 ? `[${index + 1}쪽]\n` : ''}${textFromNode(page.textFlow)}`.trim()).join('\n\n');
}

export async function buildSourceBlob(document: EditorDocument) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  zip.file('mimetype', 'application/vnd.our-ai-hangeul+zip', { compression: 'STORE' });
  zip.file('document.json', JSON.stringify(document));
  const assetIds = [...new Set(document.pages.flatMap((page) => page.objects.map((object) => object.assetId).filter((id): id is string => Boolean(id))))];
  for (const id of assetIds) {
    const asset = await getAsset(id);
    if (asset) zip.file(`assets/${id}`, asset.blob, { compression: 'STORE' });
  }
  zip.file('manifest.json', JSON.stringify({ format: 'our-ai-hangeul-source-v2', document: 'document.json', assets: assetIds }));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export async function exportSource(document: EditorDocument) {
  downloadBlob(await buildSourceBlob(document), `${safeName(document.name)}.oah`);
}

export function exportText(document: EditorDocument) {
  downloadBlob(new Blob([documentToText(document)], { type: 'text/plain;charset=utf-8' }), `${safeName(document.name)}.txt`);
}

type DocumentBlock = { text: string; heading?: number; bullet?: boolean; pageBreak?: boolean };

function documentBlocks(document: EditorDocument): DocumentBlock[] {
  return document.pages.flatMap((page, pageIndex) => {
    const root = page.textFlow as RichTextNode;
    const blocks = (root.content ?? []).map((node) => ({
      text: textFromNode(node).trim(),
      heading: node.type === 'heading' ? Number(node.attrs?.level ?? 1) : undefined,
      bullet: node.type === 'bulletList' || node.type === 'orderedList',
    })).filter((block) => block.text);
    return pageIndex && blocks.length ? [{ text: '', pageBreak: true }, ...blocks] : blocks;
  });
}

export function exportMarkdown(document: EditorDocument) {
  const markdown = documentBlocks(document).map((block) => block.pageBreak ? '\n---\n' : `${block.heading ? `${'#'.repeat(Math.min(3, block.heading))} ` : block.bullet ? '- ' : ''}${block.text}`).join('\n\n');
  downloadBlob(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }), `${safeName(document.name)}.md`);
}

function rtfEscape(value: string) {
  return Array.from(value).map((character) => {
    if (character === '\\' || character === '{' || character === '}') return `\\${character}`;
    const code = character.codePointAt(0) ?? 0;
    return code > 127 ? `\\u${code > 32_767 ? code - 65_536 : code}?` : character;
  }).join('');
}

export function exportRtf(document: EditorDocument) {
  const body = documentBlocks(document).map((block) => block.pageBreak ? '\\page' : `${block.heading ? `\\b\\fs${32 - (block.heading - 1) * 4} ` : ''}${rtfEscape(block.bullet ? `• ${block.text}` : block.text)}${block.heading ? '\\b0\\fs22' : ''}\\par`).join('\n');
  downloadBlob(new Blob([`{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\\viewkind4\\uc1\\pard\\f0\\fs22\n${body}\n}`], { type: 'application/rtf' }), `${safeName(document.name)}.rtf`);
}

function escapeXml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;' })[character] ?? character);
}

async function packageDownload(files: Array<{ name: string; content: string; store?: boolean }>, filename: string, type: string) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  files.forEach((file) => zip.file(file.name, file.content, { compression: file.store ? 'STORE' : 'DEFLATE' }));
  const archive = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  downloadBlob(new Blob([archive], { type }), filename);
}

export async function exportOdt(document: EditorDocument) {
  const body = documentBlocks(document).map((block) => block.pageBreak ? '<text:p text:style-name="PageBreak"/>' : block.heading ? `<text:h text:outline-level="${Math.min(3, block.heading)}">${escapeXml(block.text)}</text:h>` : `<text:p>${escapeXml(block.bullet ? `• ${block.text}` : block.text)}</text:p>`).join('');
  const content = `<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.3"><office:body><office:text>${body}</office:text></office:body></office:document-content>`;
  const styles = `<?xml version="1.0" encoding="UTF-8"?><office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" office:version="1.3"><office:styles/></office:document-styles>`;
  const meta = `<?xml version="1.0" encoding="UTF-8"?><office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.3"><office:meta><dc:title>${escapeXml(document.name)}</dc:title></office:meta></office:document-meta>`;
  const manifest = `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/></manifest:manifest>`;
  await packageDownload([
    { name: 'mimetype', content: 'application/vnd.oasis.opendocument.text', store: true },
    { name: 'content.xml', content }, { name: 'styles.xml', content: styles }, { name: 'meta.xml', content: meta }, { name: 'META-INF/manifest.xml', content: manifest },
  ], `${safeName(document.name)}.odt`, 'application/vnd.oasis.opendocument.text');
}

export async function exportHwpx(document: EditorDocument) {
  downloadBlob(await buildHwpxBlob(document), `${safeName(document.name)}.hwpx`);
}

export function exportHtml(document: EditorDocument, pageHtml: string[]) {
  const pages = pageHtml.map((html, index) => {
    const page = document.pages[index];
    const geometry = pageGeometry(page);
    return `<section class="page" aria-label="${index + 1}쪽" style="width:${geometry.widthMm.toFixed(1)}mm;min-height:${geometry.heightMm.toFixed(1)}mm;padding:${page.margins.top.toFixed(1)}mm ${page.margins.right.toFixed(1)}mm ${page.margins.bottom.toFixed(1)}mm ${page.margins.left.toFixed(1)}mm;">${html}</section>`;
  }).join('\n');
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(document.name)}</title><style>body{margin:0;background:#eee;font-family:"Noto Sans KR","Malgun Gothic",sans-serif}.page{box-sizing:border-box;margin:10mm auto;background:white;line-height:1.7}.page:last-of-type{page-break-after:auto;}@media print{body{background:white}.page{margin:0;page-break-after:always}}</style></head><body>${pages}</body></html>`;
  downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${safeName(document.name)}.html`);
}

function textRunsFromNode(node: RichTextNode, fallbackFont: string, TextRun: typeof DocxTextRun): ParagraphChild[] {
  if (node.type === 'text') {
    const marks = node.marks ?? [];
    const textStyle = marks.find((mark) => mark.type === 'textStyle');
    const color = textStyle?.attrs?.color;
    return [new TextRun({
      text: node.text ?? '',
      font: typeof textStyle?.attrs?.fontFamily === 'string' ? textStyle.attrs.fontFamily : fallbackFont,
      bold: marks.some((mark) => mark.type === 'bold'),
      italics: marks.some((mark) => mark.type === 'italic'),
      strike: marks.some((mark) => mark.type === 'strike'),
      color: typeof color === 'string' ? color.replace('#', '') : undefined,
    })];
  }
  return (node.content ?? []).flatMap((child) => textRunsFromNode(child, fallbackFont, TextRun));
}

function tableFromRichNode(node: RichTextNode, docx: typeof import('docx'), fallbackFont: string) {
  const rows = (node.content ?? []).filter((row) => row.type === 'tableRow').map((row) => new docx.TableRow({ children: (row.content ?? []).map((cell) => new docx.TableCell({
    columnSpan: Number(cell.attrs?.colspan ?? 1),
    shading: cell.type === 'tableHeader' ? { fill: 'E9F4F0' } : undefined,
    children: (cell.content ?? []).map((paragraph) => new docx.Paragraph({ children: textRunsFromNode(paragraph, fallbackFont, docx.TextRun) })) || [new docx.Paragraph('')],
  })) }));
  return new docx.Table({ rows, width: { size: 100, type: docx.WidthType.PERCENTAGE } });
}

function pageFieldRuns(document: EditorDocument, docx: typeof import('docx')) {
  const format = document.settings.pageNumber.format;
  const current = new docx.TextRun({ children: [docx.PageNumber.CURRENT] });
  if (format === 'dash') return [new docx.TextRun('- '), current, new docx.TextRun(' -')];
  if (format === 'page-of-total') return [current, new docx.TextRun(' / 전체 '), new docx.TextRun({ children: [docx.PageNumber.TOTAL_PAGES] })];
  return [current];
}

export async function buildDocxBlob(document: EditorDocument) {
  const docx = await import('docx');
  const { Document, HeadingLevel, Packer, Paragraph, TextRun } = docx;
  const sections = await Promise.all(document.pages.map(async (page) => {
    const geometry = pageGeometry(page);
    const root = page.textFlow as RichTextNode;
    const children: import('docx').FileChild[] = (root.content ?? []).flatMap((node) => {
      if (node.type === 'table') return [tableFromRichNode(node, docx, document.settings.defaultFont)];
      if (node.type === 'heading') {
        const level = Number(node.attrs?.level ?? 1);
        const heading = level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
        return [new Paragraph({ heading, children: textRunsFromNode(node, document.settings.headingFont, TextRun) })];
      }
      if (node.type === 'paragraph' || node.type === 'blockquote') {
        return [new Paragraph({ children: textRunsFromNode(node, document.settings.defaultFont, TextRun) })];
      }
      const text = textFromNode(node).trim();
      return text ? [new Paragraph({ children: [new TextRun({ text, font: document.settings.defaultFont })] })] : [];
    });
    for (const object of page.objects) {
      if (object.type === 'image' && object.assetId) {
        const asset = await getAsset(object.assetId);
        const imageType = asset?.mediaType === 'image/png' ? 'png' : asset?.mediaType === 'image/gif' ? 'gif' : asset?.mediaType === 'image/bmp' ? 'bmp' : asset?.mediaType === 'image/jpeg' ? 'jpg' : null;
        if (asset && imageType) children.push(new Paragraph({ children: [new docx.ImageRun({ type: imageType, data: await asset.blob.arrayBuffer(), transformation: { width: Math.max(20, Math.round(object.width)), height: Math.max(20, Math.round(object.height)), flip: { horizontal: object.flipX, vertical: object.flipY }, rotation: object.rotation }, altText: { title: object.name || '삽입 이미지', description: object.name || '삽입 이미지', name: object.name || 'image' } })] }));
      } else if (object.type === 'text-box') {
        children.push(new docx.Table({ rows: [new docx.TableRow({ children: [new docx.TableCell({ shading: { fill: object.style?.background?.replace('#', '') || 'F7FAF9' }, children: [new Paragraph({ children: [new TextRun({ text: object.text || '', font: document.settings.defaultFont })] })] })] })], width: { size: Math.min(100, Math.max(15, Math.round((object.width / geometry.widthPx) * 100))), type: docx.WidthType.PERCENTAGE } }));
      }
    }
    const alignment = document.settings.pageNumber.position.endsWith('right') ? docx.AlignmentType.RIGHT : docx.AlignmentType.CENTER;
    const headerChildren = [new Paragraph({ alignment: document.settings.pageNumber.position === 'header-right' ? docx.AlignmentType.RIGHT : docx.AlignmentType.LEFT, children: [new TextRun(page.header ?? ''), ...(document.settings.pageNumber.enabled && document.settings.pageNumber.position === 'header-right' ? pageFieldRuns(document, docx) : [])] })];
    const footerChildren = [new Paragraph({ alignment, children: [new TextRun(page.footer ?? ''), ...(document.settings.pageNumber.enabled && document.settings.pageNumber.position.startsWith('footer') ? pageFieldRuns(document, docx) : [])] })];
    return {
      headers: { default: new docx.Header({ children: headerChildren }) },
      footers: { default: new docx.Footer({ children: footerChildren }) },
      properties: {
        page: {
          pageNumbers: { start: document.settings.pageNumber.start },
          size: { width: Math.round(geometry.widthMm * 56.7), height: Math.round(geometry.heightMm * 56.7) },
          margin: {
            top: Math.round(page.margins.top * 56.7),
            right: Math.round(page.margins.right * 56.7),
            bottom: Math.round(page.margins.bottom * 56.7),
            left: Math.round(page.margins.left * 56.7),
          },
        },
      },
      children: children.length ? children : [new Paragraph({ children: [new TextRun({ text: '', font: document.settings.defaultFont })] })],
    };
  }));
  const file = new Document({ sections });
  const base = await Packer.toBlob(file);
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(base);
  zip.file('customXml/our-ai-document.json', JSON.stringify({ format: 'our-ai-hangeul-objects-v1', pages: document.pages.map((page) => ({ objects: page.objects })) }));
  for (const page of document.pages) for (const object of page.objects) if (object.assetId) { const asset = await getAsset(object.assetId); if (asset) zip.file(`customXml/assets/${object.assetId}`, asset.blob, { compression: 'STORE' }); }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export async function exportDocx(document: EditorDocument) {
  downloadBlob(await buildDocxBlob(document), `${safeName(document.name)}.docx`);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

async function pdfImageData(blob: Blob, object: DocumentObject) {
  const crop = normalizedCrop(object);
  const directFormat = blob.type === 'image/png' ? 'PNG' : blob.type === 'image/jpeg' ? 'JPEG' : blob.type === 'image/webp' ? 'WEBP' : blob.type === 'image/gif' ? 'GIF' : null;
  const transformed = Boolean(object.flipX || object.flipY || crop.x || crop.y || crop.width < 1 || crop.height < 1);
  if (!transformed) return directFormat ? { bytes: new Uint8Array(await blob.arrayBuffer()), format: directFormat } : null;
  if (typeof createImageBitmap !== 'function') return null;
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  try {
    const sourceX = Math.round(bitmap.width * crop.x); const sourceY = Math.round(bitmap.height * crop.y);
    const sourceWidth = Math.max(1, Math.round(bitmap.width * crop.width)); const sourceHeight = Math.max(1, Math.round(bitmap.height * crop.height));
    const canvas = globalThis.document.createElement('canvas'); canvas.width = sourceWidth; canvas.height = sourceHeight;
    const context = canvas.getContext('2d'); if (!context) return null;
    context.save(); context.translate(object.flipX ? sourceWidth : 0, object.flipY ? sourceHeight : 0); context.scale(object.flipX ? -1 : 1, object.flipY ? -1 : 1);
    context.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight); context.restore();
    const output = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png', 1));
    return output ? { bytes: new Uint8Array(await output.arrayBuffer()), format: 'PNG' } : null;
  } finally { bitmap.close(); }
}

export async function exportPdf(document: EditorDocument, pages: { page: HTMLElement; pageIndex: number }[], onProgress?: (message: string) => void) {
  if (!pages.length) throw new Error('내보낼 페이지를 찾지 못했습니다.');
  onProgress?.('PDF 페이지를 준비하는 중…');
  await globalThis.document.fonts?.ready;
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const pageInfos = pages.map(({ pageIndex }) => {
    const page = document.pages[pageIndex];
    if (!page) throw new Error('페이지 정보를 찾지 못했습니다.');
    const geometry = pageGeometry(page);
    return { geometry, pageIndex };
  });
  const first = pageInfos[0];
  const pdf = new jsPDF({ orientation: first.geometry.widthMm >= first.geometry.heightMm ? 'landscape' : 'portrait', unit: 'mm', format: [first.geometry.widthMm, first.geometry.heightMm], compress: true });
  for (let index = 0; index < pages.length; index += 1) {
    const { page } = pages[index];
    const { geometry } = pageInfos[index];
    onProgress?.(`${index + 1}/${pages.length}쪽을 변환하는 중…`);
    const canvas = await html2canvas(page, { scale: Math.max(2, globalThis.devicePixelRatio || 1), useCORS: true, backgroundColor: '#ffffff', logging: false, ignoreElements: (element) => element instanceof HTMLElement && element.dataset.pdfNative === 'true' });
    const pixelToMm = (value: number) => (value / 96) * 25.4;
    const widthMm = pixelToMm(canvas.width);
    const heightMm = pixelToMm(canvas.height);
    if (index > 0) {
      pdf.addPage([geometry.widthMm, geometry.heightMm], geometry.widthMm >= geometry.heightMm ? 'landscape' : 'portrait');
    }
    const ratio = Math.min(geometry.widthMm / widthMm, geometry.heightMm / heightMm);
    const width = widthMm * ratio;
    const height = heightMm * ratio;
    const left = (geometry.widthMm - width) / 2;
    const image = canvas.toDataURL('image/png');
    pdf.addImage(image, 'PNG', Math.max(0, left), 0, width, height, undefined, 'NONE');
    const sourcePage = document.pages[pageInfos[index].pageIndex];
    for (const object of sourcePage.objects.filter((item) => item.type === 'image' && item.assetId).sort((leftObject, rightObject) => leftObject.zIndex - rightObject.zIndex)) {
      const asset = await getAsset(object.assetId!);
      if (!asset) continue;
      const imageData = await pdfImageData(asset.blob, object); if (!imageData) continue;
      pdf.addImage(imageData.bytes, imageData.format, object.x / geometry.widthPx * geometry.widthMm, object.y / geometry.heightPx * geometry.heightMm, object.width / geometry.widthPx * geometry.widthMm, object.height / geometry.heightPx * geometry.heightMm, undefined, 'NONE', object.rotation);
    }
  }
  pdf.save(`${safeName(document.name)}.pdf`);
  onProgress?.('PDF 저장이 완료되었습니다.');
}

export async function exportPng(document: EditorDocument, pages: { page: HTMLElement; pageIndex: number }[], onProgress?: (message: string) => void) {
  if (!pages.length) throw new Error('내보낼 페이지를 찾지 못했습니다.');
  const [{ default: html2canvas }, { default: JSZip }] = await Promise.all([import('html2canvas'), import('jszip')]);
  const zip = new JSZip();
  for (let index = 0; index < pages.length; index += 1) {
    const { page, pageIndex } = pages[index]; const sourcePage = document.pages[pageIndex]; const geometry = pageGeometry(sourcePage);
    onProgress?.(`${index + 1}/${pages.length}쪽을 300 DPI PNG로 만드는 중…`);
    const canvas = await html2canvas(page, { scale: 300 / 96, useCORS: true, backgroundColor: '#ffffff', logging: false, ignoreElements: (element) => element instanceof HTMLElement && element.dataset.pdfNative === 'true' });
    const context = canvas.getContext('2d'); const scaleX = canvas.width / geometry.widthPx; const scaleY = canvas.height / geometry.heightPx;
    if (context && typeof createImageBitmap === 'function') for (const object of sourcePage.objects.filter((item) => item.type === 'image' && item.assetId).sort((a, b) => a.zIndex - b.zIndex)) {
      const asset = await getAsset(object.assetId!); if (!asset) continue;
      const bitmap = await createImageBitmap(asset.blob, { imageOrientation: 'from-image' });
      try {
        const crop = normalizedCrop(object); const sx = bitmap.width * crop.x; const sy = bitmap.height * crop.y; const sw = bitmap.width * crop.width; const sh = bitmap.height * crop.height;
        const width = object.width * scaleX; const height = object.height * scaleY; const centerX = (object.x + object.width / 2) * scaleX; const centerY = (object.y + object.height / 2) * scaleY;
        context.save(); context.translate(centerX, centerY); context.rotate(object.rotation * Math.PI / 180); context.scale(object.flipX ? -1 : 1, object.flipY ? -1 : 1); context.drawImage(bitmap, sx, sy, sw, sh, -width / 2, -height / 2, width, height); context.restore();
      } finally { bitmap.close(); }
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png', 1)); if (!blob) throw new Error('PNG 이미지를 만들지 못했습니다.');
    if (pages.length === 1) { downloadBlob(blob, `${safeName(document.name)}.png`); onProgress?.('300 DPI PNG 저장이 완료되었습니다.'); return; }
    zip.file(`${String(index + 1).padStart(3, '0')}쪽.png`, blob, { compression: 'STORE' });
  }
  downloadBlob(await zip.generateAsync({ type: 'blob', compression: 'STORE' }), `${safeName(document.name)}-PNG.zip`);
  onProgress?.('모든 페이지의 300 DPI PNG 저장이 완료되었습니다.');
}

export function richTextToPlainText(value: RichTextDocument) {
  return textFromNode(value).trim();
}
