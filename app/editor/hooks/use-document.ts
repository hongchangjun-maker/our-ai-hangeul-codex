'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createDocument, migrateDocument, type EditorDocument } from '../../domain/document';
import { loadLastDocument, recoveryState, saveDocument } from '../../infrastructure/local-storage';

type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
const HISTORY_LIMIT = 80;

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
    apply(updater(currentRef.current), recordHistory);
  }, [apply]);

  const replaceDocument = useCallback((next: EditorDocument) => {
    const migrated = migrateDocument(next);
    past.current = [];
    future.current = [];
    setHistoryState({ canUndo: false, canRedo: false });
    currentRef.current = migrated;
    setDocumentState(migrated);
    setSaveStatus('dirty');
    recoveryState.markDirty();
  }, []);

  const createNew = useCallback((templateId = 'blank', defaults?: { defaultFont?: string; autosaveDelayMs?: number }) => replaceDocument(createDocument(templateId, defaults)), [replaceDocument]);

  const undoDocument = useCallback(() => {
    const previous = past.current.pop();
    if (!previous) return false;
    future.current = [structuredClone(currentRef.current), ...future.current].slice(0, HISTORY_LIMIT);
    currentRef.current = previous;
    setDocumentState(previous);
    setSaveStatus('dirty');
    setHistoryState({ canUndo: past.current.length > 0, canRedo: true });
    recoveryState.markDirty();
    return true;
  }, []);

  const redoDocument = useCallback(() => {
    const next = future.current.shift();
    if (!next) return false;
    past.current = [...past.current.slice(-(HISTORY_LIMIT - 1)), structuredClone(currentRef.current)];
    currentRef.current = next;
    setDocumentState(next);
    setSaveStatus('dirty');
    setHistoryState({ canUndo: true, canRedo: future.current.length > 0 });
    recoveryState.markDirty();
    return true;
  }, []);

  const beginTransaction = useCallback(() => structuredClone(currentRef.current), []);
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

  const saveNow = useCallback(async () => {
    setSaveStatus('saving');
    try {
      await saveDocument(currentRef.current);
      setSaveStatus('saved');
      setLastSavedAt(new Date());
      recoveryState.markSaved();
      return true;
    } catch {
      setSaveStatus('error');
      return false;
    }
  }, []);

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
    replaceDocument,
    createNew,
    undoDocument,
    redoDocument,
    beginTransaction,
    updateTransient,
    finishTransaction,
    saveNow,
    dismissRecovery: () => setRecoveryCandidate(null),
  };
}
