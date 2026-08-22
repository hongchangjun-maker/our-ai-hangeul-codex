export type FontScript = 'korean' | 'english';

export interface AppFont {
  family: string;
  label: string;
  script: FontScript;
  description: string;
}

/**
 * Every family here is shipped from /public/fonts.  Keep this list curated:
 * it is intentionally broad enough for documents while avoiding near-duplicate
 * or multi-megabyte families that would slow down a first visit.
 */
export const APP_FONTS: readonly AppFont[] = [
  { family: 'Pretendard', label: 'Pretendard', script: 'korean', description: '기본 문서 · 가장 많이 쓰는 고딕' },
  { family: 'SUIT', label: 'SUIT', script: 'korean', description: '화면 문서 · 또렷한 고딕' },
  { family: 'Gowun Dodum', label: '고운돋움', script: 'korean', description: '부드러운 본문 고딕' },
  { family: 'Gowun Batang', label: '고운바탕', script: 'korean', description: '편안한 명조 본문' },
  { family: 'Black Han Sans', label: '검은고딕', script: 'korean', description: '강한 제목용' },
  { family: 'Jua', label: '주아', script: 'korean', description: '친근한 제목용' },
  { family: 'Nanum Pen Script', label: '나눔손글씨 펜', script: 'korean', description: '손글씨 강조용' },
  { family: 'Inter', label: 'Inter', script: 'english', description: 'UI · 현대적 산세리프' },
  { family: 'Roboto', label: 'Roboto', script: 'english', description: '문서 · 범용 산세리프' },
  { family: 'Open Sans', label: 'Open Sans', script: 'english', description: '읽기 쉬운 본문' },
  { family: 'Montserrat', label: 'Montserrat', script: 'english', description: '선명한 제목용' },
  { family: 'Lora', label: 'Lora', script: 'english', description: '편안한 세리프 본문' },
  { family: 'Source Serif 4', label: 'Source Serif 4', script: 'english', description: '정갈한 보고서용' },
  { family: 'Playfair Display', label: 'Playfair Display', script: 'english', description: '고급 제목용' },
  { family: 'JetBrains Mono', label: 'JetBrains Mono', script: 'english', description: '코드 · 고정폭' },
] as const;

export const DEFAULT_FONT_FAMILY = 'Pretendard';

export const FEATURED_FONT_FAMILIES = [
  'Pretendard',
  'SUIT',
  'Gowun Batang',
  'Inter',
  'Roboto',
  'JetBrains Mono',
] as const;

export const KOREAN_FONTS = APP_FONTS.filter((font) => font.script === 'korean');
export const ENGLISH_FONTS = APP_FONTS.filter((font) => font.script === 'english');
export const FONT_FAMILIES = APP_FONTS.map((font) => font.family);

export function isBundledFont(family: string) {
  return FONT_FAMILIES.includes(family);
}

export function fontLabel(family: string) {
  return APP_FONTS.find((font) => font.family === family)?.label ?? family;
}
