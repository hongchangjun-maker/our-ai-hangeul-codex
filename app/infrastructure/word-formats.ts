import { createDocument, createPage, MAX_DOCUMENT_PAGES, type DocumentObject, type EditorDocument, type RichTextDocument } from '../domain/document';
import { paginateRichTextDocument } from '../domain/text-pagination';
import { storeAsset } from './local-storage';
import { importDocxDocument } from './docx-import';

const MAX_OFFICE_BYTES = 25 * 1024 * 1024;
const MAX_XML_TEXT_BYTES = 8 * 1024 * 1024;

type RichNode = { type: string; text?: string; attrs?: Record<string, unknown>; content?: RichNode[] };

function fileStem(name: string) {
  return name.replace(/\.[^.]+$/, '').trim() || '가져온 문서';
}

function textNode(text: string): RichNode {
  return { type: 'text' as const, text: text.slice(0, 100_000) };
}

function contentFromLines(lines: Array<{ text: string; level?: number; bullet?: boolean }>): RichTextDocument {
  const content: RichNode[] = lines.slice(0, 20_000).map((line) => {
    if (line.bullet) return { type: 'bulletList', content: [{ type: 'paragraph', content: [textNode(line.text)] }] } as RichNode;
    if (line.level) return { type: 'heading', attrs: { level: Math.min(3, Math.max(1, line.level)) }, content: [textNode(line.text)] };
    return { type: 'paragraph', content: line.text ? [textNode(line.text)] : undefined };
  });
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

function importedDocument(name: string, textFlow: RichTextDocument): EditorDocument {
  const document = createDocument('blank');
  const source = document.pages[0];
  const flows = paginateRichTextDocument(textFlow, { preset: source.preset, orientation: source.orientation, margins: source.margins, defaultFontSizePt: document.settings.defaultFontSize, lineHeight: document.settings.lineHeight, maxPages: MAX_DOCUMENT_PAGES });
  return { ...document, name: fileStem(name), pages: flows.map((flow, index) => index === 0 ? { ...source, textFlow: flow } : createPage(flow, source.preset, source.orientation, source.margins)) };
}

function xmlDocument(xml: string) {
  const parsed = new DOMParser().parseFromString(xml, 'application/xml');
  if (parsed.querySelector('parsererror')) throw new Error('문서 XML을 읽을 수 없습니다.');
  return parsed;
}

function htmlTextFlow(html: string): RichTextDocument {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const paragraphNode = (element: Element, type = 'paragraph') => { const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim(); return { type, content: text ? [textNode(text)] : undefined }; };
  const content: RichNode[] = Array.from(parsed.body.children).flatMap<RichNode>((element) => {
    const tag = element.tagName.toLowerCase();
    if (/^h[1-3]$/.test(tag)) return [{ ...paragraphNode(element, 'heading'), attrs: { level: Number(tag[1]) } }];
    if (tag === 'table') return [{ type: 'table', content: Array.from(element.querySelectorAll(':scope > thead > tr, :scope > tbody > tr, :scope > tr')).map((row, rowIndex) => ({ type: 'tableRow', content: Array.from(row.children).filter((cell) => ['TH', 'TD'].includes(cell.tagName)).map((cell) => ({ type: cell.tagName === 'TH' || rowIndex === 0 ? 'tableHeader' : 'tableCell', attrs: { colspan: Number(cell.getAttribute('colspan') || 1), rowspan: Number(cell.getAttribute('rowspan') || 1) }, content: [paragraphNode(cell)] })) })) }];
    if (tag === 'ul' || tag === 'ol') return [{ type: tag === 'ul' ? 'bulletList' : 'orderedList', content: Array.from(element.children).map((item) => ({ type: 'listItem', content: [paragraphNode(item)] })) }];
    return tag === 'p' ? [paragraphNode(element)] : [];
  });
  return { type: 'doc', content: content.length ? content : [paragraphNode(parsed.body)] } as RichTextDocument;
}

function markdownTextFlow(markdown: string): RichTextDocument {
  return contentFromLines(markdown.replace(/\r\n/g, '\n').split('\n').map((line) => {
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    const bullet = /^[-*+]\s+(.+)$/.exec(line);
    return heading ? { text: heading[2], level: heading[1].length } : bullet ? { text: bullet[1], bullet: true } : { text: line };
  }));
}

function rtfTextFlow(rtf: string): RichTextDocument {
  const text = rtf
    .replace(/\\par[d]?\b/g, '\n')
    .replace(/\\tab\b/g, '\t')
    .replace(/\\u(-?\d+)\??/g, (_, value: string) => String.fromCharCode((Number(value) + 65_536) % 65_536))
    .replace(/\\'([0-9a-fA-F]{2})/g, (_, value: string) => String.fromCharCode(Number.parseInt(value, 16)))
    .replace(/\\[a-zA-Z]+-?\d* ?|[{}]/g, '');
  return contentFromLines(text.replace(/\r\n/g, '\n').split('\n').map((line) => ({ text: line.trimEnd() })));
}

function textFlowFromXml(xml: string, headingLocalName = 'h'): RichTextDocument {
  const parsed = xmlDocument(xml);
  const lines = Array.from(parsed.getElementsByTagName('*'))
    .filter((element) => ['p', headingLocalName].includes(element.localName))
    .map((element) => ({ text: (element.textContent ?? '').replace(/\s+/g, ' ').trim(), level: element.localName === headingLocalName ? 1 : undefined }));
  return contentFromLines(lines);
}

async function zipTextEntries(file: File, required: (name: string) => boolean) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entries = Object.values(zip.files).filter((entry) => !entry.dir && required(entry.name));
  if (!entries.length) throw new Error('문서의 본문 파일을 찾지 못했습니다.');
  let total = 0;
  const output: Array<{ name: string; text: string }> = [];
  for (const entry of entries) {
    const text = await entry.async('text');
    total += text.length;
    if (total > MAX_XML_TEXT_BYTES) throw new Error('압축 해제된 문서 내용이 너무 큽니다.');
    output.push({ name: entry.name, text });
  }
  return { zip, entries: output };
}

async function hwpxTextFlow(file: File) {
  const { zip, entries } = await zipTextEntries(file, (name) => /^Contents\/section\d+\.xml$/i.test(name));
  const mimetype = await zip.file('mimetype')?.async('text');
  if (mimetype && !mimetype.startsWith('application/hwp')) throw new Error('HWPX 패키지 식별 정보가 올바르지 않습니다.');
  const content: RichNode[] = entries.sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true })).flatMap<RichNode>(({ text }) => {
    const parsed = xmlDocument(text);
    const direct = Array.from(parsed.documentElement.children);
    return direct.flatMap<RichNode>((element) => {
      if (element.localName === 'tbl') {
        const rows = Array.from(element.getElementsByTagName('*')).filter((item) => item.localName === 'tr');
        return [{ type: 'table', content: rows.map((row, rowIndex) => ({ type: 'tableRow', content: Array.from(row.children).filter((cell) => cell.localName === 'tc').map((cell) => ({ type: rowIndex === 0 || cell.getAttribute('header') === '1' ? 'tableHeader' : 'tableCell', attrs: { colspan: Number(Array.from(cell.getElementsByTagName('*')).find((item) => item.localName === 'cellSpan')?.getAttribute('colSpan') || 1) }, content: [{ type: 'paragraph', content: cell.textContent?.trim() ? [textNode(cell.textContent.trim())] : undefined }] })) })) }];
      }
      if (element.localName !== 'p') return [];
      const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
      return text ? [{ type: 'paragraph', content: [textNode(text)] }] : [];
    });
  });
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] } as RichTextDocument;
}

