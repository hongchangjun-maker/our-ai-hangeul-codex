import JSZip from 'jszip';
import { createDocument, createPage, MAX_DOCUMENT_PAGES, PAGE_PRESETS, type DocumentObject, type EditorDocument, type Orientation, type PageMargins, type PagePreset, type RichTextDocument } from '../domain/document';
import { mmToPx } from '../domain/geometry';
import { estimateRichTextHeight, paginateRichTextDocument, textPageCapacity } from '../domain/text-pagination';
import { A, W, child, descendants, effectiveRunFormat, elements, first, isTag, localName, marksForFormat, number, paragraphShape, twipsToPx, wordStyles, wordValue, xmlDocument, type DocxRichNode as RichNode, type RunFormat } from './docx-formatting';
import { imagePixelSize } from './image-metadata';
import { storeAsset } from './local-storage';

const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const V = 'urn:schemas-microsoft-com:vml';
const EMU_PER_PX = 9_525;
const TWIPS_PER_INCH = 1_440;
const MAX_EXPANDED_MEDIA_BYTES = 120 * 1024 * 1024;

type Relation = { target: string; type: string };
type Layout = { preset: PagePreset; orientation: Orientation; margins: PageMargins; sourceWidthPx: number; sourceHeightPx: number; customSizeMm?: { widthMm: number; heightMm: number }; gutterMm: number; mirrorMargins: boolean; linePitchPx: number; header?: string; footer?: string; hasPageField: boolean; pageNumberPosition?: 'header-right' | 'footer-center' | 'footer-right' };
type PageBuilder = { page: ReturnType<typeof createPage>; estimatedY: number; visible: boolean };
function relationId(element: Element | null) { return element?.getAttributeNS(R, 'id') ?? element?.getAttribute('r:id') ?? ''; }
function embeddedRelationId(element: Element | null) { return element?.getAttributeNS(R, 'embed') ?? element?.getAttributeNS(R, 'link') ?? element?.getAttribute('r:embed') ?? element?.getAttribute('r:link') ?? ''; }
function emuToPx(value: string | null | undefined) { return number(value) / EMU_PER_PX; }
function twipsToMm(value: string | null | undefined, fallback: number) { return value ? Math.round(number(value) / TWIPS_PER_INCH * 25.4 * 10) / 10 : fallback; }

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

function contentFromPart(xml: string) {
  const parsed = xmlDocument(xml); let hasPageField = false; let alignment = '';
  const paragraphs = descendants(parsed.documentElement, W, 'p').map((paragraph) => {
    alignment ||= wordValue(child(child(paragraph, W, 'pPr'), W, 'jc'));
    let inField = false; let text = '';
    const walk = (element: Element) => {
      if (isTag(element, W, 'fldSimple')) { if (/\bPAGE\b/i.test(wordValue(element, 'instr'))) hasPageField = true; return; }
      if (isTag(element, W, 'fldChar')) { const type = wordValue(element, 'fldCharType'); if (type === 'begin') inField = true; if (type === 'end') inField = false; return; }
      if (isTag(element, W, 'instrText')) { if (/\bPAGE\b/i.test(element.textContent ?? '')) hasPageField = true; return; }
      if (isTag(element, W, 't')) { if (!inField) text += element.textContent ?? ''; return; }
      for (const item of elements(element)) walk(item);
    };
    for (const item of elements(paragraph)) walk(item);
    return text;
  }).filter(Boolean);
  return { text: paragraphs.join(' · ') || undefined, hasPageField, alignment };
}

async function relationships(zip: JSZip) {
  const source = await zip.file('word/_rels/document.xml.rels')?.async('text');
  if (!source) return new Map<string, Relation>();
  const parsed = xmlDocument(source); const result = new Map<string, Relation>();
  for (const item of elements(parsed.documentElement)) result.set(item.getAttribute('Id') ?? '', { target: normalizedWordPath(item.getAttribute('Target') ?? ''), type: item.getAttribute('Type') ?? '' });
  return result;
}

async function declaredDocumentPages(zip: JSZip) {
  const source = await zip.file('docProps/app.xml')?.async('text');
  if (!source) return 0;
  const parsed = xmlDocument(source);
  const pageElement = Array.from(parsed.getElementsByTagName('*')).find((element) => localName(element) === 'Pages');
  const pages = Math.floor(number(pageElement?.textContent));
  return pages > 0 && pages <= MAX_DOCUMENT_PAGES ? pages : 0;
}

