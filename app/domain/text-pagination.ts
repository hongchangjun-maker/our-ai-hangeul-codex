import { createPage, defaultMarginsForPreset, MAX_DOCUMENT_PAGES, PAGE_PRESETS, type DocumentPage, type EditorDocument, type Orientation, type PageMargins, type PagePreset, type RichTextDocument } from './document';
import { fitPageObjects, mmToPx } from './geometry';

type RichNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
  content?: RichNode[];
};

export interface TextPaginationOptions {
  preset: PagePreset;
  orientation: Orientation;
  margins: PageMargins;
  defaultFontSizePt?: number;
  lineHeight?: number;
  maxPages?: number;
  customSizeMm?: { widthMm: number; heightMm: number };
}

const PAGE_FILL_RATIO = 1;
const DEFAULT_FONT_SIZE_PT = 11;
const DEFAULT_LINE_HEIGHT = 1.7;

function pointsToPixels(points: number) { return points * 96 / 72; }

function fontSizeFromMarks(node: RichNode, fallbackPx: number) {
  const value = node.marks?.find((mark) => mark.type === 'textStyle')?.attrs?.fontSize;
  if (typeof value !== 'string') return fallbackPx;
  const match = /^(\d+(?:\.\d+)?)(pt|px)$/.exec(value.trim());
  if (!match) return fallbackPx;
  const size = Number(match[1]);
  return match[2] === 'pt' ? pointsToPixels(size) : size;
}

function maximumInlineFont(node: RichNode, fallbackPx: number): number {
  const own = node.text ? fontSizeFromMarks(node, fallbackPx) : fallbackPx;
  return Math.max(own, ...(node.content ?? []).map((child) => maximumInlineFont(child, fallbackPx)));
}

function characterWidth(character: string, fontPx: number) {
  if (/\s/u.test(character)) return fontPx * 0.34;
  if (/[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff]/u.test(character)) return fontPx;
  if (/[A-Za-z0-9]/u.test(character)) return fontPx * 0.56;
  return fontPx * 0.62;
}

function countInlineLines(nodes: RichNode[] | undefined, widthPx: number, fallbackPx: number) {
  let lines = 1; let used = 0;
  const visit = (node: RichNode) => {
    if (node.type === 'hardBreak') { lines += 1; used = 0; return; }
    if (typeof node.text === 'string') {
      const fontPx = fontSizeFromMarks(node, fallbackPx);
      for (const character of Array.from(node.text)) {
        const width = character === '\t' ? fontPx * 1.36 : characterWidth(character, fontPx);
        if (used > 0 && used + width > widthPx) { lines += 1; used = 0; }
        used += width;
      }
      return;
    }
    for (const child of node.content ?? []) visit(child);
  };
  for (const node of nodes ?? []) visit(node);
  return lines;
}

function textBlockMetrics(node: RichNode, options: Required<Pick<TextPaginationOptions, 'defaultFontSizePt' | 'lineHeight'>>, widthPx: number) {
  const level = Number(node.attrs?.level ?? 1);
  const bodyFontPx = pointsToPixels(options.defaultFontSizePt);
  const cssFontPx = node.type === 'heading' ? (level === 1 ? 32 : level === 2 ? 23 : 19) : bodyFontPx;
  const fontPx = maximumInlineFont(node, cssFontPx);
  const storedLineHeight = typeof node.attrs?.lineHeight === 'string' ? node.attrs.lineHeight.trim() : '';
  const lineHeight = storedLineHeight.endsWith('px') ? Number(storedLineHeight.slice(0, -2)) : storedLineHeight && Number.isFinite(Number(storedLineHeight)) ? fontPx * Number(storedLineHeight) : node.type === 'heading' ? fontPx * (level === 1 ? 1.3 : level === 2 ? 1.4 : options.lineHeight) : fontPx * options.lineHeight;
  const rawBefore = node.attrs?.spaceBeforePx; const rawAfter = node.attrs?.spaceAfterPx;
  const spacingBefore = rawBefore === null || rawBefore === undefined || rawBefore === '' ? Number.NaN : Number(rawBefore);
  const spacingAfter = rawAfter === null || rawAfter === undefined || rawAfter === '' ? Number.NaN : Number(rawAfter);
  const hasStoredSpacing = Number.isFinite(spacingBefore) || Number.isFinite(spacingAfter);
  const margin = hasStoredSpacing ? Math.max(Number.isFinite(spacingBefore) ? spacingBefore : 0, Number.isFinite(spacingAfter) ? spacingAfter : 0) : node.type === 'heading' ? (level === 1 ? 26 : level === 2 ? 40 : 32) : 14;
  return { fontPx, lineHeight, margin, lines: countInlineLines(node.content, widthPx, fontPx) };
}

