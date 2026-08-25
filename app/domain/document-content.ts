import type { EditorDocument } from './document';

type RichTextNode = {
  type?: string;
  text?: string;
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
  content?: RichTextNode[];
};

function textFromNode(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const value = node as RichTextNode;
  if (value.type === 'text') return value.text ?? '';
  const content = value.content?.map(textFromNode).join('') ?? '';
  return ['paragraph', 'heading', 'listItem', 'tableRow'].includes(value.type ?? '') ? `${content}\n` : content;
}

function nodeFontFamilies(node: unknown, result: Set<string>) {
  if (!node || typeof node !== 'object') return;
  const value = node as RichTextNode;
  for (const mark of value.marks ?? []) {
    const family = mark.type === 'textStyle' ? mark.attrs?.sourceFontFamily ?? mark.attrs?.fontFamily : undefined;
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
