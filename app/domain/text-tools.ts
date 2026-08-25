import type { EditorDocument, RichTextDocument } from './document';

type Node = { type?: string; text?: string; content?: Node[]; [key: string]: unknown };

export interface TextMatch { pageIndex: number; excerpt: string; count: number }
export interface KoreanIssue { pageIndex: number; found: string; replacement: string; reason: string; count: number }

const KOREAN_RULES = [
  { pattern: /안되요/g, replacement: '안 돼요', reason: '부정 표현 ‘안 되다’는 띄어 쓰고 ‘되어요’는 ‘돼요’로 줄입니다.' },
  { pattern: /되요/g, replacement: '돼요', reason: '‘되어요’의 준말은 ‘돼요’입니다.' },
  { pattern: /안되([는면고지])/g, replacement: '안 되$1', reason: '부정 표현 ‘안 되다’는 띄어 씁니다.' },
  { pattern: /할수/g, replacement: '할 수', reason: '의존 명사 ‘수’는 띄어 씁니다.' },
  { pattern: /될수/g, replacement: '될 수', reason: '의존 명사 ‘수’는 띄어 씁니다.' },
  { pattern: /몇일/g, replacement: '며칠', reason: '표준어는 ‘며칠’입니다.' },
  { pattern: /왠지/g, replacement: '왠지', reason: '‘왠지’는 올바른 표현입니다.', skip: true },
  { pattern: /\s+([,.!?])/g, replacement: '$1', reason: '문장 부호 앞의 불필요한 공백을 제거합니다.' },
  { pattern: / {2,}/g, replacement: ' ', reason: '연속된 공백을 하나로 줄입니다.' },
] as const;

export function paragraphsFromText(text: string): RichTextDocument {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  return { type: 'doc', content: lines.map((line) => line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' }) };
}

function walk(node: Node, visit: (node: Node) => void) {
  visit(node);
  node.content?.forEach((child) => walk(child, visit));
}

function pageText(page: EditorDocument['pages'][number]) {
  const parts: string[] = [];
  walk(page.textFlow as Node, (node) => { if (node.type === 'text' && node.text) parts.push(node.text); });
  page.objects.forEach((object) => { if (object.type === 'text-box' && object.text) parts.push(object.text); });
  return [page.header, ...parts, page.footer].filter(Boolean).join('\n');
}

function replaceInNode(node: Node, pattern: RegExp, replacement: string) {
  const copy = structuredClone(node);
  walk(copy, (item) => { if (item.type === 'text' && typeof item.text === 'string') item.text = item.text.replace(pattern, replacement); });
  return copy;
}

function escaped(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function findDocumentText(document: EditorDocument, query: string, caseSensitive = false): TextMatch[] {
  if (!query) return [];
  const pattern = new RegExp(escaped(query), caseSensitive ? 'g' : 'gi');
  return document.pages.flatMap((page, pageIndex) => {
    const text = pageText(page); const hits = text.match(pattern)?.length ?? 0;
    if (!hits) return [];
    const first = text.search(pattern); const excerpt = text.slice(Math.max(0, first - 18), first + query.length + 30).replace(/\n/g, ' ');
    return [{ pageIndex, excerpt, count: hits }];
  });
}

export function replaceDocumentText(document: EditorDocument, query: string, replacement: string, caseSensitive = false) {
  if (!query) return document;
  const pattern = new RegExp(escaped(query), caseSensitive ? 'g' : 'gi');
  return {
    ...document,
    pages: document.pages.map((page) => ({
      ...page,
      header: page.header?.replace(pattern, replacement),
      footer: page.footer?.replace(pattern, replacement),
      textFlow: replaceInNode(page.textFlow as Node, pattern, replacement) as EditorDocument['pages'][number]['textFlow'],
      objects: page.objects.map((object) => object.type === 'text-box' ? { ...object, text: object.text?.replace(pattern, replacement) } : object),
    })),
  };
}

export function inspectKorean(document: EditorDocument): KoreanIssue[] {
  return document.pages.flatMap((page, pageIndex) => KOREAN_RULES.flatMap((rule) => {
    if ('skip' in rule && rule.skip) return [];
    const matches = pageText(page).match(rule.pattern)?.length ?? 0;
    return matches ? [{ pageIndex, found: rule.pattern.source, replacement: rule.replacement, reason: rule.reason, count: matches }] : [];
  }));
}

export function applyKoreanCorrections(document: EditorDocument) {
  return KOREAN_RULES.reduce((next, rule) => 'skip' in rule && rule.skip ? next : ({
    ...next,
    pages: next.pages.map((page) => ({
      ...page,
      header: page.header?.replace(rule.pattern, rule.replacement),
      footer: page.footer?.replace(rule.pattern, rule.replacement),
      textFlow: replaceInNode(page.textFlow as Node, rule.pattern, rule.replacement) as EditorDocument['pages'][number]['textFlow'],
      objects: page.objects.map((object) => object.type === 'text-box' ? { ...object, text: object.text?.replace(rule.pattern, rule.replacement) } : object),
    })),
  }), document);
}
