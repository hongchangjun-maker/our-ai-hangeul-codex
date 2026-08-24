import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/react';
import { useEditorContentTransition } from '../app/editor/hooks/use-editor-content-transition';
import type { RichTextDocument } from '../app/domain/document';

describe('editor content transitions', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('suppresses editor update callbacks until the programmatic replacement has settled', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
    const setContent = vi.fn();
    const setTextSelection = vi.fn();
    const editor = { commands: { setContent, setTextSelection } } as unknown as Editor;
    const content: RichTextDocument = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '새 문서' }] }] };
    const { result } = renderHook(() => useEditorContentTransition());

    act(() => result.current.replace(editor, content));
    expect(result.current.activeRef.current).toBe(1);
    expect(setContent).toHaveBeenCalledWith(content, { emitUpdate: false });
    expect(setTextSelection).toHaveBeenCalledWith(1);
    act(() => { frames.shift()?.(0); frames.shift()?.(0); });
    expect(result.current.activeRef.current).toBe(0);
  });
});