async function sectionLayout(zip: JSZip, section: Element | null, relations: Map<string, Relation>, mirrorMargins: boolean): Promise<Layout> {
  const pageSize = section ? first(section, W, 'pgSz') : null;
  const widthMm = twipsToMm(wordValue(pageSize, 'w'), 210);
  const heightMm = twipsToMm(wordValue(pageSize, 'h'), 297);
  const selected = closestPage(widthMm, heightMm);
  const margin = section ? first(section, W, 'pgMar') : null;
  const margins = {
    top: twipsToMm(wordValue(margin, 'top'), 25.4), right: twipsToMm(wordValue(margin, 'right'), 25.4),
    bottom: twipsToMm(wordValue(margin, 'bottom'), 25.4), left: twipsToMm(wordValue(margin, 'left'), 25.4),
  };
  const gutterMm = twipsToMm(wordValue(margin, 'gutter'), 0);
  const readReference = async (name: 'headerReference' | 'footerReference') => {
    const reference = section ? first(section, W, name) : null; const relation = relations.get(relationId(reference));
    const xml = relation ? await zip.file(relation.target)?.async('text') : undefined;
    return xml ? contentFromPart(xml) : { text: undefined, hasPageField: false, alignment: '' };
  };
  const header = await readReference('headerReference'); const footer = await readReference('footerReference');
  const preset = PAGE_PRESETS[selected.preset]; const expectedWidth = selected.orientation === 'portrait' ? preset.widthMm : preset.heightMm; const expectedHeight = selected.orientation === 'portrait' ? preset.heightMm : preset.widthMm;
  const customSizeMm = Math.abs(widthMm - expectedWidth) + Math.abs(heightMm - expectedHeight) > 0.5 ? { widthMm, heightMm } : undefined;
  const pageNumberPosition = header.hasPageField ? 'header-right' : footer.hasPageField && footer.alignment === 'right' ? 'footer-right' : footer.hasPageField ? 'footer-center' : undefined;
  const linePitchPx = twipsToPx(wordValue(section ? first(section, W, 'docGrid') : null, 'linePitch'));
  return { ...selected, margins, customSizeMm, gutterMm, mirrorMargins, linePitchPx, sourceWidthPx: widthMm / 25.4 * 96, sourceHeightPx: heightMm / 25.4 * 96, header: header.text, footer: footer.text, hasPageField: header.hasPageField || footer.hasPageField, pageNumberPosition };
}

function objectMime(path: string) {
  const extension = path.split('.').pop()?.toLowerCase();
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', emf: 'image/x-emf', wmf: 'image/wmf' } as Record<string, string>)[extension ?? ''] ?? 'application/octet-stream';
}

