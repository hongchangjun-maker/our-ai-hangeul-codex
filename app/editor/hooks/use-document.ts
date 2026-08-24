'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createDocument, migrateDocument, type EditorDocument, type RichTextDocument } from '../../domain/document';
import { loadLastDocument, recoveryState, saveDocument } from '../../infrastructure/local-storage';

type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
const HISTORY_LIMIT = 80;
export const EDITOR_BUFFER_IDLE_MS = 120;
export const EDITOR_BUFFER_MAX_MS = 1_000;

export function applyBufferedPageText(document: EditorDocument, pending: ReadonlyMap<string, RichTextDocument>) {
  if (!pending.size) return document;
  let changed = false;
  const pages = document.pages.map((page) => {
    const textFlow = pending.get(page.id);
    if (!textFlow || textFlow === page.textFlow) return page;
    changed = true;
    return { ...page, textFlow };
  });
  return changed ? { ...document, pages, updatedAt: new Date().toISOString() } : document;
}

export function useDocumentState() {
  const [document, setDocumentState] = useState<EditorDocument>(() => createDocument());
  const currentRef = useRef(document);
  const past = useRef<EditorDocument[]>([]);
  const future = useRef<EditorDocument[]>([]);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [recoveryCandidate, setRecoveryCandidate] = useState<EditorDocument | null>(null);
  const [ready, setReady] = useState(false);
  const pendingText = useRef(new Map<string, RichTextDocument>());
  const editorIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorMaxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePromise = useRef<Promise<boolean> | null>(null);
  const saveAgain = useRef(false);

  const clearEditorTimers = useCallback(() => {
    if (editorIdleTimer.current) clearTimeout(editorIdleTimer.current);
    if (editorMaxTimer.current) clearTimeout(editorMaxTimer.current);
    editorIdleTimer.current = null;
    editorMaxTimer.current = null;
  }, []);

  const materializeEditorText = useCallback((publish = true) => {
    clearEditorTimers();
    if (!pendingText.current.size) return currentRef.current;
    const next = applyBufferedPageText(currentRef.current, pendingText.current);
    pendingText.current.clear();
    currentRef.current = next;
    if (publish) setDocumentState(next);
    setSaveStatus('dirty');
    recoveryState.markDirty();
    return next;
  }, [clearEditorTimers]);

  const flushEditorUpdates = useCallback(() => materializeEditorText(true), [materializeEditorText]);

  const bufferEditorPage = useCallback((pageIndex: number, textFlow: RichTextDocument, composing = false) => {
    const page = currentRef.current.pages[pageIndex];
    if (!page) return;
    pendingText.current.set(page.id, textFlow);
    if (savePromise.current) saveAgain.current = true;
    if (composing) return;
    if (editorIdleTimer.current) clearTimeout(editorIdleTimer.current);
    editorIdleTimer.current = setTimeout(() => { materializeEditorText(true); }, EDITOR_BUFFER_IDLE_MS);
    editorMaxTimer.current ??= setTimeout(() => { materializeEditorText(true); }, EDITOR_BUFFER_MAX_MS);
  }, [materializeEditorText]);

  useEffect(() => { currentRef.current = document; }, [document]);

  useEffect(() => {
    let active = true;
    loadLastDocument().then((last) => {
      if (!active) return;
      if (last) setRecoveryCandidate(last);
      setReady(true);
    }).catch(() => setReady(true));
    return () => { active = false; };
  }, []);

  useEffect(() => () => clearEditorTimers(), [clearEditorTimers]);

  const apply = useCallback((next: EditorDocument, recordHistory: boolean) => {
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    if (recordHistory) {
      past.current = [...past.current.slice(-(HISTORY_LIMIT - 1)), structuredClone(currentRef.current)];
      future.current = [];
      setHistoryState({ canUndo: true, canRedo: false });
    }
    currentRef.current = stamped;
    setDocumentState(stamped);
    setSaveStatus('dirty');
    recoveryState.markDirty();
  }, []);

  const updateDocument = useCallback((updater: (document: EditorDocument) => EditorDocument, recordHistory = true) => {
    apply(updater(materializeEditorText(false)), recordHistory);
  }, [apply, materializeEditorText]);

  const replaceDocument = useCallback((next: EditorDocument) => {
    clearEditorTimers();
    pendingText.current.clear();
    const migrated = migrateDocument(next);
    past.current = [];
    future.current = [];
    setHistoryState({ canUndo: false, canRedo: false });
    currentRef.current = migrated;
    setDocumentState(migrated);
    setSaveStatus('dirty');
    recoveryState.markDirty();
  }, [clearEditorTimers]);

  const loadDocument = useCallback((next: EditorDocument) => {
    clearEditorTimers();
    pendingText.current.clear();
    const migrated = migrateDocument(next);
    past.current = [];
    future.current = [];
    setHistoryState({ canUndo: false, canRedo: false });
    currentRef.current = migrated;
    setDocumentState(migrated);
    setSaveStatus('saved');
    setLastSavedAt(new Date(migrated.updatedAt));
    recoveryState.markSaved();
  }, [clearEditorTimers]);

  const undoDocument = useCallback(() => {
    materializeEditorText(false);
    const previous = past.current.pop();
    if (!previous) return false;
    future.current = [structuredClone(currentRef.current), ...future.current].slice(0, HISTORY_LIMIT);
    currentRef.current = previous;
    setDocumentState(previous);
    setSaveStatus('dirty');
    setHistoryState({ canUndo: past.current.length > 0, canRedo: true });
    recoveryState.markDirty();
    return true;
  }, [materializeEditorText]);

  const redoDocument = useCallback(() => {
    materializeEditorText(false);
    const next = future.current.shift();
    if (!next) return false;
    past.current = [...past.current.slice(-(HISTORY_LIMIT - 1)), structuredClone(currentRef.current)];
    currentRef.current = next;
    setDocumentState(next);
    setSaveStatus('dirty');
    setHistoryState({ canUndo: true, canRedo: future.current.length > 0 });
    recoveryState.markDirty();
    return true;
  }, [materializeEditorText]);

  const beginTransaction = useCallback(() => structuredClone(materializeEditorText(false)), [materializeEditorText]);
  const updateTransient = useCallback((updater: (document: EditorDocument) => EditorDocument) => {
    const next = updater(currentRef.current);
    currentRef.current = next;
    setDocumentState(next);
    setSaveStatus('dirty');
    recoveryState.markDirty();
  }, []);
  const finishTransaction = useCallback((before: EditorDocument) => {
    past.current = [...past.current.slice(-(HISTORY_LIMIT - 1)), before];
    future.current = [];
    setHistoryState({ canUndo: true, canRedo: false });
  }, []);

  const saveNow = useCallback(() => {
    if (savePromise.current) { saveAgain.current = true; return savePromise.current; }
    const task = (async () => {
      do {
        saveAgain.current = false;
        const snapshot = materializeEditorText(true);
        setSaveStatus('saving');
        try { await saveDocument(snapshot); }
        catch { setSaveStatus('error'); return false; }
      } while (saveAgain.current || pendingText.current.size > 0);
      setSaveStatus('saved');
      setLastSavedAt(new Date());
      recoveryState.markSaved();
      return true;
    })();
    savePromise.current = task.finally(() => { savePromise.current = null; });
    return savePromise.current;
  }, [materializeEditorText]);

  useEffect(() => {
    if (!ready || saveStatus !== 'dirty') return;
    const timer = setTimeout(() => { void saveNow(); }, document.settings.autosaveDelayMs);
    return () => clearTimeout(timer);
  }, [document, ready, saveNow, saveStatus]);

  return {
    document,
    ready,
    saveStatus,
    lastSavedAt,
    recoveryCandidate,
    interrupted: recoveryState.wasInterrupted(),
    canUndoDocument: historyState.canUndo,
    canRedoDocument: historyState.canRedo,
    updateDocument,
    bufferEditorPage,
    flushEditorUpdates,
    replaceDocument,
    loadDocument,
    undoDocument,
    redoDocument,
    beginTransaction,
    updateTransient,
    finishTransaction,
    saveNow,
    dismissRecovery: () => setRecoveryCandidate(null),
  };
}
