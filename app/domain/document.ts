export const DOCUMENT_FORMAT_VERSION = '1.0.0';

export const PAGE_PRESETS = {
  A4: { widthMm: 210, heightMm: 297 },
  A5: { widthMm: 148, heightMm: 210 },
  B4: { widthMm: 257, heightMm: 364 },
  A3: { widthMm: 297, heightMm: 420 },
  B5: { widthMm: 176, heightMm: 250 },
  Letter: { widthMm: 215.9, heightMm: 279.4 },
  Legal: { widthMm: 215.9, heightMm: 355.6 },
} as const;

export type PagePreset = keyof typeof PAGE_PRESETS;
export type Orientation = 'portrait' | 'landscape';
export type ObjectType = 'image' | 'attachment' | 'text-box' | 'shape';

export interface RichTextDocument {
  type: 'doc';
  content?: unknown[];
}

export interface PageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const DEFAULT_MARGINS_BY_PRESET: Record<PagePreset, PageMargins> = {
  A4: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
  A5: { top: 25.4, right: 21, bottom: 25.4, left: 21 },
  B4: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
  A3: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
  B5: { top: 22, right: 20, bottom: 22, left: 20 },
  Letter: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
  Legal: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
};

export const PAGE_PRESET_LABELS: Record<PagePreset, string> = {
  A4: 'A4 (210×297mm)',
  A5: 'A5 (148×210mm)',
  B4: 'B4 (257×364mm)',
  A3: 'A3 (297×420mm)',
  B5: 'B5 (176×250mm)',
  Letter: 'Letter (215.9×279.4mm)',
  Legal: 'Legal (215.9×355.6mm)',
};

export interface DocumentObject {
  id: string;
  type: ObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  locked: boolean;
  opacity: number;
  assetId?: string;
  name?: string;
  mediaType?: string;
  size?: number;
  text?: string;
  style?: {
    borderColor?: string;
    borderWidth?: number;
    borderRadius?: number;
    shadow?: boolean;
    background?: string;
  };
}

export interface DocumentPage {
  id: string;
  preset: PagePreset;
  orientation: Orientation;
  margins: PageMargins;
  background: string;
  textFlow: RichTextDocument;
  objects: DocumentObject[];
  header?: string;
  footer?: string;
}

export interface EditorDocument {
  formatVersion: string;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  settings: {
    defaultFont: string;
    defaultFontSize: number;
    snapEnabled: boolean;
    guidesEnabled: boolean;
    autosaveDelayMs: number;
  };
  pages: DocumentPage[];
  fonts: string[];
  comments: unknown[];
}

export const emptyTextDocument = (): RichTextDocument => ({
  type: 'doc',
  content: [{ type: 'paragraph' }],
});

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const heading = (text: string, level = 1) => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] });

export const templateDefaults: Record<string, { preset: PagePreset; orientation: Orientation; margins?: Partial<PageMargins> }> = {
  blank: { preset: 'A4', orientation: 'portrait' },
  report: { preset: 'A4', orientation: 'portrait', margins: { top: 25.4, right: 18, bottom: 25.4, left: 18 } },
  official: { preset: 'A4', orientation: 'portrait', margins: { top: 22, right: 25.4, bottom: 25.4, left: 25.4 } },
  minutes: { preset: 'A4', orientation: 'portrait', margins: { top: 20, right: 20, bottom: 20, left: 20 } },
};

export const createPage = (
  content: RichTextDocument = emptyTextDocument(),
  preset: PagePreset = 'A4',
  orientation: Orientation = 'portrait',
  margins: Partial<PageMargins> = {},
): DocumentPage => ({
  id: crypto.randomUUID(),
  preset,
  orientation,
  margins: { ...DEFAULT_MARGINS_BY_PRESET[preset], ...margins },
  background: '#ffffff',
  textFlow: content,
  objects: [],
});

export function defaultMarginsForPreset(preset: PagePreset): PageMargins {
  return { ...DEFAULT_MARGINS_BY_PRESET[preset] };
}

const templateContent: Record<string, RichTextDocument> = {
  blank: emptyTextDocument(),
  report: { type: 'doc', content: [heading('보고서 제목'), paragraph('작성자 · 작성일'), heading('핵심 요약', 2), paragraph('이 문서에서 전달할 핵심 내용을 작성하세요.'), heading('본문', 2), paragraph('여기를 클릭하고 내용을 입력하세요.')] },
  official: { type: 'doc', content: [heading('공 문'), paragraph('수신  담당자 귀하'), paragraph('제목  공문 제목을 입력하세요'), paragraph('1. 관련 내용을 입력하세요.'), paragraph('2. 전달할 사항을 명확하게 작성하세요.'), paragraph('붙임  관련 자료 1부.  끝.')] },
  minutes: { type: 'doc', content: [heading('회의록'), paragraph('일시 · 장소 · 참석자'), heading('회의 안건', 2), paragraph('1. 안건을 입력하세요.'), heading('결정 사항', 2), paragraph('회의에서 결정된 내용을 작성하세요.'), heading('후속 일정', 2), paragraph('담당자와 기한을 작성하세요.')] },
};

export function createDocument(templateId = 'blank'): EditorDocument {
  const now = new Date().toISOString();
  const names: Record<string, string> = { blank: '새 문서', report: '새 보고서', official: '새 공문', minutes: '새 회의록' };
  const template = templateDefaults[templateId] ?? templateDefaults.blank;
  const content = templateContent[templateId] ?? emptyTextDocument();
  return {
    formatVersion: DOCUMENT_FORMAT_VERSION,
    id: crypto.randomUUID(),
    name: names[templateId] ?? '새 문서',
    createdAt: now,
    updatedAt: now,
    settings: { defaultFont: 'Noto Sans KR', defaultFontSize: 11, snapEnabled: true, guidesEnabled: true, autosaveDelayMs: 900 },
    pages: [createPage(content, template.preset, template.orientation, template.margins)],
    fonts: ['Noto Sans KR', 'Noto Serif KR', 'Nanum Gothic', 'Nanum Myeongjo'],
    comments: [],
  };
}

export function duplicatePage(page: DocumentPage): DocumentPage {
  return {
    ...structuredClone(page),
    id: crypto.randomUUID(),
    objects: page.objects.map((object) => ({ ...structuredClone(object), id: crypto.randomUUID() })),
  };
}

export function migrateDocument(input: unknown): EditorDocument {
  if (!input || typeof input !== 'object') throw new Error('문서 데이터가 올바르지 않습니다.');
  const candidate = input as Partial<EditorDocument>;
  if (!Array.isArray(candidate.pages) || candidate.pages.length === 0) throw new Error('문서에 페이지가 없습니다.');
  if (!candidate.id || !candidate.name) throw new Error('문서 식별 정보가 없습니다.');
  if (candidate.formatVersion !== DOCUMENT_FORMAT_VERSION) throw new Error(`지원하지 않는 문서 버전입니다: ${candidate.formatVersion ?? '알 수 없음'}`);
  return candidate as EditorDocument;
}
