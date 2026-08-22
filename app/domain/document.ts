export const DOCUMENT_FORMAT_VERSION = '1.1.0';

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

export type DocumentStyleId = 'modern' | 'report' | 'classic' | 'presentation' | 'code';

export interface DocumentStylePreset {
  id: DocumentStyleId;
  label: string;
  description: string;
  defaultFont: string;
  headingFont: string;
  defaultFontSize: number;
  lineHeight: number;
  headingColor: string;
}

export const DOCUMENT_STYLE_PRESETS: readonly DocumentStylePreset[] = [
  { id: 'modern', label: '현대 문서', description: '깔끔한 기본 문서', defaultFont: 'Pretendard', headingFont: 'Pretendard', defaultFontSize: 11, lineHeight: 1.7, headingColor: '#173b32' },
  { id: 'report', label: '보고서', description: '정돈된 업무 보고서', defaultFont: 'SUIT', headingFont: 'SUIT', defaultFontSize: 11, lineHeight: 1.65, headingColor: '#174f7f' },
  { id: 'classic', label: '명조 문서', description: '읽기 편한 정갈한 문서', defaultFont: 'Gowun Batang', headingFont: 'Gowun Batang', defaultFontSize: 11, lineHeight: 1.8, headingColor: '#3f3126' },
  { id: 'presentation', label: '발표 자료', description: '선명한 제목 중심 구성', defaultFont: 'Inter', headingFont: 'Montserrat', defaultFontSize: 11, lineHeight: 1.55, headingColor: '#6d2856' },
  { id: 'code', label: '기술 문서', description: '코드와 명령어 중심 문서', defaultFont: 'JetBrains Mono', headingFont: 'Inter', defaultFontSize: 10, lineHeight: 1.65, headingColor: '#225f4f' },
] as const;

export const DEFAULT_DOCUMENT_STYLE_ID: DocumentStyleId = 'modern';

export function documentStylePreset(id: DocumentStyleId = DEFAULT_DOCUMENT_STYLE_ID) {
  return DOCUMENT_STYLE_PRESETS.find((preset) => preset.id === id) ?? DOCUMENT_STYLE_PRESETS[0];
}

