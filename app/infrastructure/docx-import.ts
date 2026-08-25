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
type Layout = { preset: PagePreset; orientation: Orientation; margins: PageMargins; sourceWidthPx: number; sourceHeightPx: number; customSizeMm?: { widthMm: number; heightMm: number }; gutterMm: number; mirrorMargins: boolean; header?: string; footer?: string; hasPageField: boolean; pageNumberPosition?: 'header-right' | 'footer-center' | 'footer-right' };
type PageBuilder = { page: ReturnType<typeof createPage>; estimatedY: number; visible: boolean };
type RunFormat = { fontFamily?: string; fontSize?: string; color?: string; bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; letterSpacing?: string; fontStretch?: string; baselineShift?: string; verticalAlign?: string; highlight?: string; hidden?: boolean; characterStyle?: string };
type ParagraphFormat = { styleId?: string; styleName?: string; textAlign?: string; lineHeight?: string; spaceBeforePx?: number; spaceAfterPx?: number; marginLeftPx?: number; marginRightPx?: number; textIndentPx?: number; pageBreakBefore?: boolean; runFormat?: RunFormat };
type WordStyle = { id: string; name: string; basedOn?: string; run: RunFormat; paragraph: ParagraphFormat };
type WordStyles = { runDefaults: RunFormat; paragraphDefaults: ParagraphFormat; styles: Map<string, WordStyle>; resolve: (id: string) => WordStyle | undefined; theme: Record<string, string> };

function xmlDocument(xml: string) {
  if (xml.length > MAX_XML_TEXT_BYTES) throw new Error('압축 해제된 DOCX 본문이 너무 큽니다.');
  const parsed = new DOMParser().parseFromString(xml, 'application/xml');
  if (parsed.querySelector('parsererror')) throw new Error('DOCX의 문서 XML을 읽을 수 없습니다.');
  return parsed;
}

