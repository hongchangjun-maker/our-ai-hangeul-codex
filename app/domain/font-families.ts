export const BUNDLED_FONT_FAMILIES = [
  'Pretendard', 'SUIT', 'Gowun Dodum', 'Gowun Batang', 'Black Han Sans', 'Jua', 'Nanum Pen Script',
  'Inter', 'Roboto', 'Open Sans', 'Montserrat', 'Lora', 'Source Serif 4', 'Playfair Display', 'JetBrains Mono',
] as const;

export const DEFAULT_FONT_FAMILY = 'Pretendard';

export function isBundledFont(family: string) {
  return (BUNDLED_FONT_FAMILIES as readonly string[]).includes(family);
}