async function restoreObjectMetadata(file: File, extension: string, document: EditorDocument) {
  if (!['docx', 'hwpx'].includes(extension)) return document;
  const { default: JSZip } = await import('jszip'); const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const metadataPath = extension === 'docx' ? 'customXml/our-ai-document.json' : 'Contents/our-ai-document.json';
  const metadataText = await zip.file(metadataPath)?.async('text'); if (!metadataText) return document;
  const metadata = JSON.parse(metadataText) as { format?: string; settings?: EditorDocument['settings']['pageNumber']; pages?: Array<{ header?: string; footer?: string; objects?: DocumentObject[] }> };
  if (metadata.format !== 'our-ai-hangeul-objects-v1' || !Array.isArray(metadata.pages)) return document;
  if (metadata.pages.length > MAX_DOCUMENT_PAGES) throw new Error(`가져올 문서는 최대 ${MAX_DOCUMENT_PAGES}쪽까지 지원합니다.`);
  const pages = [...document.pages]; while (pages.length < metadata.pages.length) pages.push(createPage());
  for (let index = 0; index < metadata.pages.length; index += 1) {
    const source = metadata.pages[index]; const objects: DocumentObject[] = [];
    for (const object of source.objects ?? []) {
      if (object.assetId) {
        const assetPath = extension === 'docx' ? `customXml/assets/${object.assetId}` : `BinData/${object.assetId}`; const blob = await zip.file(assetPath)?.async('blob');
        if (blob) { const stored = await storeAsset(blob, object.name || '가져온 이미지', object.mediaType || blob.type); objects.push({ ...object, assetId: stored.id }); continue; }
      }
      objects.push(object);
    }
    pages[index] = { ...pages[index], header: source.header, footer: source.footer, objects };
  }
  return { ...document, settings: metadata.settings ? { ...document.settings, pageNumber: metadata.settings } : document.settings, pages };
}

async function odtTextFlow(file: File) {
  const { zip } = await zipTextEntries(file, (name) => name === 'content.xml');
  const mimetype = await zip.file('mimetype')?.async('text');
  if (mimetype && mimetype !== 'application/vnd.oasis.opendocument.text') throw new Error('ODT 패키지 식별 정보가 올바르지 않습니다.');
  const content = await zip.file('content.xml')?.async('text');
  if (!content) throw new Error('ODT 본문을 찾지 못했습니다.');
  return textFlowFromXml(content);
}

export const WORD_IMPORT_EXTENSIONS = ['hwpx', 'docx', 'odt', 'rtf', 'html', 'htm', 'md', 'markdown', 'txt'] as const;

export async function importWordDocument(file: File, extension: string) {
  if (file.size > MAX_OFFICE_BYTES) throw new Error('문서 파일은 25MB 이하만 가져올 수 있습니다.');
  if (extension === 'docx') {
    return restoreObjectMetadata(file, extension, await importDocxDocument(file));
  }
  const textFlow = extension === 'hwpx' ? await hwpxTextFlow(file)
      : extension === 'odt' ? await odtTextFlow(file)
        : extension === 'rtf' ? rtfTextFlow(await file.text())
          : ['html', 'htm'].includes(extension) ? htmlTextFlow(await file.text())
            : ['md', 'markdown'].includes(extension) ? markdownTextFlow(await file.text())
              : contentFromLines((await file.text()).replace(/\r\n/g, '\n').split('\n').map((text) => ({ text })));
  return restoreObjectMetadata(file, extension, importedDocument(file.name, textFlow));
}

export function documentTextFlowFromText(text: string) {
  return contentFromLines(text.replace(/\r\n/g, '\n').split('\n').map((line) => ({ text: line })));
}
