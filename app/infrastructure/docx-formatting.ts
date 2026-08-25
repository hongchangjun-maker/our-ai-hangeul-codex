import JSZip from 'jszip';

export const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';

const MAX_XML_TEXT_BYTES = 8 * 1024 * 1024;
const TWIPS_PER_INCH = 1_440;

export type DocxRichNode = { type: string; text?: string; attrs?: Record<string, unknown>; marks?: Array<{ type: string; attrs?: Record<string, unknown> }>; content?: DocxRichNode[] };
export type RunFormat = { fontFamily?: string; latinFontFamily?: string; eastAsiaFontFamily?: string; complexFontFamily?: string; fontSize?: string; color?: string; bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; letterSpacing?: string; fontStretch?: string; baselineShift?: string; verticalAlign?: string; highlight?: string; hidden?: boolean; characterStyle?: string };
type ParagraphFormat = { styleId?: string; styleName?: string; textAlign?: string; lineHeight?: string; spaceBeforePx?: number; spaceAfterPx?: number; autoSpaceBefore?: boolean; autoSpaceAfter?: boolean; snapToGrid?: boolean; marginLeftPx?: number; marginRightPx?: number; textIndentPx?: number; pageBreakBefore?: boolean; runFormat?: RunFormat };
type WordStyle = { id: string; name: string; basedOn?: string; run: RunFormat; paragraph: ParagraphFormat };
export type WordStyles = { runDefaults: RunFormat; paragraphDefaults: ParagraphFormat; styles: Map<string, WordStyle>; resolve: (id: string) => WordStyle | undefined; theme: Record<string, string> };

export function xmlDocument(xml: string) {
  if (xml.length > MAX_XML_TEXT_BYTES) throw new Error('압축 해제된 DOCX 본문이 너무 큽니다.');
  const parsed = new DOMParser().parseFromString(xml, 'application/xml');
  if (parsed.querySelector('parsererror')) throw new Error('DOCX의 문서 XML을 읽을 수 없습니다.');
  return parsed;
}