function positionAxis(element: Element | null, axis: 'horizontal' | 'vertical', layout: Layout, builder: PageBuilder, size: number) {
  const sourceLength = axis === 'horizontal' ? layout.sourceWidthPx : layout.sourceHeightPx;
  const startMargin = mmToPx(axis === 'horizontal' ? builder.page.margins.left : builder.page.margins.top);
  const endMargin = mmToPx(axis === 'horizontal' ? builder.page.margins.right : builder.page.margins.bottom);
  if (!element) return axis === 'horizontal' ? (sourceLength - size) / 2 : builder.estimatedY;
  const relative = element.getAttribute('relativeFrom') ?? '';
  const offset = emuToPx(first(element, WP, 'posOffset')?.textContent);
  const align = first(element, WP, 'align')?.textContent;
  if (align === 'center') return (sourceLength - size) / 2;
  if (align === 'right' || align === 'bottom') return relative === 'page' ? sourceLength - size : sourceLength - endMargin - size;
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
  const declaredPages = await declaredDocumentPages(zip);
  const styles = await wordStyles(zip);
  const settingsXml = await zip.file('word/settings.xml')?.async('text'); const settings = settingsXml ? xmlDocument(settingsXml) : null;
  const mirrorMargins = Boolean(settings && descendants(settings.documentElement, W, 'mirrorMargins').length);
  const hasRenderedBreaks = descendants(body, W, 'lastRenderedPageBreak').length > 0;
  const sections = descendants(body, W, 'sectPr');
  const layouts = await Promise.all((sections.length ? sections : [null]).map((section) => sectionLayout(zip, section, relationMap, mirrorMargins)));
  const base = createDocument('blank');
  let layoutIndex = 0; let layout = layouts[0];
  const newBuilder = (next: Layout, pageIndex: number): PageBuilder => {
    const margins = { ...next.margins };
    if (next.gutterMm > 0) {
      if (next.mirrorMargins && pageIndex % 2 === 1) margins.right += next.gutterMm;
      else margins.left += next.gutterMm;
    }
    const page = createPage({ type: 'doc', content: [] }, next.preset, next.orientation, margins); page.header = next.header; page.footer = next.footer; page.customSizeMm = next.customSizeMm; page.guideStyle = 'corners';
    return { page, estimatedY: mmToPx(margins.top), visible: false };
  };
  const builders: PageBuilder[] = [newBuilder(layout, 0)]; let builder = builders[0];
  let boundaryOpen = false; let lastBoundary: 'rendered' | 'explicit' | 'section' | null = null;
  const targetSize = () => ({ width: layout.sourceWidthPx, height: layout.sourceHeightPx });
  const pageBreak = (kind: 'rendered' | 'explicit' | 'section') => {
    if (kind === 'section' && boundaryOpen) return;
    if (boundaryOpen && lastBoundary !== kind) return;
    if (builders.length >= MAX_DOCUMENT_PAGES) throw new Error(`가져올 문서는 최대 ${MAX_DOCUMENT_PAGES}쪽까지 지원합니다.`);
    builder = newBuilder(layout, builders.length); builders.push(builder); boundaryOpen = true; lastBoundary = kind;
  };
  const touch = () => { builder.visible = true; boundaryOpen = false; lastBoundary = null; };
  const syncEstimatedY = () => {
    const flow = { type: 'doc', content: builder.page.textFlow.content ?? [] } as RichTextDocument;
    const height = estimateRichTextHeight(flow, { preset: builder.page.preset, orientation: builder.page.orientation, margins: builder.page.margins, customSizeMm: builder.page.customSizeMm, defaultFontSizePt: base.settings.defaultFontSize, lineHeight: base.settings.lineHeight, maxPages: MAX_DOCUMENT_PAGES });
    builder.estimatedY = Math.max(builder.estimatedY, mmToPx(builder.page.margins.top) + height);
  };
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
  const addDrawing = async (container: Element, paragraphAlignment: string, inlineOffsetX = 0) => {
    const blip = first(container, A, 'blip'); const relation = relationMap.get(embeddedRelationId(blip));
    const text = descendants(container, W, 't').map((item) => item.textContent ?? '').join('');
    const extent = first(container, WP, 'extent');
    const sourceWidth = emuToPx(extent?.getAttribute('cx')) || 180; const sourceHeight = emuToPx(extent?.getAttribute('cy')) || 100;
    const target = targetSize(); const scale = Math.min(target.width / layout.sourceWidthPx, target.height / layout.sourceHeightPx);
    const width = sourceWidth * scale; const height = sourceHeight * scale;
    const anchored = container.localName === 'anchor';
    let x = anchored ? positionAxis(first(container, WP, 'positionH'), 'horizontal', layout, builder, sourceWidth) : paragraphAlignment === 'right' ? layout.sourceWidthPx - mmToPx(builder.page.margins.right) - sourceWidth : paragraphAlignment === 'center' ? (layout.sourceWidthPx - sourceWidth) / 2 : mmToPx(builder.page.margins.left) + inlineOffsetX;
    let y = anchored ? positionAxis(first(container, WP, 'positionV'), 'vertical', layout, builder, sourceHeight) : builder.estimatedY;
    x *= target.width / layout.sourceWidthPx; y *= target.height / layout.sourceHeightPx;
    const rotation = number(first(container, A, 'xfrm')?.getAttribute('rot')) / 60_000;
    const description = first(container, WP, 'docPr'); const name = description?.getAttribute('descr') || description?.getAttribute('name') || relation?.target.split('/').pop();
    let object: DocumentObject | null = null;
    if (relation?.target) { const asset = await imageAsset(relation.target); if (asset) { const source = await imagePixelSize(asset.blob); object = { id: crypto.randomUUID(), type: 'image', x, y, width, height, rotation, zIndex: container.getAttribute('behindDoc') === '1' ? 1 : 20 + builder.page.objects.length, locked: false, opacity: 1, assetId: asset.id, name: name || asset.name, mediaType: asset.mediaType, size: asset.size, sourceWidthPx: source.width, sourceHeightPx: source.height }; } }
    else if (text) object = { id: crypto.randomUUID(), type: 'text-box', x, y, width, height, rotation, zIndex: 20 + builder.page.objects.length, locked: false, opacity: 1, text, name: name || 'DOCX 글상자', style: { background: '#ffffff', borderColor: '#8eb8ad', borderWidth: 1 } };
    if (object) {
      builder.page.objects.push(object); touch();
      if (!anchored) builder.estimatedY = Math.max(builder.estimatedY, y + height + 8);
      return anchored ? 0 : height + 8;
    }
    return 0;
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
    const shape = paragraphShape(paragraph, styles, layout.linePitchPx); const alignment = String(shape.attrs.textAlign ?? 'left'); let inline: RichNode[] = [];
    let emitted = false;
    let endedWithPageBoundary = false;
    const appendText = (text: string, marks: RichNode['marks']) => {
      const previous = inline.at(-1);
      if (previous?.type === 'text' && JSON.stringify(previous.marks ?? []) === JSON.stringify(marks ?? [])) previous.text = `${previous.text ?? ''}${text}`;
      else inline.push({ type: 'text', text, ...(marks?.length ? { marks } : {}) });
    };
    const flush = (preserveEmpty = true) => {
      if (!inline.length && (!preserveEmpty || emitted)) return;
      const node: RichNode = { type: shape.type, attrs: shape.attrs, ...(inline.length ? { content: inline } : {}) };
      (builder.page.textFlow.content as RichNode[]).push(node);
      const characters = inline.reduce((sum, item) => sum + (item.text?.length ?? 1), 0);
      syncEstimatedY(); if (characters) touch(); inline = []; emitted = true;
    };
    const walk = async (element: Element, marks: RichNode['marks'] = [], runFormat?: RunFormat) => {
      if (isTag(element, W, 'r')) { const nextFormat = effectiveRunFormat(element, shape.runFormat, styles); for (const child of elements(element).filter((item) => localName(item) !== 'rPr')) await walk(child, marksForFormat(nextFormat), nextFormat); return; }
      if (isTag(element, W, 't')) {
        const text = element.textContent ?? '';
        if (text) endedWithPageBoundary = false;
        if (!runFormat) appendText(text, marks);
        else for (const segment of text.match(/[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff]+|[^\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff]+/gu) ?? [text]) {
          const eastAsian = /[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff]/u.test(segment);
          const family = eastAsian ? runFormat.eastAsiaFontFamily || runFormat.fontFamily : runFormat.latinFontFamily || runFormat.fontFamily;
          const nextMarks = marksForFormat(runFormat, family);
          appendText(segment, nextMarks);
        }
        return;
      }
      if (isTag(element, W, 'tab')) { endedWithPageBoundary = false; inline.push({ type: 'text', text: '\t', ...(marks?.length ? { marks } : {}) }); return; }
      if (isTag(element, W, 'lastRenderedPageBreak')) { flush(false); pageBreak('rendered'); emitted = false; endedWithPageBoundary = true; return; }
      if (isTag(element, W, 'br')) { if (wordValue(element, 'type') === 'page') { flush(false); pageBreak('explicit'); emitted = false; endedWithPageBoundary = true; } else { endedWithPageBoundary = false; inline.push({ type: 'hardBreak' }); } return; }
      if (isTag(element, W, 'drawing')) {
        endedWithPageBoundary = false;
        if (inline.length) flush();
        let reservedHeight = 0;
        const inlineOffsetX = Number(shape.attrs.marginLeftPx ?? 0) + Number(shape.attrs.textIndentPx ?? 0);
        for (const item of descendants(element, WP, 'anchor').concat(descendants(element, WP, 'inline'))) reservedHeight = Math.max(reservedHeight, await addDrawing(item, alignment, inlineOffsetX));
        if (reservedHeight > 0) {
          (builder.page.textFlow.content as RichNode[]).push({ type: 'paragraph', attrs: { lineHeight: `${reservedHeight}px`, spaceBeforePx: 0, spaceAfterPx: 0 } });
          syncEstimatedY(); emitted = true;
        }
        return;
      }
      if (isTag(element, W, 'pict')) { endedWithPageBoundary = false; await addVml(element, alignment); return; }
      for (const child of elements(element)) await walk(child, marks);
    };
    if (shape.pageBreakBefore) pageBreak('explicit');
    for (const child of elements(paragraph).filter((item) => localName(item) !== 'pPr')) await walk(child);
    if (!endedWithPageBoundary || inline.length) flush();
    const section = shape.properties ? first(shape.properties, W, 'sectPr') : null;
    if (section) { layoutIndex = Math.min(layoutIndex + 1, layouts.length - 1); layout = layouts[layoutIndex]; const start = wordValue(first(section, W, 'type')); if (start !== 'continuous' && !hasRenderedBreaks) pageBreak('section'); }
  };
  const tableNode = (table: Element): RichNode => ({ type: 'table', content: descendants(table, W, 'tr').map((row, rowIndex) => ({ type: 'tableRow', content: elements(row).filter((cell) => isTag(cell, W, 'tc')).map((cell) => ({ type: rowIndex === 0 ? 'tableHeader' : 'tableCell', content: descendants(cell, W, 'p').map((paragraph) => ({ type: 'paragraph', content: descendants(paragraph, W, 't').map((item) => ({ type: 'text', text: item.textContent ?? '' })) })) })) })) });
  for (const child of elements(body)) {
    if (isTag(child, W, 'p')) await addParagraph(child);
    else if (isTag(child, W, 'tbl')) { (builder.page.textFlow.content as RichNode[]).push(tableNode(child)); syncEstimatedY(); touch(); }
  }
  if (builders.length > 1 && !builders.at(-1)!.visible && !(builders.at(-1)!.page.textFlow.content as RichNode[]).length && lastBoundary !== 'explicit') builders.pop();
  let pages = builders.flatMap(({ page }) => {
    const sourceFlow = { type: 'doc', content: page.textFlow.content?.length ? page.textFlow.content : [{ type: 'paragraph' }] } as RichTextDocument;
    if (hasRenderedBreaks) return [{ ...page, textFlow: sourceFlow }];
    const flows = paginateRichTextDocument(sourceFlow, { preset: page.preset, orientation: page.orientation, margins: page.margins, customSizeMm: page.customSizeMm, defaultFontSizePt: base.settings.defaultFontSize, lineHeight: base.settings.lineHeight, maxPages: MAX_DOCUMENT_PAGES });
    return flows.map((textFlow, index) => index === 0 ? { ...page, textFlow } : { ...createPage(textFlow, page.preset, page.orientation, page.margins), header: page.header, footer: page.footer, customSizeMm: page.customSizeMm, guideStyle: page.guideStyle });
  });
  if (hasRenderedBreaks && declaredPages > pages.length) {
    const exhausted = new Set<string>();
    while (pages.length < declaredPages) {
      const candidate = pages
        .map((page, index) => {
          const options = { preset: page.preset, orientation: page.orientation, margins: page.margins, customSizeMm: page.customSizeMm, defaultFontSizePt: base.settings.defaultFontSize, lineHeight: base.settings.lineHeight, maxPages: MAX_DOCUMENT_PAGES };
          return { page, index, options, score: estimateRichTextHeight(page.textFlow, options) / textPageCapacity(options).heightPx };
        })
        .filter((item) => !exhausted.has(item.page.id) && (item.page.textFlow.content?.length ?? 0) > 0)
        .sort((left, right) => right.score - left.score)[0];
      if (!candidate) break;
      const flows = paginateRichTextDocument(candidate.page.textFlow, candidate.options);
      if (flows.length <= 1) { exhausted.add(candidate.page.id); continue; }
      const remainingFlow = { type: 'doc', content: flows.slice(1).flatMap((flow) => flow.content ?? []) } as RichTextDocument;
      const continuation = { ...createPage(remainingFlow, candidate.page.preset, candidate.page.orientation, candidate.page.margins), background: candidate.page.background, header: candidate.page.header, footer: candidate.page.footer, customSizeMm: candidate.page.customSizeMm, guideStyle: candidate.page.guideStyle };
      pages = [...pages.slice(0, candidate.index), { ...candidate.page, textFlow: flows[0] }, continuation, ...pages.slice(candidate.index + 1)];
    }
  }
  if (pages.length > MAX_DOCUMENT_PAGES) throw new Error(`가져올 문서는 최대 ${MAX_DOCUMENT_PAGES}쪽까지 지원합니다.`);
  const pageLayout = layouts.find((item) => item.hasPageField);
  const importedFonts = Array.from(styles.styles.values()).flatMap((item) => [item.run.fontFamily, item.run.latinFontFamily, item.run.eastAsiaFontFamily, item.run.complexFontFamily]).filter((font): font is string => Boolean(font));
  return { ...base, name: file.name.replace(/\.[^.]+$/, '').trim() || '가져온 문서', settings: { ...base.settings, defaultFont: styles.runDefaults.fontFamily || base.settings.defaultFont, defaultFontSize: number(styles.runDefaults.fontSize?.replace('pt', ''), base.settings.defaultFontSize), lineHeight: number(styles.paragraphDefaults.lineHeight, base.settings.lineHeight), pageNumber: { ...base.settings.pageNumber, enabled: Boolean(pageLayout), position: pageLayout?.pageNumberPosition ?? 'footer-center' } }, fonts: Array.from(new Set([...base.fonts, ...importedFonts, ...[styles.runDefaults.fontFamily, styles.runDefaults.latinFontFamily, styles.runDefaults.eastAsiaFontFamily, styles.runDefaults.complexFontFamily].filter((font): font is string => Boolean(font))])), pages } as EditorDocument;
}