function estimateNodeHeight(node: RichNode, options: Required<Pick<TextPaginationOptions, 'defaultFontSizePt' | 'lineHeight'>>, widthPx: number): number {
  if (node.type === 'paragraph' || node.type === 'heading') {
    const metrics = textBlockMetrics(node, options, widthPx);
    return metrics.lines * metrics.lineHeight + metrics.margin;
  }
  if (node.type === 'table') return 36 + (node.content ?? []).reduce((sum, row) => sum + estimateNodeHeight(row, options, widthPx), 0);
  if (node.type === 'tableRow') return Math.max(34, ...(node.content ?? []).map((cell) => estimateNodeHeight(cell, options, Math.max(60, widthPx / Math.max(1, node.content?.length ?? 1))))) + 16;
  if (node.type === 'tableCell' || node.type === 'tableHeader') return (node.content ?? []).reduce((sum, child) => sum + estimateNodeHeight(child, options, widthPx), 0);
  if (node.type === 'bulletList' || node.type === 'orderedList') return 8 + (node.content ?? []).reduce((sum, child) => sum + estimateNodeHeight(child, options, widthPx - 26), 0);
  if (node.type === 'listItem') return (node.content ?? []).reduce((sum, child) => sum + estimateNodeHeight(child, options, widthPx), 0);
  if (node.type === 'blockquote') return 52 + (node.content ?? []).reduce((sum, child) => sum + estimateNodeHeight(child, options, widthPx - 30), 0);
  if (node.content?.length) return node.content.reduce((sum, child) => sum + estimateNodeHeight(child, options, widthPx), 0);
  return pointsToPixels(options.defaultFontSizePt) * options.lineHeight + 14;
}

function splitTextBlock(node: RichNode, capacity: number, widthPx: number, options: Required<Pick<TextPaginationOptions, 'defaultFontSizePt' | 'lineHeight'>>) {
  const metrics = textBlockMetrics(node, options, widthPx);
  const maxLines = Math.max(1, Math.floor((capacity - metrics.margin) / metrics.lineHeight));
  const parts: RichNode[] = []; let content: RichNode[] = []; let line = 1; let used = 0; let activeText: RichNode | null = null;
  const finish = () => { if (content.length || !parts.length) parts.push({ ...structuredClone(node), content }); content = []; line = 1; used = 0; activeText = null; };
  const advanceLine = () => { line += 1; used = 0; if (line > maxLines) finish(); };
  const visit = (item: RichNode) => {
    if (item.type === 'hardBreak') { content.push(structuredClone(item)); activeText = null; advanceLine(); return; }
    if (typeof item.text === 'string') {
      const fontPx = fontSizeFromMarks(item, metrics.fontPx); activeText = null;
      for (const character of Array.from(item.text)) {
        const width = character === '\t' ? fontPx * 1.36 : characterWidth(character, fontPx);
        if (used > 0 && used + width > widthPx) advanceLine();
        if (!activeText) { activeText = { ...structuredClone(item), text: '', content: undefined }; content.push(activeText); }
        activeText.text = `${activeText.text ?? ''}${character}`; used += width;
      }
      return;
    }
    for (const child of item.content ?? []) visit(child);
  };
  for (const item of node.content ?? []) visit(item);
  if (content.length) parts.push({ ...structuredClone(node), content });
  return parts.length ? parts : [{ ...structuredClone(node), content: [] }];
}

function splitContainer(node: RichNode, capacity: number, options: Required<Pick<TextPaginationOptions, 'defaultFontSizePt' | 'lineHeight'>>, widthPx: number, fixedHeight: number) {
  const parts: RichNode[] = []; let children: RichNode[] = []; let used = fixedHeight;
  for (const child of node.content ?? []) {
    const height = estimateNodeHeight(child, options, widthPx);
    if (children.length && used + height > capacity) { parts.push({ ...structuredClone(node), content: children }); children = []; used = fixedHeight; }
    children.push(structuredClone(child)); used += height;
  }
  if (children.length) parts.push({ ...structuredClone(node), content: children });
  return parts.length ? parts : [structuredClone(node)];
}

function splitOversizedNode(node: RichNode, capacity: number, options: Required<Pick<TextPaginationOptions, 'defaultFontSizePt' | 'lineHeight'>>, widthPx: number) {
  if (node.type === 'paragraph' || node.type === 'heading') return splitTextBlock(node, capacity, widthPx, options);
  if (node.type === 'table') return splitContainer(node, capacity, options, widthPx, 36);
  if (node.type === 'bulletList' || node.type === 'orderedList') return splitContainer(node, capacity, options, widthPx - 26, 8);
  if (node.content && node.content.length > 1) return splitContainer(node, capacity, options, widthPx, node.type === 'blockquote' ? 52 : 0);
  return [structuredClone(node)];
}

export function textPageCapacity(options: TextPaginationOptions) {
  const dimensions = PAGE_PRESETS[options.preset]; const portrait = options.orientation === 'portrait';
  const widthMm = options.customSizeMm?.widthMm ?? (portrait ? dimensions.widthMm : dimensions.heightMm);
  const heightMm = options.customSizeMm?.heightMm ?? (portrait ? dimensions.heightMm : dimensions.widthMm);
  return {
    widthPx: Math.max(48, mmToPx(widthMm - options.margins.left - options.margins.right)),
    heightPx: Math.max(48, mmToPx(heightMm - options.margins.top - options.margins.bottom) * PAGE_FILL_RATIO),
  };
}