export function localName(element: Element) { return element.localName.includes(':') ? element.localName.split(':').pop()! : element.localName; }
export function isTag(element: Element, namespace: string, name: string) { return localName(element) === name && (!element.namespaceURI || element.namespaceURI === namespace || element.tagName.includes(':')); }
export function elements(parent: Element) { return Array.from(parent.children); }
export function child(parent: Element | null | undefined, namespace: string, name: string) { return parent ? elements(parent).find((element) => isTag(element, namespace, name)) ?? null : null; }
export function descendants(parent: Element, namespace: string, name: string) { return Array.from(parent.getElementsByTagName('*')).filter((element) => isTag(element, namespace, name)); }
export function first(parent: Element, namespace: string, name: string) { return descendants(parent, namespace, name)[0] ?? null; }
export function wordValue(element: Element | null, name = 'val') { return element?.getAttributeNS(W, name) ?? element?.getAttribute(`w:${name}`) ?? element?.getAttribute(name) ?? ''; }
export function number(value: string | null | undefined, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
export function twipsToPx(value: string | null | undefined) { return number(value) / TWIPS_PER_INCH * 96; }

function onOff(element: Element | null) {
  if (!element) return undefined;
  return !['0', 'false', 'off', 'none'].includes(wordValue(element).toLowerCase());
}

function parseRunProperties(properties: Element | null, theme: Record<string, string>): RunFormat {
  if (!properties) return {};
  const fonts = child(properties, W, 'rFonts');
  const eastAsiaTheme = wordValue(fonts, 'eastAsiaTheme');
  const asciiTheme = wordValue(fonts, 'asciiTheme') || wordValue(fonts, 'hAnsiTheme');
  const eastAsiaFontFamily = wordValue(fonts, 'eastAsia') || theme[eastAsiaTheme.replace('HAnsi', 'EastAsia')] || theme[eastAsiaTheme] || undefined;
  const latinFontFamily = wordValue(fonts, 'ascii') || wordValue(fonts, 'hAnsi') || theme[asciiTheme] || undefined;
  const complexFontFamily = wordValue(fonts, 'cs') || theme[wordValue(fonts, 'cstheme')] || undefined;
  const fontFamily = eastAsiaFontFamily || latinFontFamily || complexFontFamily;
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
    ...(fontFamily ? { fontFamily } : {}), ...(latinFontFamily ? { latinFontFamily } : {}), ...(eastAsiaFontFamily ? { eastAsiaFontFamily } : {}), ...(complexFontFamily ? { complexFontFamily } : {}),
    ...(points > 0 ? { fontSize: `${points}pt` } : {}), ...(/^[0-9a-f]{6}$/i.test(colorValue) ? { color: `#${colorValue}` } : {}),
    ...(onOff(bold) !== undefined ? { bold: onOff(bold) } : {}), ...(onOff(italic) !== undefined ? { italic: onOff(italic) } : {}),
    ...(onOff(child(properties, W, 'u')) !== undefined ? { underline: onOff(child(properties, W, 'u')) } : {}), ...(onOff(child(properties, W, 'strike')) !== undefined ? { strike: onOff(child(properties, W, 'strike')) } : {}),
    ...(spacing ? { letterSpacing: `${number(spacing) / 20}pt` } : {}), ...(stretch ? { fontStretch: `${number(stretch)}%` } : {}), ...(position ? { baselineShift: `${number(position) / 2}pt` } : {}),
    ...(vertAlign === 'superscript' ? { verticalAlign: 'super' } : vertAlign === 'subscript' ? { verticalAlign: 'sub' } : {}), ...(highlightColors[highlightValue] ? { highlight: highlightColors[highlightValue] } : {}),
    ...(onOff(child(properties, W, 'vanish')) !== undefined ? { hidden: onOff(child(properties, W, 'vanish')) } : {}), ...(wordValue(child(properties, W, 'rStyle')) ? { characterStyle: wordValue(child(properties, W, 'rStyle')) } : {}),
  };
}

function parseParagraphProperties(properties: Element | null, theme: Record<string, string>): ParagraphFormat {
  if (!properties) return {};
  const spacing = child(properties, W, 'spacing');
  const line = wordValue(spacing, 'line'); const lineRule = wordValue(spacing, 'lineRule'); const before = wordValue(spacing, 'before'); const after = wordValue(spacing, 'after');
  const beforeAutospacing = wordValue(spacing, 'beforeAutospacing'); const afterAutospacing = wordValue(spacing, 'afterAutospacing');
  const indentation = child(properties, W, 'ind'); const firstLine = wordValue(indentation, 'firstLine'); const hanging = wordValue(indentation, 'hanging');
  const alignment = wordValue(child(properties, W, 'jc')); const styleId = wordValue(child(properties, W, 'pStyle'));
  return {
    ...(styleId ? { styleId } : {}), ...(alignment ? { textAlign: alignment === 'both' || alignment === 'distribute' ? 'justify' : alignment } : {}),
    ...(line ? { lineHeight: lineRule === 'auto' || !lineRule ? String(Math.max(0.5, number(line) / 240)) : `${twipsToPx(line)}px` } : {}), ...(before ? { spaceBeforePx: twipsToPx(before) } : {}), ...(after ? { spaceAfterPx: twipsToPx(after) } : {}),
    ...(beforeAutospacing ? { autoSpaceBefore: !['0', 'false', 'off', 'none'].includes(beforeAutospacing.toLowerCase()) } : {}), ...(afterAutospacing ? { autoSpaceAfter: !['0', 'false', 'off', 'none'].includes(afterAutospacing.toLowerCase()) } : {}),
    ...(onOff(child(properties, W, 'snapToGrid')) !== undefined ? { snapToGrid: onOff(child(properties, W, 'snapToGrid')) } : {}),
    ...(wordValue(indentation, 'left') || wordValue(indentation, 'start') ? { marginLeftPx: twipsToPx(wordValue(indentation, 'left') || wordValue(indentation, 'start')) } : {}),
    ...(wordValue(indentation, 'right') || wordValue(indentation, 'end') ? { marginRightPx: twipsToPx(wordValue(indentation, 'right') || wordValue(indentation, 'end')) } : {}),
    ...(firstLine ? { textIndentPx: twipsToPx(firstLine) } : hanging ? { textIndentPx: -twipsToPx(hanging) } : {}), ...(onOff(child(properties, W, 'pageBreakBefore')) ? { pageBreakBefore: true } : {}),
    ...(child(properties, W, 'rPr') ? { runFormat: parseRunProperties(child(properties, W, 'rPr'), theme) } : {}),
  };
}

