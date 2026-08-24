'use client';

import { useEffect, useState } from 'react';
import { PAGE_VIEW_STORAGE_KEY, restorePageViewMode, type PageViewMode } from '../page-view';

export function usePageViewMode() {
  const [pageViewMode, setPageViewMode] = useState<PageViewMode>(() => {
    try { return restorePageViewMode(localStorage.getItem(PAGE_VIEW_STORAGE_KEY)); }
    catch { return 'single'; }
  });

  useEffect(() => {
    try { localStorage.setItem(PAGE_VIEW_STORAGE_KEY, pageViewMode); } catch { /* localStorage unavailable */ }
  }, [pageViewMode]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || (event.code !== 'Digit1' && event.code !== 'Digit2')) return;
      event.preventDefault();
      setPageViewMode(event.code === 'Digit2' ? 'spread' : 'single');
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);

  return { pageViewMode, setPageViewMode };
}
