export const BUNDLED_FONT_FAMILIES = [
  'Pretendard', 'SUIT', 'Gowun Dodum', 'Gowun Batang', 'Black Han Sans', 'Jua', 'Nanum Pen Script',
  'Inter', 'Roboto', 'Open Sans', 'Montserrat', 'Lora', 'Source Serif 4', 'Playfair Display', 'JetBrains Mono',
] as const;

export const DEFAULT_FONT_FAMILY = 'Pretendard';

export function isBundledFont(family: string) {
  return (BUNDLED_FONT_FAMILIES as readonly string[]).includes(family);
}

export type FontSubstitution = {
  source: string;
  fallback: (typeof BUNDLED_FONT_FAMILIES)[number];
  reason: 'redistribution-unverified' | 'system-font';
};

/**
 * Source names stay available for DOCX re-export while the browser renders a
 * deliberately selected, redistributable bundled family on every device.
 */
export const FONT_SUBSTITUTIONS: readonly FontSubstitution[] = [
  { source: '부크크 명조 Light', fallback: 'Gowun Batang', reason: 'redistribution-unverified' },
  { source: '부크크 고딕 Light', fallback: 'Pretendard', reason: 'redistribution-unverified' },
  { source: '부크크 고딕 Bold', fallback: 'Pretendard', reason: 'redistribution-unverified' },
  { source: '부크크코딕', fallback: 'Pretendard', reason: 'redistribution-unverified' },
  { source: 'KoPub바탕체 Light', fallback: 'Gowun Batang', reason: 'redistribution-unverified' },
  { source: 'KoPub돋움체 Medium', fallback: 'Pretendard', reason: 'redistribution-unverified' },
  { source: '바탕', fallback: 'Gowun Batang', reason: 'system-font' },
  { source: '굴림', fallback: 'Pretendard', reason: 'system-font' },
  { source: '맑은 고딕', fallback: 'Pretendard', reason: 'system-font' },
  { source: '나눔고딕', fallback: 'Pretendard', reason: 'system-font' },
] as const;

export function fontSubstitution(family: string | undefined) {
  const normalized = family?.trim().replace(/^['"]|['"]$/g, '');
  return normalized ? FONT_SUBSTITUTIONS.find((item) => item.source.toLocaleLowerCase('ko-KR') === normalized.toLocaleLowerCase('ko-KR')) : undefined;
}

export function webFontFamily(family: string | undefined) {
  const normalized = family?.trim().replace(/^['"]|['"]$/g, '') || DEFAULT_FONT_FAMILY;
  return fontSubstitution(normalized)?.fallback ?? normalized;
}

export function webFontStack(family: string | undefined) {
  const normalized = family?.trim().replace(/^['"]|['"]$/g, '') || DEFAULT_FONT_FAMILY;
  const fallback = webFontFamily(normalized);
  return fallback === normalized ? `"${normalized}"` : `"${normalized}", "${fallback}"`;
}