function localName(element: Element) { return element.localName.includes(':') ? element.localName.split(':').pop()! : element.localName; }
function isTag(element: Element, namespace: string, name: string) { return localName(element) === name && (!element.namespaceURI || element.namespaceURI === namespace || element.tagName.includes(':')); }
function elements(parent: Element) { return Array.from(parent.children); }
function child(parent: Element | null | undefined, namespace: string, name: string) { return parent ? elements(parent).find((element) => isTag(element, namespace, name)) ?? null : null; }
function descendants(parent: Element, namespace: string, name: string) { return Array.from(parent.getElementsByTagName('*')).filter((element) => isTag(element, namespace, name)); }
function first(parent: Element, namespace: string, name: string) { return descendants(parent, namespace, name)[0] ?? null; }
function wordValue(element: Element | null, name = 'val') { return element?.getAttributeNS(W, name) ?? element?.getAttribute(`w:${name}`) ?? element?.getAttribute(name) ?? ''; }
function relationId(element: Element | null) { return element?.getAttributeNS(R, 'id') ?? element?.getAttribute('r:id') ?? ''; }
function embeddedRelationId(element: Element | null) { return element?.getAttributeNS(R, 'embed') ?? element?.getAttributeNS(R, 'link') ?? element?.getAttribute('r:embed') ?? element?.getAttribute('r:link') ?? ''; }
function number(value: string | null | undefined, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function emuToPx(value: string | null | undefined) { return number(value) / EMU_PER_PX; }
function twipsToMm(value: string | null | undefined, fallback: number) { return value ? Math.round(number(value) / TWIPS_PER_INCH * 25.4 * 10) / 10 : fallback; }
function twipsToPx(value: string | null | undefined) { return number(value) / TWIPS_PER_INCH * 96; }

function onOff(element: Element | null) {
  if (!element) return undefined;
  return !['0', 'false', 'off', 'none'].includes(wordValue(element).toLowerCase());
}

function parseRunProperties(properties: Element | null, theme: Record<string, string>): RunFormat {
  if (!properties) return {};
  const fonts = child(properties, W, 'rFonts');
  const eastAsiaTheme = wordValue(fonts, 'eastAsiaTheme');
  const asciiTheme = wordValue(fonts, 'asciiTheme') || wordValue(fonts, 'hAnsiTheme');
  const fontFamily = wordValue(fonts, 'eastAsia') || theme[eastAsiaTheme.replace('HAnsi', 'EastAsia')] || theme[eastAsiaTheme] || wordValue(fonts, 'ascii') || wordValue(fonts, 'hAnsi') || theme[asciiTheme] || undefined;
  const size = child(properties, W, 'sz') ?? child(properties, W, 'szCs');
  const points = number(wordValue(size)) / 2;
  const colorValue = wordValue(child(properties, W, 'color'));
  const spacing = wordValue(child(properties, W, 'spacing'));
  const stretch = wordValue(child(properties, W, 'w'));
  const position = wordValue(child(properties, W, 'position'));
  const vertAlign = wordValue(child(properties, W, 'vertAlign'));
  const highlightValue = wordValue(child(properties, W, 'highlight'));
  const bold = child(properties, W, 'b') ?? child(properties, W, 'bCs');
  const italic = child(properties, W, 'i') ?? child(properties, W, 'iCs');
  const highlightColors: Record<string, string> = { yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', blue: '#0000ff', red: '#ff0000', darkBlue: '#000080', darkCyan: '#008080', darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000', darkYellow: '#808000', darkGray: '#808080', lightGray: '#c0c0c0', black: '#000000', white: '#ffffff' };
  return {
    ...(fontFamily ? { fontFamily } : {}),
    ...(points > 0 ? { fontSize: `${points}pt` } : {}),
    ...(/^[0-9a-f]{6}$/i.test(colorValue) ? { color: `#${colorValue}` } : {}),
    ...(onOff(bold) !== undefined ? { bold: onOff(bold) } : {}),
    ...(onOff(italic) !== undefined ? { italic: onOff(italic) } : {}),
    ...(onOff(child(properties, W, 'u')) !== undefined ? { underline: onOff(child(properties, W, 'u')) } : {}),
    ...(onOff(child(properties, W, 'strike')) !== undefined ? { strike: onOff(child(properties, W, 'strike')) } : {}),
    ...(spacing ? { letterSpacing: `${number(spacing) / 20}pt` } : {}),
    ...(stretch ? { fontStretch: `${number(stretch)}%` } : {}),
    ...(position ? { baselineShift: `${number(position) / 2}pt` } : {}),
    ...(vertAlign === 'superscript' ? { verticalAlign: 'super' } : vertAlign === 'subscript' ? { verticalAlign: 'sub' } : {}),
    ...(highlightColors[highlightValue] ? { highlight: highlightColors[highlightValue] } : {}),
    ...(onOff(child(properties, W, 'vanish')) !== undefined ? { hidden: onOff(child(properties, W, 'vanish')) } : {}),
    ...(wordValue(child(properties, W, 'rStyle')) ? { characterStyle: wordValue(child(properties, W, 'rStyle')) } : {}),
  };
}

function parseParagraphProperties(properties: Element | null, theme: Record<string, string>): ParagraphFormat {
  if (!properties) return {};
  const spacing = child(properties, W, 'spacing');
  const line = wordValue(spacing, 'line'); const lineRule = wordValue(spacing, 'lineRule');
  const before = wordValue(spacing, 'before'); const after = wordValue(spacing, 'after');
  const indentation = child(properties, W, 'ind');
  const firstLine = wordValue(indentation, 'firstLine'); const hanging = wordValue(indentation, 'hanging');
  const alignment = wordValue(child(properties, W, 'jc'));
  const styleId = wordValue(child(properties, W, 'pStyle'));
  return {
    ...(styleId ? { styleId } : {}),
    ...(alignment ? { textAlign: alignment === 'both' || alignment === 'distribute' ? 'justify' : alignment } : {}),
    ...(line ? { lineHeight: lineRule === 'auto' || !lineRule ? String(Math.max(0.5, number(line) / 240)) : `${twipsToPx(line)}px` } : {}),
    ...(before ? { spaceBeforePx: twipsToPx(before) } : {}),
    ...(after ? { spaceAfterPx: twipsToPx(after) } : {}),
    ...(wordValue(indentation, 'left') || wordValue(indentation, 'start') ? { marginLeftPx: twipsToPx(wordValue(indentation, 'left') || wordValue(indentation, 'start')) } : {}),
    ...(wordValue(indentation, 'right') || wordValue(indentation, 'end') ? { marginRightPx: twipsToPx(wordValue(indentation, 'right') || wordValue(indentation, 'end')) } : {}),
    ...(firstLine ? { textIndentPx: twipsToPx(firstLine) } : hanging ? { textIndentPx: -twipsToPx(hanging) } : {}),
    ...(onOff(child(properties, W, 'pageBreakBefore')) ? { pageBreakBefore: true } : {}),
    ...(child(properties, W, 'rPr') ? { runFormat: parseRunProperties(child(properties, W, 'rPr'), theme) } : {}),
  };
}

function mergedStyle(base: WordStyle | undefined, next: WordStyle): WordStyle {
  return { ...next, run: { ...(base?.run ?? {}), ...next.run }, paragraph: { ...(base?.paragraph ?? {}), ...next.paragraph, runFormat: { ...(base?.paragraph.runFormat ?? {}), ...(next.paragraph.runFormat ?? {}) } } };
}

async function wordStyles(zip: JSZip): Promise<WordStyles> {
  const theme: Record<string, string> = {};
  const themeXml = await zip.file('word/theme/theme1.xml')?.async('text');
  if (themeXml) {
    const parsed = xmlDocument(themeXml);
    for (const [prefix, name] of [['major', 'majorFont'], ['minor', 'minorFont']] as const) {
      const group = descendants(parsed.documentElement, A, name)[0];
      if (!group) continue;
      const latin = child(group, A, 'latin')?.getAttribute('typeface') || '';
      const korean = elements(group).find((item) => isTag(item, A, 'font') && item.getAttribute('script') === 'Hang')?.getAttribute('typeface') || '';
      if (latin) theme[`${prefix}HAnsi`] = latin;
      if (korean) theme[`${prefix}EastAsia`] = korean;
    }
  }
  const source = await zip.file('word/styles.xml')?.async('text');
  if (!source) { const empty = new Map<string, WordStyle>(); return { runDefaults: {}, paragraphDefaults: {}, styles: empty, resolve: () => undefined, theme }; }
  const parsed = xmlDocument(source); const defaults = descendants(parsed.documentElement, W, 'docDefaults')[0];
  const runDefaults = parseRunProperties(defaults ? descendants(defaults, W, 'rPr')[0] ?? null : null, theme);
  const paragraphDefaults = parseParagraphProperties(defaults ? descendants(defaults, W, 'pPr')[0] ?? null : null, theme);
  const styles = new Map<string, WordStyle>();
  for (const item of descendants(parsed.documentElement, W, 'style')) {
    const id = wordValue(item, 'styleId'); if (!id) continue;
    styles.set(id, { id, name: wordValue(child(item, W, 'name')), basedOn: wordValue(child(item, W, 'basedOn')) || undefined, run: parseRunProperties(child(item, W, 'rPr'), theme), paragraph: parseParagraphProperties(child(item, W, 'pPr'), theme) });
  }
  const cache = new Map<string, WordStyle>(); const resolving = new Set<string>();
  const resolve = (id: string): WordStyle | undefined => {
    if (!id) return undefined; if (cache.has(id)) return cache.get(id); const style = styles.get(id); if (!style || resolving.has(id)) return style;
    resolving.add(id); const result = mergedStyle(style.basedOn ? resolve(style.basedOn) : undefined, style); resolving.delete(id); cache.set(id, result); return result;
  };
  return { runDefaults, paragraphDefaults, styles, resolve, theme };
}

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
  return { ...selected, margins, customSizeMm, gutterMm, mirrorMargins, sourceWidthPx: widthMm / 25.4 * 96, sourceHeightPx: heightMm / 25.4 * 96, header: header.text, footer: footer.text, hasPageField: header.hasPageField || footer.hasPageField, pageNumberPosition };
}

function richMarks(run: Element, inherited: RunFormat, styles: WordStyles) {
  const properties = child(run, W, 'rPr'); const direct = parseRunProperties(properties, styles.theme);
  const character = direct.characterStyle ? styles.resolve(direct.characterStyle)?.run : undefined;
  const format = { ...inherited, ...(character ?? {}), ...direct };
  if (format.hidden) return [];
  const marks: Array<{ type: string; attrs?: Record<string, unknown> }> = [];
  if (format.bold) marks.push({ type: 'bold' });
  if (format.italic) marks.push({ type: 'italic' });
  if (format.underline) marks.push({ type: 'underline' });
  if (format.strike) marks.push({ type: 'strike' });
  if (format.highlight) marks.push({ type: 'highlight', attrs: { color: format.highlight } });
  const style: Record<string, unknown> = {};
  for (const key of ['fontFamily', 'fontSize', 'color', 'letterSpacing', 'fontStretch', 'baselineShift', 'verticalAlign'] as const) if (format[key]) style[key] = format[key];
  if (Object.keys(style).length) marks.push({ type: 'textStyle', attrs: style });
  return marks;
}

function paragraphShape(paragraph: Element, styles: WordStyles) {
  const properties = child(paragraph, W, 'pPr'); const direct = parseParagraphProperties(properties, styles.theme);
  const style = direct.styleId ? styles.resolve(direct.styleId) : undefined;
  const effective: ParagraphFormat = { ...styles.paragraphDefaults, ...(style?.paragraph ?? {}), ...direct, runFormat: { ...styles.runDefaults, ...(style?.run ?? {}), ...(style?.paragraph.runFormat ?? {}), ...(direct.runFormat ?? {}) } };
  const heading = /(?:heading|제목)\s*([1-6])/i.exec(style?.name ?? '');
  const attrs = Object.fromEntries(Object.entries({
    ...(heading ? { level: Math.min(3, number(heading[1], 1)) } : {}),
    textAlign: effective.textAlign, lineHeight: effective.lineHeight, spaceBeforePx: effective.spaceBeforePx, spaceAfterPx: effective.spaceAfterPx,
    marginLeftPx: effective.marginLeftPx, marginRightPx: effective.marginRightPx, textIndentPx: effective.textIndentPx,
  }).filter(([, value]) => value !== undefined));
  return { type: heading ? 'heading' : 'paragraph', attrs, properties, runFormat: effective.runFormat ?? {}, pageBreakBefore: effective.pageBreakBefore };
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
  const styles = await wordStyles(zip);
  const settingsXml = await zip.file('word/settings.xml')?.async('text'); const settings = settingsXml ? xmlDocument(settingsXml) : null;
  const mirrorMargins = Boolean(settings && descendants(settings.documentElement, W, 'mirrorMargins').length);
  const hasRenderedBreaks = descendants(body, W, 'lastRenderedPageBreak').length > 0;
  const sections = descendants(body, W, 'sectPr');
  const layouts = await Promise.all((sections.length ? sections : [null]).map((section) => sectionLayout(zip, section, relationMap, mirrorMargins)));
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
  let boundaryOpen = false; let lastBoundary: 'rendered' | 'explicit' | 'section' | null = null; let lastBoundaryScope = -1; let paragraphSequence = 0;
  const targetSize = () => ({ width: layout.sourceWidthPx, height: layout.sourceHeightPx });
  const pageBreak = (kind: 'rendered' | 'explicit' | 'section', scope: number) => {
    if (kind === 'section' && boundaryOpen) return;
    if (boundaryOpen && lastBoundaryScope === scope && lastBoundary !== kind) return;
    if (builders.length >= MAX_DOCUMENT_PAGES) throw new Error(`가져올 문서는 최대 ${MAX_DOCUMENT_PAGES}쪽까지 지원합니다.`);
    builder = newBuilder(layout, builders.length); builders.push(builder); boundaryOpen = true; lastBoundary = kind; lastBoundaryScope = scope;
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
    const shape = paragraphShape(paragraph, styles); const alignment = String(shape.attrs.textAlign ?? 'left'); let inline: RichNode[] = [];
    const flush = () => { const node: RichNode = { type: shape.type, attrs: shape.attrs, ...(inline.length ? { content: inline } : {}) }; (builder.page.textFlow.content as RichNode[]).push(node); const characters = inline.reduce((sum, item) => sum + (item.text?.length ?? 1), 0); builder.estimatedY += Math.max(22, Math.ceil(characters / 45) * 22); if (characters) touch(); inline = []; };
    const walk = async (element: Element, marks: RichNode['marks'] = []) => {
      if (isTag(element, W, 'r')) { const nextMarks = richMarks(element, shape.runFormat, styles); for (const child of elements(element).filter((item) => localName(item) !== 'rPr')) await walk(child, nextMarks); return; }
      if (isTag(element, W, 't')) { inline.push({ type: 'text', text: element.textContent ?? '', ...(marks?.length ? { marks } : {}) }); return; }
      if (isTag(element, W, 'tab')) { inline.push({ type: 'text', text: '\t', ...(marks?.length ? { marks } : {}) }); return; }
      if (isTag(element, W, 'lastRenderedPageBreak')) { flush(); pageBreak('rendered', scope); return; }
      if (isTag(element, W, 'br')) { if (wordValue(element, 'type') === 'page') { flush(); pageBreak('explicit', scope); } else inline.push({ type: 'hardBreak' }); return; }
      if (isTag(element, W, 'drawing')) { for (const item of descendants(element, WP, 'anchor').concat(descendants(element, WP, 'inline'))) await addDrawing(item, alignment); return; }
      if (isTag(element, W, 'pict')) { await addVml(element, alignment); return; }
      for (const child of elements(element)) await walk(child, marks);
    };
    if (shape.pageBreakBefore) pageBreak('explicit', scope);
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
    if (hasRenderedBreaks) return [{ ...page, textFlow: sourceFlow }];
    const flows = paginateRichTextDocument(sourceFlow, { preset: page.preset, orientation: page.orientation, margins: page.margins, customSizeMm: page.customSizeMm, defaultFontSizePt: base.settings.defaultFontSize, lineHeight: base.settings.lineHeight, maxPages: MAX_DOCUMENT_PAGES });
    return flows.map((textFlow, index) => index === 0 ? { ...page, textFlow } : { ...createPage(textFlow, page.preset, page.orientation, page.margins), header: page.header, footer: page.footer, customSizeMm: page.customSizeMm, guideStyle: page.guideStyle });
  });
  if (pages.length > MAX_DOCUMENT_PAGES) throw new Error(`가져올 문서는 최대 ${MAX_DOCUMENT_PAGES}쪽까지 지원합니다.`);
  const pageLayout = layouts.find((item) => item.hasPageField);
  return { ...base, name: file.name.replace(/\.[^.]+$/, '').trim() || '가져온 문서', settings: { ...base.settings, defaultFont: styles.runDefaults.fontFamily || base.settings.defaultFont, defaultFontSize: number(styles.runDefaults.fontSize?.replace('pt', ''), base.settings.defaultFontSize), lineHeight: number(styles.paragraphDefaults.lineHeight, base.settings.lineHeight), pageNumber: { ...base.settings.pageNumber, enabled: Boolean(pageLayout), position: pageLayout?.pageNumberPosition ?? 'footer-center' } }, fonts: Array.from(new Set([...base.fonts, ...Array.from(styles.styles.values()).map((item) => item.run.fontFamily).filter((font): font is string => Boolean(font)), ...(styles.runDefaults.fontFamily ? [styles.runDefaults.fontFamily] : [])])), pages } as EditorDocument;
}