export function estimateRichTextHeight(flow: RichTextDocument, options: TextPaginationOptions) {
  const metrics = textPageCapacity(options);
  const normalized = { defaultFontSizePt: options.defaultFontSizePt ?? DEFAULT_FONT_SIZE_PT, lineHeight: options.lineHeight ?? DEFAULT_LINE_HEIGHT };
  return ((flow.content ?? []) as RichNode[]).reduce((sum, node) => sum + estimateNodeHeight(node, normalized, metrics.widthPx), 0);
}

export function paginateRichTextDocument(flow: RichTextDocument, options: TextPaginationOptions): RichTextDocument[] {
  const metrics = textPageCapacity(options);
  const normalized = { defaultFontSizePt: options.defaultFontSizePt ?? DEFAULT_FONT_SIZE_PT, lineHeight: options.lineHeight ?? DEFAULT_LINE_HEIGHT };
  const maxPages = options.maxPages ?? 500;
  const pages: RichNode[][] = [[]]; let used = 0;
  const newPage = () => {
    if (pages.length >= maxPages) throw new Error(`가져올 문서는 최대 ${maxPages}쪽까지 지원합니다.`);
    pages.push([]); used = 0;
  };
  for (const original of (flow.content ?? []) as RichNode[]) {
    const pending = [structuredClone(original)];
    while (pending.length) {
      const node = pending.shift()!; const height = estimateNodeHeight(node, normalized, metrics.widthPx);
      if (pages.at(-1)!.length && used + height > metrics.heightPx) { newPage(); pending.unshift(node); continue; }
      if (!pages.at(-1)!.length && height > metrics.heightPx) {
        const parts = splitOversizedNode(node, metrics.heightPx, normalized, metrics.widthPx);
        if (parts.length > 1) { pending.unshift(...parts); continue; }
      }
      pages.at(-1)!.push(node); used += Math.min(height, metrics.heightPx);
    }
  }
  const fitted = pages.filter((content) => content.length).map((content) => ({ type: 'doc', content }) as RichTextDocument);
  return fitted.length ? fitted : [{ type: 'doc', content: [{ type: 'paragraph' }] }];
}

export function applyPaperPresetToAllPages(document: EditorDocument, preset: PagePreset): EditorDocument {
  const margins = defaultMarginsForPreset(preset); const pages: DocumentPage[] = [];
  for (const source of document.pages) {
    const flows = paginateRichTextDocument(source.textFlow, { preset, orientation: source.orientation, margins, defaultFontSizePt: document.settings.defaultFontSize, lineHeight: document.settings.lineHeight, maxPages: MAX_DOCUMENT_PAGES });
    for (const [index, textFlow] of flows.entries()) {
      if (pages.length >= MAX_DOCUMENT_PAGES) throw new Error(`문서는 최대 ${MAX_DOCUMENT_PAGES}쪽까지 만들 수 있습니다.`);
      pages.push(index === 0 ? fitPageObjects({ ...source, preset, margins, textFlow, customSizeMm: undefined, guideStyle: 'box' }) : { ...createPage(textFlow, preset, source.orientation, margins), background: source.background, header: source.header, footer: source.footer, guideStyle: 'box' });
    }
  }
  return { ...document, pages };
}

export interface OverflowPageSplit {
  document: EditorDocument;
  didSplit: boolean;
  nextPageIndex: number | null;
  nextPageId: string | null;
}

export function splitOverflowingPage(document: EditorDocument, pageIndex: number, textFlow: RichTextDocument): OverflowPageSplit {
  const page = document.pages[pageIndex];
  if (!page) return { document, didSplit: false, nextPageIndex: null, nextPageId: null };
  const flows = paginateRichTextDocument(textFlow, {
    preset: page.preset,
    orientation: page.orientation,
    margins: page.margins,
    defaultFontSizePt: document.settings.defaultFontSize,
    lineHeight: document.settings.lineHeight,
    maxPages: MAX_DOCUMENT_PAGES,
    customSizeMm: page.customSizeMm,
  });
  if (flows.length <= 1) return { document, didSplit: false, nextPageIndex: null, nextPageId: null };
  const additionalPages = flows.length - 1;
  if (document.pages.length + additionalPages > MAX_DOCUMENT_PAGES) throw new Error(`문서는 최대 ${MAX_DOCUMENT_PAGES}쪽까지 만들 수 있습니다.`);
  const overflowPages = flows.slice(1).map((flow) => ({
    ...createPage(flow, page.preset, page.orientation, page.margins),
    background: page.background,
    header: page.header,
    footer: page.footer,
    customSizeMm: page.customSizeMm,
    guideStyle: page.guideStyle,
  }));
  const nextPageIndex = pageIndex + overflowPages.length;
  return {
    document: {
      ...document,
      pages: [
        ...document.pages.slice(0, pageIndex),
        { ...page, textFlow: flows[0] },
        ...overflowPages,
        ...document.pages.slice(pageIndex + 1),
      ],
    },
    didSplit: true,
    nextPageIndex,
    nextPageId: overflowPages.at(-1)!.id,
  };
}
