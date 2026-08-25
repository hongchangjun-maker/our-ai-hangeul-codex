'use client';

import type { Editor } from '@tiptap/react';
import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import { splitOverflowingPage } from '../../domain/text-pagination';
import type { EditorDocument, RichTextDocument } from '../../domain/document';

interface LivePaginationOptions {
  document: EditorDocument;
  updateDocument: (updater: (document: EditorDocument) => EditorDocument, recordHistory?: boolean) => void;
  currentPageRef: MutableRefObject<number>;
  pageIdRef: MutableRefObject<string>;
  composingRef: MutableRefObject<boolean>;
  transitionRef: MutableRefObject<number>;
  onPageChange: (pageIndex: number) => void;
  onLimit: (message: string) => void;
}

export function useLivePagination(options: LivePaginationOptions) {
  const optionsRef = useRef(options);
  const frameRef = useRef<number | null>(null);
  const focusPageIdRef = useRef<string | null>(null);
  const limitMessageRef = useRef('');
  optionsRef.current = options;
  useEffect(() => () => { if (frameRef.current !== null) cancelAnimationFrame(frameRef.current); }, []);

  const schedule = useCallback((textFlow: RichTextDocument) => {
    const state = optionsRef.current;
    if (state.composingRef.current || state.transitionRef.current) return;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const live = optionsRef.current;
      const pageIndex = live.currentPageRef.current;
      try {
        const preview = splitOverflowingPage(live.document, pageIndex, textFlow);
        if (!preview.didSplit) return;
        let nextPageIndex: number | null = null;
        let nextPageId: string | null = null;
        live.updateDocument((document) => {
          const result = splitOverflowingPage(document, pageIndex, textFlow);
          nextPageIndex = result.nextPageIndex;
          nextPageId = result.nextPageId;
          return result.document;
        }, false);
        if (nextPageIndex === null || nextPageId === null) return;
        focusPageIdRef.current = nextPageId;
        live.pageIdRef.current = '';
        live.currentPageRef.current = nextPageIndex;
        live.onPageChange(nextPageIndex);
        limitMessageRef.current = '';
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : '자동 쪽나눔을 완료하지 못했습니다.';
        if (limitMessageRef.current !== message) { limitMessageRef.current = message; live.onLimit(message); }
      }
    });
  }, []);

  const focusOverflowPage = useCallback((editor: Editor, pageId: string) => {
    if (focusPageIdRef.current !== pageId) return false;
    focusPageIdRef.current = null;
    requestAnimationFrame(() => requestAnimationFrame(() => editor.chain().focus('end').run()));
    return true;
  }, []);

  return { schedule, focusOverflowPage };
}