function mergedStyle(base: WordStyle | undefined, next: WordStyle): WordStyle {
  return { ...next, run: { ...(base?.run ?? {}), ...next.run }, paragraph: { ...(base?.paragraph ?? {}), ...next.paragraph, runFormat: { ...(base?.paragraph.runFormat ?? {}), ...(next.paragraph.runFormat ?? {}) } } };
}

export async function wordStyles(zip: JSZip): Promise<WordStyles> {
  const theme: Record<string, string> = {};
  const themeXml = await zip.file('word/theme/theme1.xml')?.async('text');
  if (themeXml) {
    const parsed = xmlDocument(themeXml);
    for (const [prefix, name] of [['major', 'majorFont'], ['minor', 'minorFont']] as const) {
      const group = descendants(parsed.documentElement, A, name)[0]; if (!group) continue;
      const latin = child(group, A, 'latin')?.getAttribute('typeface') || ''; const korean = elements(group).find((item) => isTag(item, A, 'font') && item.getAttribute('script') === 'Hang')?.getAttribute('typeface') || '';
      if (latin) theme[`${prefix}HAnsi`] = latin; if (korean) theme[`${prefix}EastAsia`] = korean;
    }
  }
  const source = await zip.file('word/styles.xml')?.async('text');
  if (!source) { const empty = new Map<string, WordStyle>(); return { runDefaults: {}, paragraphDefaults: {}, styles: empty, resolve: () => undefined, theme }; }
  const parsed = xmlDocument(source); const defaults = descendants(parsed.documentElement, W, 'docDefaults')[0];
  const runDefaults = parseRunProperties(defaults ? descendants(defaults, W, 'rPr')[0] ?? null : null, theme); const paragraphDefaults = parseParagraphProperties(defaults ? descendants(defaults, W, 'pPr')[0] ?? null : null, theme);
  const styles = new Map<string, WordStyle>();
  for (const item of descendants(parsed.documentElement, W, 'style')) { const id = wordValue(item, 'styleId'); if (id) styles.set(id, { id, name: wordValue(child(item, W, 'name')), basedOn: wordValue(child(item, W, 'basedOn')) || undefined, run: parseRunProperties(child(item, W, 'rPr'), theme), paragraph: parseParagraphProperties(child(item, W, 'pPr'), theme) }); }
  const cache = new Map<string, WordStyle>(); const resolving = new Set<string>();
  const resolve = (id: string): WordStyle | undefined => { if (!id) return undefined; if (cache.has(id)) return cache.get(id); const style = styles.get(id); if (!style || resolving.has(id)) return style; resolving.add(id); const result = mergedStyle(style.basedOn ? resolve(style.basedOn) : undefined, style); resolving.delete(id); cache.set(id, result); return result; };
  return { runDefaults, paragraphDefaults, styles, resolve, theme };
}

export function effectiveRunFormat(run: Element, inherited: RunFormat, styles: WordStyles) {
  const properties = child(run, W, 'rPr'); const direct = parseRunProperties(properties, styles.theme); const character = direct.characterStyle ? styles.resolve(direct.characterStyle)?.run : undefined;
  return { ...inherited, ...(character ?? {}), ...direct };
}

