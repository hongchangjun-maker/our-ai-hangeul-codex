export type PageViewMode = 'single' | 'spread';

export const PAGE_VIEW_STORAGE_KEY = 'our-ai-hangeul:page-view-mode';

export function restorePageViewMode(value: string | null): PageViewMode {
  return value === 'spread' ? 'spread' : 'single';
}

export function pageViewRange(currentPage: number, pageCount: number) {
  const first = Math.floor(Math.max(0, currentPage) / 2) * 2;
  const last = Math.min(Math.max(0, pageCount - 1), first + 1);
  return first === last ? `${first + 1}쪽` : `${first + 1}–${last + 1}쪽`;
}

export function shouldVirtualizePage(pageCount: number, currentPage: number, pageIndex: number, renderAllPages = false) {
  return !renderAllPages && pageCount > 20 && Math.abs(pageIndex - currentPage) > 2;
}
