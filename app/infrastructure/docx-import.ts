import JSZip from 'jszip';
import { createDocument, createPage, MAX_DOCUMENT_PAGES, PAGE_PRESETS, type DocumentObject, type EditorDocument, type Orientation, type PageMargins, type PagePreset, type RichTextDocument } from '../domain/document';
import { mmToPx } from '../domain/geometry';
import { paginateRichTextDocument } from '../domain/text-pagination';
import { imagePixelSize } from './image-metadata';
import { storeAsset } from './local-storage';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const V = 'urn:schemas-microsoft-com:vml';
const EMU_PER_PX = 9_525;
const TWIPS_PER_INCH = 1_440;
const MAX_XML_TEXT_BYTES = 8 * 1024 * 1024;
const MAX_EXPANDED_MEDIA_BYTES = 120 * 1024 * 1024;

type RichNode = { type: string; text?: string; attrs?: Record<string, unknown>; marks?: Array<{ type: string; attrs?: Record<string, unknown> }>; content?: RichNode[] };
type Relation = { target: string; type: string };
type Layout = { preset: PagePreset; orientation: Orientation; margins: PageMargins; sourceWidthPx: number; sourceHeightPx: number; header?: string; footer?: string };
type PageBuilder = { page: ReturnType<typeof createPage>; estimatedY: number; visible: boolean };

function xmlDocument(xml: string) {
  if (xml.length > MAX_XML_TEXT_BYTES) throw new Error('압축 해제된 DOCX 본문이 너무 큽니다.');
  const parsed = new DOMParser().parseFromString(xml, 'application/xml');
  if (parsed.querySelector('parsererror')) throw new Error('DOCX의 문서 XML을 읽을 수 없습니다.');
  return parsed;
}