export function marksForFormat(format: RunFormat, fontFamily = format.fontFamily) {
  if (format.hidden) return [];
  const marks: Array<{ type: string; attrs?: Record<string, unknown> }> = [];
  if (format.bold) marks.push({ type: 'bold' }); if (format.italic) marks.push({ type: 'italic' }); if (format.underline) marks.push({ type: 'underline' }); if (format.strike) marks.push({ type: 'strike' }); if (format.highlight) marks.push({ type: 'highlight', attrs: { color: format.highlight } });
  const style: Record<string, unknown> = {}; if (fontFamily) style.fontFamily = fontFamily;
  for (const key of ['fontSize', 'color', 'letterSpacing', 'fontStretch', 'baselineShift', 'verticalAlign'] as const) if (format[key]) style[key] = format[key];
  if (Object.keys(style).length) marks.push({ type: 'textStyle', attrs: style });
  return marks;
}

function maximumRunFontPx(paragraph: Element, inherited: RunFormat, styles: WordStyles) {
  const fallback = twipsToPx(String(number(inherited.fontSize?.replace('pt', '')) * 20)) || 11 * 96 / 72;
  return descendants(paragraph, W, 'r').reduce((maximum, run) => { const value = effectiveRunFormat(run, inherited, styles).fontSize; const pixels = value?.endsWith('pt') ? number(value.slice(0, -2)) * 96 / 72 : value?.endsWith('px') ? number(value.slice(0, -2)) : fallback; return Math.max(maximum, pixels); }, fallback);
}

export function paragraphShape(paragraph: Element, styles: WordStyles, linePitchPx: number) {
  const properties = child(paragraph, W, 'pPr'); const direct = parseParagraphProperties(properties, styles.theme); const style = direct.styleId ? styles.resolve(direct.styleId) : undefined;
  const effective: ParagraphFormat = { ...styles.paragraphDefaults, ...(style?.paragraph ?? {}), ...direct, runFormat: { ...styles.runDefaults, ...(style?.run ?? {}), ...(style?.paragraph.runFormat ?? {}), ...(direct.runFormat ?? {}) } };
  const heading = /(?:heading|제목)\s*([1-6])/i.exec(style?.name ?? ''); const maximumFontPx = maximumRunFontPx(paragraph, effective.runFormat ?? {}, styles); const storedLineHeight = effective.lineHeight ?? '';
  const nominalLineHeight = storedLineHeight.endsWith('px') ? number(storedLineHeight.slice(0, -2), maximumFontPx) : storedLineHeight ? maximumFontPx * number(storedLineHeight, 1) : maximumFontPx;
  const usesDocumentGrid = linePitchPx > 0 && effective.snapToGrid !== false && (effective.snapToGrid === true || !direct.styleId);
  const gridLineHeight = usesDocumentGrid ? Math.max(linePitchPx, Math.ceil(nominalLineHeight / linePitchPx) * linePitchPx) : nominalLineHeight; const lineHeight = usesDocumentGrid ? `${Math.round(gridLineHeight * 10_000) / 10_000}px` : effective.lineHeight;
  const spaceBeforePx = effective.autoSpaceBefore && linePitchPx > 0 ? linePitchPx : effective.spaceBeforePx; const spaceAfterPx = effective.autoSpaceAfter && linePitchPx > 0 ? linePitchPx : effective.spaceAfterPx;
  const attrs = Object.fromEntries(Object.entries({ ...(heading ? { level: Math.min(3, number(heading[1], 1)) } : {}), textAlign: effective.textAlign, lineHeight, spaceBeforePx, spaceAfterPx, marginLeftPx: effective.marginLeftPx, marginRightPx: effective.marginRightPx, textIndentPx: effective.textIndentPx }).filter(([, value]) => value !== undefined));
  return { type: heading ? 'heading' : 'paragraph', attrs, properties, runFormat: effective.runFormat ?? {}, pageBreakBefore: effective.pageBreakBefore };
}