export function applyDocumentStylePreset(document: EditorDocument, styleId: DocumentStyleId): EditorDocument {
  const style = documentStylePreset(styleId);
  return {
    ...document,
    settings: {
      ...document.settings,
      defaultFont: style.defaultFont,
      defaultFontSize: style.defaultFontSize,
      headingFont: style.headingFont,
      headingColor: style.headingColor,
      lineHeight: style.lineHeight,
      documentStyleId: style.id,
    },
  };
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
    headingFont: string;
    headingColor: string;
    lineHeight: number;
    documentStyleId: DocumentStyleId;
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

export function createDocument(templateId = 'blank', defaults?: { defaultFont?: string; autosaveDelayMs?: number }): EditorDocument {
  const now = new Date().toISOString();
  const names: Record<string, string> = { blank: '새 문서', report: '새 보고서', official: '새 공문', minutes: '새 회의록' };
  const template = templateDefaults[templateId] ?? templateDefaults.blank;
  const content = templateContent[templateId] ?? emptyTextDocument();
  const style = documentStylePreset();
  return {
    formatVersion: DOCUMENT_FORMAT_VERSION,
    id: crypto.randomUUID(),
    name: names[templateId] ?? '새 문서',
    createdAt: now,
    updatedAt: now,
    settings: { defaultFont: defaults?.defaultFont || style.defaultFont, defaultFontSize: style.defaultFontSize, headingFont: style.headingFont, headingColor: style.headingColor, lineHeight: style.lineHeight, documentStyleId: style.id, snapEnabled: true, guidesEnabled: true, autosaveDelayMs: defaults?.autosaveDelayMs ?? 900 },
    pages: [createPage(content, template.preset, template.orientation, template.margins)],
    fonts: ['Pretendard', 'SUIT', 'Gowun Dodum', 'Gowun Batang', 'Black Han Sans', 'Jua', 'Nanum Pen Script', 'Inter', 'Roboto', 'Open Sans', 'Montserrat', 'Lora', 'Source Serif 4', 'Playfair Display', 'JetBrains Mono'],
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

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown, max = 256) {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function numberValue(value: unknown, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function validateDocumentShape(value: EditorDocument) {
  if (!stringValue(value.id) || !stringValue(value.name, 500) || !stringValue(value.createdAt) || !stringValue(value.updatedAt)) throw new Error('문서 식별 정보가 올바르지 않습니다.');
  const settings = record(value.settings);
  const styleIds: DocumentStyleId[] = ['modern', 'report', 'classic', 'presentation', 'code'];
  if (!settings || !stringValue(settings.defaultFont, 128) || !stringValue(settings.headingFont, 128) || !numberValue(settings.defaultFontSize, 6, 96) || !numberValue(settings.lineHeight, 0.8, 4) || !styleIds.includes(settings.documentStyleId as DocumentStyleId) || typeof settings.snapEnabled !== 'boolean' || typeof settings.guidesEnabled !== 'boolean' || !numberValue(settings.autosaveDelayMs, 500, 10_000)) throw new Error('문서 기본 설정이 올바르지 않습니다.');
  if (!Array.isArray(value.pages) || value.pages.length === 0 || value.pages.length > 500) throw new Error('문서 페이지 수가 올바르지 않습니다.');
  for (const page of value.pages) {
    const raw = record(page);
    const margins = record(raw?.margins);
    const textFlow = record(raw?.textFlow);
    if (!raw || !stringValue(raw.id) || typeof raw.preset !== 'string' || !(raw.preset in PAGE_PRESETS) || !['portrait', 'landscape'].includes(String(raw.orientation)) || !margins || !['top', 'right', 'bottom', 'left'].every((edge) => numberValue(margins[edge], 0, 500)) || !stringValue(raw.background, 128) || textFlow?.type !== 'doc' || (textFlow.content !== undefined && !Array.isArray(textFlow.content)) || !Array.isArray(raw.objects) || raw.objects.length > 2_000) throw new Error('문서 페이지 데이터가 올바르지 않습니다.');
    for (const object of raw.objects) {
      const item = record(object);
      if (!item || !stringValue(item.id) || !['image', 'attachment', 'text-box', 'shape'].includes(String(item.type)) || !numberValue(item.x, -10_000, 100_000) || !numberValue(item.y, -10_000, 100_000) || !numberValue(item.width, 1, 100_000) || !numberValue(item.height, 1, 100_000) || !numberValue(item.rotation, -360_000, 360_000) || !numberValue(item.zIndex, -1_000_000, 1_000_000) || typeof item.locked !== 'boolean' || !numberValue(item.opacity, 0, 1)) throw new Error('문서 개체 데이터가 올바르지 않습니다.');
    }
  }
  if (!Array.isArray(value.fonts) || !value.fonts.every((font) => typeof font === 'string') || !Array.isArray(value.comments)) throw new Error('문서 부가 정보가 올바르지 않습니다.');
  return structuredClone(value);
}

export function migrateDocument(input: unknown): EditorDocument {
  if (!input || typeof input !== 'object') throw new Error('문서 데이터가 올바르지 않습니다.');
  const candidate = input as Partial<EditorDocument>;
  if (!Array.isArray(candidate.pages) || candidate.pages.length === 0) throw new Error('문서에 페이지가 없습니다.');
  if (!candidate.id || !candidate.name) throw new Error('문서 식별 정보가 없습니다.');
  if (candidate.formatVersion === '1.0.0') {
    const style = documentStylePreset();
    const legacySettings: Partial<EditorDocument['settings']> = candidate.settings ?? {};
    return validateDocumentShape({
      ...candidate,
      formatVersion: DOCUMENT_FORMAT_VERSION,
      settings: {
        defaultFont: legacySettings.defaultFont || style.defaultFont,
        defaultFontSize: legacySettings.defaultFontSize || style.defaultFontSize,
        headingFont: legacySettings.defaultFont || style.headingFont,
        headingColor: style.headingColor,
        lineHeight: style.lineHeight,
        documentStyleId: style.id,
        snapEnabled: legacySettings.snapEnabled ?? true,
        guidesEnabled: legacySettings.guidesEnabled ?? true,
        autosaveDelayMs: legacySettings.autosaveDelayMs ?? 900,
      },
    } as EditorDocument);
  }
  if (candidate.formatVersion !== DOCUMENT_FORMAT_VERSION) throw new Error(`지원하지 않는 문서 버전입니다: ${candidate.formatVersion ?? '알 수 없음'}`);
  return validateDocumentShape(candidate as EditorDocument);
}
