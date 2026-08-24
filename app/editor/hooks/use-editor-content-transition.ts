'use client';

import type { Editor } from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';
import { useCallback, useRef } from 'react';
import type { RichTextDocument } from '../../domain/document';

export function useEditorContentTransition() {
  const activeRef = useRef(0);
  const replace = useCallback((editor: Editor | null, content: RichTextDocument) => {
    if (!editor) return;
    const transition = activeRef.current + 1;
    activeRef.current = transition;
    editor.commands.setContent(content as JSONContent, { emitUpdate: false });
    editor.commands.setTextSelection(1);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (activeRef.current === transition) activeRef.current = 0;
    }));
  }, []);
  return { activeRef, replace };
}