function localName(element: Element) { return element.localName.includes(':') ? element.localName.split(':').pop()! : element.localName; }
function isTag(element: Element, namespace: string, name: string) { return localName(element) === name && (!element.namespaceURI || element.namespaceURI === namespace || element.tagName.includes(':')); }
function elements(parent: Element) { return Array.from(parent.children); }
function descendants(parent: Element, namespace: string, name: string) { return Array.from(parent.getElementsByTagName('*')).filter((element) => isTag(element, namespace, name)); }
function first(parent: Element, namespace: string, name: string) { return descendants(parent, namespace, name)[0] ?? null; }
function wordValue(element: Element | null, name = 'val') { return element?.getAttributeNS(W, name) ?? element?.getAttribute(`w:${name}`) ?? element?.getAttribute(name) ?? ''; }
function relationId(element: Element | null) { return element?.getAttributeNS(R, 'id') ?? element?.getAttribute('r:id') ?? ''; }
function embeddedRelationId(element: Element | null) { return element?.getAttributeNS(R, 'embed') ?? element?.getAttributeNS(R, 'link') ?? element?.getAttribute('r:embed') ?? element?.getAttribute('r:link') ?? ''; }
function number(value: string | null | undefined, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function emuToPx(value: string | null | undefined) { return number(value) / EMU_PER_PX; }
function twipsToMm(value: string | null | undefined, fallback: number) { return value ? Math.round(number(value) / TWIPS_PER_INCH * 25.4 * 10) / 10 : fallback; }
function twipsToPx(value: string | null | undefined) { return number(value) / TWIPS_PER_INCH * 96; }

function normalizedWordPath(target: string) {
  const parts = `${target.startsWith('/') ? '' : 'word/'}${target}`.split('/');
  const output: string[] = [];
  for (const part of parts) { if (!part || part === '.') continue; if (part === '..') output.pop(); else output.push(part); }
  return output.join('/');
}

function closestPage(widthMm: number, heightMm: number): { preset: PagePreset; orientation: Orientation } {
  let winner: { preset: PagePreset; orientation: Orientation; distance: number } = { preset: 'A4', orientation: 'portrait', distance: Number.POSITIVE_INFINITY };
  for (const [preset, dimensions] of Object.entries(PAGE_PRESETS) as Array<[PagePreset, { widthMm: number; heightMm: number }]>) {
    for (const orientation of ['portrait', 'landscape'] as const) {
      const width = orientation === 'portrait' ? dimensions.widthMm : dimensions.heightMm;
      const height = orientation === 'portrait' ? dimensions.heightMm : dimensions.widthMm;
      const distance = Math.abs(width - widthMm) + Math.abs(height - heightMm);
      if (distance < winner.distance) winner = { preset, orientation, distance };
    }
  }
  return winner;
}

function textFromPart(xml: string) {
  const parsed = xmlDocument(xml);
  return Array.from(parsed.getElementsByTagNameNS(W, 'p')).map((paragraph) => descendants(paragraph, W, 't').map((item) => item.textContent ?? '').join('')).filter(Boolean).join(' · ');
}

async function relationships(zip: JSZip) {
  const source = await zip.file('word/_rels/document.xml.rels')?.async('text');
  if (!source) return new Map<string, Relation>();
  const parsed = xmlDocument(source); const result = new Map<string, Relation>();
  for (const item of elements(parsed.documentElement)) result.set(item.getAttribute('Id') ?? '', { target: normalizedWordPath(item.getAttribute('Target') ?? ''), type: item.getAttribute('Type') ?? '' });
  return result;
}

async function sectionLayout(zip: JSZip, section: Element | null, relations: Map<string, Relation>): Promise<Layout> {
  const pageSize = section ? first(section, W, 'pgSz') : null;
  const widthMm = twipsToMm(wordValue(pageSize, 'w'), 210);
  const heightMm = twipsToMm(wordValue(pageSize, 'h'), 297);
  const selected = closestPage(widthMm, heightMm);
  const margin = section ? first(section, W, 'pgMar') : null;
  const margins = {
    top: twipsToMm(wordValue(margin, 'top'), 25.4), right: twipsToMm(wordValue(margin, 'right'), 25.4),
    bottom: twipsToMm(wordValue(margin, 'bottom'), 25.4), left: twipsToMm(wordValue(margin, 'left'), 25.4),
  };
  const readReference = async (name: 'headerReference' | 'footerReference') => {
    const reference = section ? first(section, W, name) : null; const relation = relations.get(relationId(reference));
    const xml = relation ? await zip.file(relation.target)?.async('text') : undefined;
    return xml ? textFromPart(xml) : undefined;
  };
  return { ...selected, margins, sourceWidthPx: widthMm / 25.4 * 96, sourceHeightPx: heightMm / 25.4 * 96, header: await readReference('headerReference'), footer: await readReference('footerReference') };
}

function richMarks(run: Element) {
  const properties = elements(run).find((item) => isTag(item, W, 'rPr'));
  if (!properties) return [];
  const marks: Array<{ type: string; attrs?: Record<string, unknown> }> = [];
  if (first(properties, W, 'b')) marks.push({ type: 'bold' });
  if (first(properties, W, 'i')) marks.push({ type: 'italic' });
  if (first(properties, W, 'u')) marks.push({ type: 'underline' });
  if (first(properties, W, 'strike')) marks.push({ type: 'strike' });
  const fonts = first(properties, W, 'rFonts'); const size = first(properties, W, 'sz'); const color = first(properties, W, 'color');
  const style: Record<string, unknown> = {};
  const family = wordValue(fonts, 'eastAsia') || wordValue(fonts, 'ascii'); if (family) style.fontFamily = family;
  const points = number(wordValue(size)) / 2; if (points) style.fontSize = `${points}pt`;
  const hex = wordValue(color); if (/^[0-9a-f]{6}$/i.test(hex)) style.color = `#${hex}`;
  if (Object.keys(style).length) marks.push({ type: 'textStyle', attrs: style });
  return marks;
}

function paragraphShape(paragraph: Element) {
  const properties = elements(paragraph).find((item) => isTag(item, W, 'pPr'));
  const style = wordValue(properties ? first(properties, W, 'pStyle') : null);
  const heading = /(?:heading|제목)\s*([1-6])/i.exec(style);
  const alignment = wordValue(properties ? first(properties, W, 'jc') : null);
  const spacing = properties ? first(properties, W, 'spacing') : null;
  const line = wordValue(spacing, 'line'); const lineRule = wordValue(spacing, 'lineRule');
  const lineHeight = line ? (lineRule === 'auto' || !lineRule ? String(Math.max(0.8, number(line) / 240)) : `${twipsToPx(line)}px`) : undefined;
  const before = wordValue(spacing, 'before'); const after = wordValue(spacing, 'after');
  return { type: heading ? 'heading' : 'paragraph', attrs: { ...(heading ? { level: Math.min(3, number(heading[1], 1)) } : {}), ...(alignment ? { textAlign: alignment === 'both' ? 'justify' : alignment } : {}), ...(lineHeight ? { lineHeight } : {}), ...(before ? { spaceBeforePx: twipsToPx(before) } : {}), ...(after ? { spaceAfterPx: twipsToPx(after) } : {}) }, properties };
}

function objectMime(path: string) {
  const extension = path.split('.').pop()?.toLowerCase();
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', emf: 'image/x-emf', wmf: 'image/wmf' } as Record<string, string>)[extension ?? ''] ?? 'application/octet-stream';
}

function positionAxis(element: Element | null, axis: 'horizontal' | 'vertical', layout: Layout, builder: PageBuilder, size: number) {
  const sourceLength = axis === 'horizontal' ? layout.sourceWidthPx : layout.sourceHeightPx;
  const startMargin = mmToPx(axis === 'horizontal' ? layout.margins.left : layout.margins.top);
  if (!element) return axis === 'horizontal' ? (sourceLength - size) / 2 : builder.estimatedY;
  const relative = element.getAttribute('relativeFrom') ?? '';
  const offset = emuToPx(first(element, WP, 'posOffset')?.textContent);
  const align = first(element, WP, 'align')?.textContent;
  if (align === 'center') return (sourceLength - size) / 2;
  if (align === 'right' || align === 'bottom') return sourceLength - startMargin - size;
  if (relative === 'page') return offset;
  if (axis === 'vertical' && ['paragraph', 'line'].includes(relative)) return builder.estimatedY + offset;
  return startMargin + offset;
}

export async function importDocxDocument(file: File): Promise<EditorDocument> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const documentXml = await zip.file('word/document.xml')?.async('text');
  if (!documentXml) throw new Error('DOCX 본문을 찾지 못했습니다.');
  const parsed = xmlDocument(documentXml); const body = Array.from(parsed.getElementsByTagName('*')).find((item) => isTag(item, W, 'body'));
  if (!body) throw new Error('DOCX 본문 구조가 올바르지 않습니다.');
  const relationMap = await relationships(zip);
  const hasRenderedBreaks = descendants(body, W, 'lastRenderedPageBreak').length > 0;
  const sections = descendants(body, W, 'sectPr');
  const layouts = await Promise.all((sections.length ? sections : [null]).map((section) => sectionLayout(zip, section, relationMap)));
  let layoutIndex = 0; let layout = layouts[0];
  const newBuilder = (next: Layout): PageBuilder => { const page = createPage({ type: 'doc', content: [] }, next.preset, next.orientation, next.margins); page.header = next.header; page.footer = next.footer; return { page, estimatedY: mmToPx(next.margins.top), visible: false }; };
  const builders: PageBuilder[] = [newBuilder(layout)]; let builder = builders[0];
  let boundaryOpen = false; let lastBoundary: 'rendered' | 'explicit' | 'section' | null = null; let lastBoundaryScope = -1; let paragraphSequence = 0;
  const targetSize = () => { const dimensions = PAGE_PRESETS[layout.preset]; return { width: mmToPx(layout.orientation === 'portrait' ? dimensions.widthMm : dimensions.heightMm), height: mmToPx(layout.orientation === 'portrait' ? dimensions.heightMm : dimensions.widthMm) }; };
  const pageBreak = (kind: 'rendered' | 'explicit' | 'section', scope: number) => {
    if (kind === 'section' && boundaryOpen) return;
    if (boundaryOpen && lastBoundaryScope === scope && lastBoundary !== kind) return;
    if (builders.length >= MAX_DOCUMENT_PAGES) throw new Error(`가져올 문서는 최대 ${MAX_DOCUMENT_PAGES}쪽까지 지원합니다.`);
    builder = newBuilder(layout); builders.push(builder); boundaryOpen = true; lastBoundary = kind; lastBoundaryScope = scope;
  };
  const touch = () => { builder.visible = true; boundaryOpen = false; lastBoundary = null; lastBoundaryScope = -1; };
  const assetCache = new Map<string, Awaited<ReturnType<typeof storeAsset>>>(); let expandedMediaBytes = 0;
  const imageAsset = async (path: string) => {
    const cached = assetCache.get(path); if (cached) return cached;
    const bytes = await zip.file(path)?.async('uint8array'); if (!bytes) return null;
    expandedMediaBytes += bytes.byteLength; if (expandedMediaBytes > MAX_EXPANDED_MEDIA_BYTES) throw new Error('DOCX 안의 그림을 펼친 크기가 120MB를 넘습니다.');
    let mime = objectMime(path); let data = new Uint8Array(bytes).buffer as ArrayBuffer; let name = path.split('/').pop() || 'DOCX 그림';
    if (mime === 'image/x-emf' || mime === 'image/wmf') {
      try {
        const converter = await import('emf-converter');
        const dataUrl = await (mime === 'image/x-emf' ? converter.convertEmfToDataUrl(data, { maxWidth: 2048, maxHeight: 2048, dpiScale: 1 }) : converter.convertWmfToDataUrl(data, { maxWidth: 2048, maxHeight: 2048, dpiScale: 1 }));
        const encoded = dataUrl?.split(',')[1];
        if (encoded) { const converted = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0)); data = converted.buffer as ArrayBuffer; mime = 'image/png'; name = name.replace(/\.(?:emf|wmf)$/i, '.png'); }
      } catch { /* Keep the original asset when a rare metafile record cannot be converted. */ }
    }
    const stored = await storeAsset(new Blob([data], { type: mime }), name, mime); assetCache.set(path, stored); return stored;
  };
  const addDrawing = async (container: Element, paragraphAlignment: string) => {
    const blip = first(container, A, 'blip'); const relation = relationMap.get(embeddedRelationId(blip));
    const text = descendants(container, W, 't').map((item) => item.textContent ?? '').join('');
    const extent = first(container, WP, 'extent');
    const sourceWidth = emuToPx(extent?.getAttribute('cx')) || 180; const sourceHeight = emuToPx(extent?.getAttribute('cy')) || 100;
    const target = targetSize(); const scale = Math.min(target.width / layout.sourceWidthPx, target.height / layout.sourceHeightPx);
    const width = sourceWidth * scale; const height = sourceHeight * scale;
    const anchored = container.localName === 'anchor';
    let x = anchored ? positionAxis(first(container, WP, 'positionH'), 'horizontal', layout, builder, sourceWidth) : paragraphAlignment === 'right' ? layout.sourceWidthPx - mmToPx(layout.margins.right) - sourceWidth : paragraphAlignment === 'center' ? (layout.sourceWidthPx - sourceWidth) / 2 : mmToPx(layout.margins.left);
    let y = anchored ? positionAxis(first(container, WP, 'positionV'), 'vertical', layout, builder, sourceHeight) : builder.estimatedY;
    x *= target.width / layout.sourceWidthPx; y *= target.height / layout.sourceHeightPx;
    const rotation = number(first(container, A, 'xfrm')?.getAttribute('rot')) / 60_000;
    const description = first(container, WP, 'docPr'); const name = description?.getAttribute('descr') || description?.getAttribute('name') || relation?.target.split('/').pop();
    let object: DocumentObject | null = null;
    if (relation?.target) { const asset = await imageAsset(relation.target); if (asset) { const source = await imagePixelSize(asset.blob); object = { id: crypto.randomUUID(), type: 'image', x, y, width, height, rotation, zIndex: container.getAttribute('behindDoc') === '1' ? 1 : 20 + builder.page.objects.length, locked: false, opacity: 1, assetId: asset.id, name: name || asset.name, mediaType: asset.mediaType, size: asset.size, sourceWidthPx: source.width, sourceHeightPx: source.height }; } }
    else if (text) object = { id: crypto.randomUUID(), type: 'text-box', x, y, width, height, rotation, zIndex: 20 + builder.page.objects.length, locked: false, opacity: 1, text, name: name || 'DOCX 글상자', style: { background: '#ffffff', borderColor: '#8eb8ad', borderWidth: 1 } };
    if (object) { builder.page.objects.push(object); touch(); if (!anchored) builder.estimatedY = Math.max(builder.estimatedY, y + height + 8); }
  };
  const addVml = async (pict: Element, alignment: string) => {
    const shape = first(pict, V, 'shape'); const image = first(pict, V, 'imagedata'); const relation = relationMap.get(relationId(image));
    if (!shape || !relation) return;
    const style = Object.fromEntries((shape.getAttribute('style') ?? '').split(';').map((item) => item.split(':').map((part) => part.trim())).filter((item) => item.length === 2));
    const toPx = (value: string | undefined, fallback: number) => value?.endsWith('pt') ? number(value.slice(0, -2)) * 96 / 72 : number(value, fallback);
    const asset = await imageAsset(relation.target); if (!asset) return;
    const width = toPx(style.width, 180); const height = toPx(style.height, 100);
    const source = await imagePixelSize(asset.blob);
    builder.page.objects.push({ id: crypto.randomUUID(), type: 'image', x: toPx(style['margin-left'], alignment === 'center' ? (layout.sourceWidthPx - width) / 2 : mmToPx(layout.margins.left)), y: toPx(style['margin-top'], builder.estimatedY), width, height, rotation: number(style.rotation), zIndex: 20 + builder.page.objects.length, locked: false, opacity: 1, assetId: asset.id, name: asset.name, mediaType: asset.mediaType, size: asset.size, sourceWidthPx: source.width, sourceHeightPx: source.height }); touch();
  };
  const addParagraph = async (paragraph: Element) => {
    const scope = ++paragraphSequence;
    const shape = paragraphShape(paragraph); const alignment = String(shape.attrs.textAlign ?? 'left'); let inline: RichNode[] = [];
    const flush = () => { const node: RichNode = { type: shape.type, attrs: shape.attrs, ...(inline.length ? { content: inline } : {}) }; (builder.page.textFlow.content as RichNode[]).push(node); const characters = inline.reduce((sum, item) => sum + (item.text?.length ?? 1), 0); builder.estimatedY += Math.max(22, Math.ceil(characters / 45) * 22); if (characters) touch(); inline = []; };
    const walk = async (element: Element, marks: RichNode['marks'] = []) => {
      if (isTag(element, W, 'r')) { const nextMarks = richMarks(element); for (const child of elements(element).filter((item) => localName(item) !== 'rPr')) await walk(child, nextMarks); return; }
      if (isTag(element, W, 't')) { inline.push({ type: 'text', text: element.textContent ?? '', ...(marks?.length ? { marks } : {}) }); return; }
      if (isTag(element, W, 'tab')) { inline.push({ type: 'text', text: '\t', ...(marks?.length ? { marks } : {}) }); return; }
      if (isTag(element, W, 'lastRenderedPageBreak')) { flush(); pageBreak('rendered', scope); return; }
      if (isTag(element, W, 'br')) { if (wordValue(element, 'type') === 'page') { flush(); pageBreak('explicit', scope); } else inline.push({ type: 'hardBreak' }); return; }
      if (isTag(element, W, 'drawing')) { for (const item of descendants(element, WP, 'anchor').concat(descendants(element, WP, 'inline'))) await addDrawing(item, alignment); return; }
      if (isTag(element, W, 'pict')) { await addVml(element, alignment); return; }
      for (const child of elements(element)) await walk(child, marks);
    };
    if (shape.properties && first(shape.properties, W, 'pageBreakBefore')) pageBreak('explicit', scope);
    for (const child of elements(paragraph).filter((item) => localName(item) !== 'pPr')) await walk(child);
    flush();
    const section = shape.properties ? first(shape.properties, W, 'sectPr') : null;
    if (section) { layoutIndex = Math.min(layoutIndex + 1, layouts.length - 1); layout = layouts[layoutIndex]; const start = wordValue(first(section, W, 'type')); if (start !== 'continuous' && !hasRenderedBreaks) pageBreak('section', scope); }
  };
  const tableNode = (table: Element): RichNode => ({ type: 'table', content: descendants(table, W, 'tr').map((row, rowIndex) => ({ type: 'tableRow', content: elements(row).filter((cell) => isTag(cell, W, 'tc')).map((cell) => ({ type: rowIndex === 0 ? 'tableHeader' : 'tableCell', content: descendants(cell, W, 'p').map((paragraph) => ({ type: 'paragraph', content: descendants(paragraph, W, 't').map((item) => ({ type: 'text', text: item.textContent ?? '' })) })) })) })) });
  for (const child of elements(body)) {
    if (isTag(child, W, 'p')) await addParagraph(child);
    else if (isTag(child, W, 'tbl')) { (builder.page.textFlow.content as RichNode[]).push(tableNode(child)); builder.estimatedY += 80; touch(); }
  }
  if (builders.length > 1 && !builders.at(-1)!.visible && !(builders.at(-1)!.page.textFlow.content as RichNode[]).length) builders.pop();
  const base = createDocument('blank');
  const pages = builders.flatMap(({ page }) => {
    const sourceFlow = { type: 'doc', content: page.textFlow.content?.length ? page.textFlow.content : [{ type: 'paragraph' }] } as RichTextDocument;
    const flows = paginateRichTextDocument(sourceFlow, { preset: page.preset, orientation: page.orientation, margins: page.margins, defaultFontSizePt: base.settings.defaultFontSize, lineHeight: base.settings.lineHeight, maxPages: MAX_DOCUMENT_PAGES });
    return flows.map((textFlow, index) => index === 0 ? { ...page, textFlow } : { ...createPage(textFlow, page.preset, page.orientation, page.margins), header: page.header, footer: page.footer });
  });
  if (pages.length > MAX_DOCUMENT_PAGES) throw new Error(`가져올 문서는 최대 ${MAX_DOCUMENT_PAGES}쪽까지 지원합니다.`);
  return { ...base, name: file.name.replace(/\.[^.]+$/, '').trim() || '가져온 문서', pages } as EditorDocument;
}
