'use client';

import { useEffect, useState } from 'react';
import type { EditorDocument } from '../../domain/document';
import { documentToText } from '../../infrastructure/export-service';

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export type DocumentStatistics = { characters: number; words: number };

export function calculateDocumentStatistics(document: EditorDocument): DocumentStatistics {
  const text = documentToText(document);
  return { characters: text.length, words: text.trim() ? text.trim().split(/\s+/u).length : 0 };
}

export function useDocumentStatistics(document: EditorDocument) {
  const [statistics, setStatistics] = useState<DocumentStatistics>({ characters: 0, words: 0 });

  useEffect(() => {
    const browserWindow = window as IdleWindow;
    const update = () => setStatistics(calculateDocumentStatistics(document));
    if (browserWindow.requestIdleCallback) {
      const handle = browserWindow.requestIdleCallback(update, { timeout: 700 });
      return () => browserWindow.cancelIdleCallback?.(handle);
    }
    const handle = window.setTimeout(update, 80);
    return () => window.clearTimeout(handle);
  }, [document]);

  return statistics;
}
