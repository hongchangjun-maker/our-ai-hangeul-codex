import { createDocument, type EditorDocument, type RichTextDocument } from '../domain/document';

const MAX_OFFICE_BYTES = 25 * 1024 * 1024;
const MAX_XML_TEXT_BYTES = 8 * 1024 * 1024;

type RichNode = { type: 'paragraph' | 'heading' | 'bulletList'; attrs?: { level: number }; content?: RichNode[] | Array<{ type: 'text'; text: string }> };

function fileStem(name: string) {
  return name.replace(/\.[^.]+$/, '').trim() || '가져온 문서';
}

function textNode(text: string) {
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
  return { ...document, name: fileStem(name), pages: [{ ...document.pages[0], textFlow }] };
}

function xmlDocument(xml: string) {
  const parsed = new DOMParser().parseFromString(xml, 'application/xml');
  if (parsed.querySelector('parsererror')) throw new Error('문서 XML을 읽을 수 없습니다.');
  return parsed;
}

function htmlTextFlow(html: string): RichTextDocument {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const lines: Array<{ text: string; level?: number; bullet?: boolean }> = [];
  for (const element of Array.from(parsed.body.querySelectorAll('h1,h2,h3,p,li,th,td'))) {
    const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
    const tag = element.tagName.toLowerCase();
    lines.push({ text, level: /^h[1-3]$/.test(tag) ? Number(tag[1]) : undefined, bullet: tag === 'li' });
  }
  return contentFromLines(lines.length ? lines : [{ text: (parsed.body.textContent ?? '').trim() }]);
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

async function docxTextFlow(file: File) {
  const mammothModule = await import('mammoth');
  const mammoth = mammothModule.default ?? mammothModule;
  const arrayBuffer = await file.arrayBuffer();
  const nodeRuntime = (globalThis as typeof globalThis & { process?: { versions?: { node?: string } } }).process?.versions?.node;
  const source = nodeRuntime ? { buffer: Buffer.from(arrayBuffer) } : { arrayBuffer };
  const converted = await mammoth.convertToHtml(source, { ignoreEmptyParagraphs: false });
  return htmlTextFlow(converted.value);
}

async function hwpxTextFlow(file: File) {
  const { zip, entries } = await zipTextEntries(file, (name) => /^Contents\/section\d+\.xml$/i.test(name));
  const mimetype = await zip.file('mimetype')?.async('text');
  if (mimetype && !mimetype.startsWith('application/hwp')) throw new Error('HWPX 패키지 식별 정보가 올바르지 않습니다.');
  const lines = entries.sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true })).flatMap(({ text }) => {
    const parsed = xmlDocument(text);
    return Array.from(parsed.getElementsByTagName('*'))
      .filter((element) => element.localName === 'p')
      .map((element) => ({ text: (element.textContent ?? '').replace(/\s+/g, ' ').trim() }));
  });
  return contentFromLines(lines);
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
  const textFlow = extension === 'docx' ? await docxTextFlow(file)
    : extension === 'hwpx' ? await hwpxTextFlow(file)
      : extension === 'odt' ? await odtTextFlow(file)
        : extension === 'rtf' ? rtfTextFlow(await file.text())
          : ['html', 'htm'].includes(extension) ? htmlTextFlow(await file.text())
            : ['md', 'markdown'].includes(extension) ? markdownTextFlow(await file.text())
              : contentFromLines((await file.text()).replace(/\r\n/g, '\n').split('\n').map((text) => ({ text })));
  return importedDocument(file.name, textFlow);
}

export function documentTextFlowFromText(text: string) {
  return contentFromLines(text.replace(/\r\n/g, '\n').split('\n').map((line) => ({ text: line })));
}
