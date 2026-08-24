import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument, createPage, type RichTextDocument } from '../app/domain/document';

const storage = vi.hoisted(() => ({
  saveDocument: vi.fn<(...args: unknown[]) => Promise<void>>(),
  markDirty: vi.fn(),
  markSaved: vi.fn(),
}));

vi.mock('../app/infrastructure/local-storage', () => ({
  loadLastDocument: vi.fn(async () => undefined),
  saveDocument: storage.saveDocument,
  recoveryState: { markDirty: storage.markDirty, markSaved: storage.markSaved, wasInterrupted: () => false },
}));

import { applyBufferedPageText, EDITOR_BUFFER_IDLE_MS, useDocumentState } from '../app/editor/hooks/use-document';

function flow(text: string): RichTextDocument {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

describe('local-first typing performance', () => {
  beforeEach(() => { vi.useFakeTimers(); storage.saveDocument.mockReset(); storage.markDirty.mockReset(); storage.markSaved.mockReset(); storage.saveDocument.mockResolvedValue(); });
  afterEach(() => vi.useRealTimers());

  it('keeps IME composition in the editor buffer until compositionend flush', () => {
    const { result } = renderHook(() => useDocumentState());
    const before = result.current.document;
    act(() => {
      result.current.bufferEditorPage(0, flow('ㅎ'), true);
      result.current.bufferEditorPage(0, flow('하'), true);
      result.current.bufferEditorPage(0, flow('한'), true);
      vi.advanceTimersByTime(2_000);
    });
    expect(result.current.document).toBe(before);
    expect(storage.markDirty).not.toHaveBeenCalled();
    act(() => { result.current.flushEditorUpdates(); });
    expect(result.current.document.pages[0].textFlow).toEqual(flow('한'));
    expect(storage.markDirty).toHaveBeenCalledTimes(1);
  });

  it('coalesces rapid non-IME input into one document publication', () => {
    const { result } = renderHook(() => useDocumentState());
    const before = result.current.document;
    act(() => {
      for (let index = 1; index <= 40; index += 1) result.current.bufferEditorPage(0, flow('가'.repeat(index)));
      vi.advanceTimersByTime(EDITOR_BUFFER_IDLE_MS - 1);
    });
    expect(result.current.document).toBe(before);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.document).not.toBe(before);
    expect(result.current.document.pages[0].textFlow).toEqual(flow('가'.repeat(40)));
    expect(storage.markDirty).toHaveBeenCalledTimes(1);
  });

  it('changes only the dirty page identity in a 300-page document', () => {
    const document = createDocument();
    document.pages = Array.from({ length: 300 }, (_, index) => ({ ...createPage(flow(`page-${index}`)), id: `page-${index}` }));
    const updated = applyBufferedPageText(document, new Map([['page-149', flow('현재 페이지만 변경')]]));
    expect(updated).not.toBe(document);
    expect(updated.pages[149]).not.toBe(document.pages[149]);
    expect(updated.pages[0]).toBe(document.pages[0]);
    expect(updated.pages[299]).toBe(document.pages[299]);
  });

  it('keeps page-count growth out of the per-keystroke state path', () => {
    vi.useRealTimers();
    const results = [1, 10, 50, 100, 300].map((pageCount) => {
      let document = createDocument();
      document.pages = Array.from({ length: pageCount }, (_, index) => ({ ...createPage(flow(`page-${index}`)), id: `page-${index}` }));
      const keystrokes = 2_000;
      const legacyStarted = performance.now();
      for (let index = 0; index < keystrokes; index += 1) document = { ...document, pages: document.pages.map((page, pageIndex) => pageIndex === 0 ? { ...page, textFlow: flow(String(index)) } : page) };
      const legacyMs = performance.now() - legacyStarted;
      const pending = new Map<string, RichTextDocument>();
      const bufferedStarted = performance.now();
      for (let index = 0; index < keystrokes; index += 1) pending.set(document.pages[0].id, flow(String(index)));
      applyBufferedPageText(document, pending);
      const bufferedMs = performance.now() - bufferedStarted;
      return { pageCount, legacyPageVisits: pageCount * keystrokes, bufferedPageVisits: pageCount, legacyMs: Number(legacyMs.toFixed(2)), bufferedMs: Number(bufferedMs.toFixed(2)) };
    });
    console.table(results);
    expect(results.map((result) => result.bufferedPageVisits)).toEqual([1, 10, 50, 100, 300]);
    expect(results[4].legacyPageVisits).toBe(600_000);
  });

  it('coalesces overlapping saves and persists only the latest pending snapshot', async () => {
    let releaseFirst: (() => void) | undefined;
    storage.saveDocument.mockImplementationOnce(() => new Promise<void>((resolve) => { releaseFirst = resolve; })).mockResolvedValueOnce();
    const { result } = renderHook(() => useDocumentState());
    act(() => { result.current.bufferEditorPage(0, flow('첫 저장')); result.current.flushEditorUpdates(); });
    let first!: Promise<boolean>; let joined!: Promise<boolean>;
    act(() => { first = result.current.saveNow(); });
    act(() => { result.current.bufferEditorPage(0, flow('가장 최신')); joined = result.current.saveNow(); });
    expect(joined).toBe(first);
    await act(async () => { releaseFirst?.(); await first; });
    expect(storage.saveDocument).toHaveBeenCalledTimes(2);
    const latest = storage.saveDocument.mock.calls[1][0] as ReturnType<typeof createDocument>;
    expect(latest.pages[0].textFlow).toEqual(flow('가장 최신'));
  });

  it('keeps local editing available when persistence fails', async () => {
    storage.saveDocument.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useDocumentState());
    act(() => { result.current.bufferEditorPage(0, flow('오프라인 입력')); result.current.flushEditorUpdates(); });
    await act(async () => { expect(await result.current.saveNow()).toBe(false); });
    expect(result.current.saveStatus).toBe('error');
    act(() => { result.current.bufferEditorPage(0, flow('오프라인에서도 계속 입력')); result.current.flushEditorUpdates(); });
    expect(result.current.document.pages[0].textFlow).toEqual(flow('오프라인에서도 계속 입력'));
    expect(result.current.saveStatus).toBe('dirty');
  });

  it('opens a persisted recent document without marking it changed or scheduling another save', () => {
    const persisted = createDocument();
    persisted.name = '저장된 문서';
    persisted.updatedAt = '2026-08-25T00:00:00.000Z';
    const { result } = renderHook(() => useDocumentState());
    act(() => { result.current.loadDocument(persisted); vi.advanceTimersByTime(10_000); });
    expect(result.current.document.name).toBe('저장된 문서');
    expect(result.current.saveStatus).toBe('saved');
    expect(result.current.canUndoDocument).toBe(false);
    expect(storage.markSaved).toHaveBeenCalledTimes(1);
    expect(storage.markDirty).not.toHaveBeenCalled();
    expect(storage.saveDocument).not.toHaveBeenCalled();
  });
});
