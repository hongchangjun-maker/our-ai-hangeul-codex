'use client';

import Color from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import Highlight from '@tiptap/extension-highlight';
import { Table } from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import type { JSONContent } from '@tiptap/core';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { AlertTriangle, FileCheck2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { applyDocumentStylePreset, createPage, defaultMarginsForPreset, documentStylePreset, duplicatePage, migrateDocument, type DocumentObject, type DocumentStyleId, type EditorDocument, type Orientation, type PageMargins, type PagePreset, type RichTextDocument } from '../domain/document';
import { fitPageObjects, pageGeometry } from '../domain/geometry';
import { collectDocumentFontFamilies, documentToText } from '../infrastructure/export-service';
import { importFile } from '../infrastructure/file-import';
import { listRecentDocuments } from '../infrastructure/local-storage';
import { AdminDialog } from './components/AdminDialog';
import { AIAssistantPanel } from './components/AIAssistantPanel';
import { EditorChrome } from './components/EditorChrome';
import { ExportDialog } from './components/ExportDialog';
import { FontLibraryDialog } from './components/FontLibraryDialog';
import { CloudSyncDialog } from './components/CloudSyncDialog';
import { PageSetupDialog } from './components/PageSetupDialog'; import { ReviewDialog } from './components/ReviewDialog';
import { PageCanvas } from './components/PageCanvas';
import { RealtimeCollaboration } from './components/RealtimeCollaboration';
import { WelcomeScreen } from './components/WelcomeScreen';
import { FontSize, LineHeight } from './extensions/formatting';
import { useFontPreferences } from './hooks/use-font-preferences';
import { useDocumentExport } from './hooks/use-document-export';
import { useDocumentState } from './hooks/use-document';
import { useAppDefaults } from './hooks/use-app-defaults'; import { useShareLinkLaunch } from './hooks/use-share-link-launch';
function paragraphsFromText(text: string): RichTextDocument {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  return { type: 'doc', content: lines.map((line) => line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' }) };
}

function rowsToTable(rows: string[][]) {
  const limited = rows.slice(0, 100).map((row) => row.slice(0, 20));
  return {
    type: 'table',
    content: limited.map((row, rowIndex) => ({ type: 'tableRow', content: row.map((cell) => ({ type: rowIndex === 0 ? 'tableHeader' : 'tableCell', content: [{ type: 'paragraph', content: cell ? [{ type: 'text', text: cell.slice(0, 10_000) }] : undefined }] })) })),
  };
}
export function EditorApp() {
  const store = useDocumentState();
  const { defaults: appDefaults, refresh: refreshAppDefaults } = useAppDefaults();
  const pageLayoutScopeStorageKey = 'our-ai-hangeul:page-layout-scope';
  const pageGuidesStorageKey = 'our-ai-hangeul:show-page-guides';
  const [screen, setScreen] = useState<'welcome' | 'editor'>('welcome');
  const [currentPage, setCurrentPage] = useState(0);
  const currentPageRef = useRef(0);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [pageNavOpen, setPageNavOpen] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [pageLayoutScope, setPageLayoutScope] = useState<'current' | 'all'>(() => {
    try {
      const savedScope = localStorage.getItem(pageLayoutScopeStorageKey);
      return savedScope === 'all' ? 'all' : 'current';
    } catch {
      return 'current';
    }
  });
  const [showPageGuides, setShowPageGuides] = useState(() => {
    try {
      const savedGuides = localStorage.getItem(pageGuidesStorageKey);
      return savedGuides === 'false' ? false : true;
    } catch {
      return true;
    }
  });
  const [adminOpen, setAdminOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const { busy: exportBusy, message: exportMessage, clearMessage: clearExportMessage, runExport } = useDocumentExport(store.document);
  const [fontLibraryOpen, setFontLibraryOpen] = useState(false);
  const [pageSetupOpen, setPageSetupOpen] = useState(false); const [reviewOpen, setReviewOpen] = useState(false);
  const [cloudOpen, setCloudOpen] = useState(false);
  useShareLinkLaunch(setScreen, setCloudOpen);
  const { favoriteFonts, toggleFavoriteFont } = useFontPreferences();
  const [recent, setRecent] = useState<EditorDocument[]>([]);
  const [selectionText, setSelectionText] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const gestureBefore = useRef<EditorDocument | null>(null);
  const objectClipboard = useRef<DocumentObject | null>(null);
  const textActionAt = useRef(0);
  const documentActionAt = useRef(0);
  const pageIdRef = useRef('');

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      LineHeight,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: store.document.pages[0].textFlow as JSONContent,
    editorProps: { attributes: { class: 'document-editor', 'aria-label': '문서 본문 편집 영역', spellcheck: 'true' } },
    onUpdate({ editor: activeEditor }) {
      textActionAt.current = Date.now();
      const pageIndex = currentPageRef.current;
      store.updateDocument((document) => ({ ...document, pages: document.pages.map((page, index) => index === pageIndex ? { ...page, textFlow: activeEditor.getJSON() as RichTextDocument } : page) }), false);
    },
    onSelectionUpdate({ editor: activeEditor }) {
      const { from, to } = activeEditor.state.selection;
      setSelectionText(from === to ? '' : activeEditor.state.doc.textBetween(from, to, '\n').slice(0, 20_000));
    },
  });

  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);

  useEffect(() => {
    const page = store.document.pages[currentPage];
    if (!editor || !page) return;
    const pageChanged = pageIdRef.current !== page.id;
    if (!pageChanged && JSON.stringify(editor.getJSON()) === JSON.stringify(page.textFlow)) return;
    pageIdRef.current = page.id; editor.commands.setContent(page.textFlow as JSONContent, { emitUpdate: false });
    if (pageChanged) setSelectedObjectId(null);
  }, [currentPage, editor, store.document.pages]);

  useEffect(() => {
    try { localStorage.setItem(pageLayoutScopeStorageKey, pageLayoutScope); } catch { /* localStorage unavailable */ }
  }, [pageLayoutScope]);

  useEffect(() => {
    try { localStorage.setItem(pageGuidesStorageKey, String(showPageGuides)); } catch { /* localStorage unavailable */ }
  }, [showPageGuides]);

  useEffect(() => {
    if (screen === 'welcome') void listRecentDocuments().then(setRecent).catch(() => setRecent([]));
  }, [screen, store.lastSavedAt]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const createNew = (templateId = 'blank') => {
    store.createNew(templateId, appDefaults);
    pageIdRef.current = '';
    setCurrentPage(0); setSelectedObjectId(null); setAiOpen(false); setScreen('editor');
  };

  const openDocument = (nextDocument: EditorDocument) => {
    try {
      store.replaceDocument(migrateDocument(nextDocument));
      pageIdRef.current = '';
      setCurrentPage(0); setSelectedObjectId(null); setScreen('editor'); store.dismissRecovery();
    } catch (reason) { setToast({ type: 'error', message: reason instanceof Error ? reason.message : '문서를 열지 못했습니다.' }); }
  };

  const updateObject = (id: string, patch: Partial<DocumentObject>, history = false) => {
    const pageIndex = currentPageRef.current;
    store.updateDocument((document) => ({ ...document, pages: document.pages.map((page, index) => index === pageIndex ? { ...page, objects: page.objects.map((object) => object.id === id ? { ...object, ...patch } : object) } : page) }), history);
    if (history) documentActionAt.current = Date.now();
  };

  const beginGesture = () => { if (!gestureBefore.current) gestureBefore.current = store.beginTransaction(); };
  const finishGesture = () => { if (gestureBefore.current) { store.finishTransaction(gestureBefore.current); gestureBefore.current = null; documentActionAt.current = Date.now(); } };

  const handleFiles = async (files: FileList, pageIndex = currentPageRef.current, position = { x: 110, y: 140 }) => {
    const array = Array.from(files).slice(0, 20);
    if (files.length > 20) setToast({ type: 'info', message: '한 번에 최대 20개 파일만 처리합니다.' });
    for (let index = 0; index < array.length; index += 1) {
      try {
        const result = await importFile(array[index], { x: position.x + index * 14, y: position.y + index * 14 });
        if (result.kind === 'document') { openDocument(result.document); continue; }
        if (result.kind === 'text') {
          const nodes = paragraphsFromText(result.text).content ?? [];
          if (pageIndex !== currentPageRef.current) setCurrentPage(pageIndex);
          setTimeout(() => editor?.chain().focus().insertContent(nodes).run(), 0);
          continue;
        }
        if (result.kind === 'table') {
          if (!result.rows.length) throw new Error('CSV에서 표 데이터를 찾지 못했습니다.');
          if (pageIndex !== currentPageRef.current) setCurrentPage(pageIndex);
          setTimeout(() => editor?.chain().focus().insertContent(rowsToTable(result.rows)).run(), 0);
          continue;
        }
        store.updateDocument((document) => ({ ...document, pages: document.pages.map((page, pageNumber) => pageNumber === pageIndex ? fitPageObjects({ ...page, objects: [...page.objects, result.object] }) : page) }));
        documentActionAt.current = Date.now();
        setSelectedObjectId(result.object.id);
        if ('notice' in result && result.notice) setToast({ type: 'info', message: result.notice });
      } catch (reason) { setToast({ type: 'error', message: `${array[index].name}: ${reason instanceof Error ? reason.message : '가져오기에 실패했습니다.'}` }); }
    }
  };

  const objectAction = (action: 'front' | 'back' | 'lock' | 'duplicate' | 'delete' | 'center-x' | 'center-y') => {
    if (!selectedObjectId) return;
    const page = store.document.pages[currentPage];
    const object = page.objects.find((item) => item.id === selectedObjectId);
    if (!object) return;
    const geometry = pageGeometry(page);
    if (action === 'delete') {
      store.updateDocument((document) => ({ ...document, pages: document.pages.map((item, index) => index === currentPage ? { ...item, objects: item.objects.filter((value) => value.id !== selectedObjectId) } : item) }));
      setSelectedObjectId(null);
    } else if (action === 'duplicate') {
      const copy = { ...structuredClone(object), id: crypto.randomUUID(), x: object.x + 18, y: object.y + 18, zIndex: Math.max(0, ...page.objects.map((item) => item.zIndex)) + 1 };
      store.updateDocument((document) => ({ ...document, pages: document.pages.map((item, index) => index === currentPage ? fitPageObjects({ ...item, objects: [...item.objects, copy] }) : item) })); setSelectedObjectId(copy.id);
    } else {
      const maxZ = Math.max(0, ...page.objects.map((item) => item.zIndex));
      const minZ = Math.min(0, ...page.objects.map((item) => item.zIndex));
      const patch: Partial<DocumentObject> = action === 'front' ? { zIndex: maxZ + 1 } : action === 'back' ? { zIndex: minZ - 1 } : action === 'lock' ? { locked: !object.locked } : action === 'center-x' ? { x: (geometry.widthPx - object.width) / 2 } : { y: (geometry.heightPx - object.height) / 2 };
      updateObject(selectedObjectId, patch, true);
    }
    documentActionAt.current = Date.now();
  };

  const insertObject = (type: 'text-box' | 'shape') => {
    const page = store.document.pages[currentPage];
    const geometry = pageGeometry(page);
    const width = type === 'text-box' ? 300 : 160;
    const height = type === 'text-box' ? 96 : 120;
    const object: DocumentObject = { id: crypto.randomUUID(), type, x: (geometry.widthPx - width) / 2, y: 150, width, height, rotation: 0, zIndex: Math.max(0, ...page.objects.map((item) => item.zIndex)) + 1, locked: false, opacity: 1, text: type === 'text-box' ? '텍스트를 입력하세요' : undefined, style: { background: type === 'text-box' ? '#ffffff' : '#dcefe9', borderColor: '#8eb8ad', borderWidth: 1, borderRadius: type === 'text-box' ? 4 : 14, shadow: false } };
    store.updateDocument((document) => ({ ...document, pages: document.pages.map((item, index) => index === currentPage ? { ...item, objects: [...item.objects, object] } : item) }));
    setSelectedObjectId(object.id); documentActionAt.current = Date.now();
  };

  const addPage = (content?: RichTextDocument) => {
    const source = store.document.pages[currentPage] ?? store.document.pages[0];
    const page = createPage(content, source.preset, source.orientation, source.margins);
    store.updateDocument((document) => ({ ...document, pages: [...document.pages, page] }));
    pageIdRef.current = '';
    setCurrentPage(store.document.pages.length); documentActionAt.current = Date.now();
  };

  const duplicateCurrentPage = () => {
    const page = duplicatePage(store.document.pages[currentPage]);
    store.updateDocument((document) => ({ ...document, pages: [...document.pages.slice(0, currentPage + 1), page, ...document.pages.slice(currentPage + 1)] }));
    pageIdRef.current = ''; setCurrentPage(currentPage + 1); documentActionAt.current = Date.now();
  };

  const deleteCurrentPage = () => {
    if (store.document.pages.length <= 1) return;
    store.updateDocument((document) => ({ ...document, pages: document.pages.filter((_, index) => index !== currentPage) }));
    pageIdRef.current = ''; setCurrentPage(Math.max(0, currentPage - 1)); documentActionAt.current = Date.now();
  };

  const undo = () => {
    if (documentActionAt.current > textActionAt.current && store.canUndoDocument) store.undoDocument();
    else if (editor?.can().undo()) editor.chain().focus().undo().run();
    else store.undoDocument();
  };
  const redo = () => {
    if (store.canRedoDocument) store.redoDocument();
    else if (editor?.can().redo()) editor.chain().focus().redo().run();
  };

  const currentPageState = store.document.pages[currentPage] ?? store.document.pages[0];
  const onPagePreset = (nextPreset: PagePreset) => {
    const nextMargins = defaultMarginsForPreset(nextPreset);
    store.updateDocument((document) => ({ ...document, pages: document.pages.map((item, index) => {
      if (pageLayoutScope === 'current' && index !== currentPage) return item;
      return fitPageObjects({ ...item, preset: nextPreset, margins: nextMargins });
    }) }));
    documentActionAt.current = Date.now();
  };

  const onPageOrientation = () => {
    const page = store.document.pages[currentPage];
    const nextOrientation: Orientation = page.orientation === 'portrait' ? 'landscape' : 'portrait';
    store.updateDocument((document) => ({ ...document, pages: document.pages.map((item, index) => {
      if (pageLayoutScope === 'current' && index !== currentPage) return item;
      return fitPageObjects({ ...item, orientation: nextOrientation });
    }) }));
    documentActionAt.current = Date.now();
  };

  const onResetMargins = () => {
    store.updateDocument((document) => ({ ...document, pages: document.pages.map((item, index) => {
      if (pageLayoutScope === 'current' && index !== currentPage) return item;
      return { ...item, margins: defaultMarginsForPreset(item.preset) };
    }) }));
    documentActionAt.current = Date.now();
  };

  const onPageMarginsChange = (pageIndex: number, margins: PageMargins) => {
    store.updateDocument((document) => ({ ...document, pages: document.pages.map((item, index) => {
      if (pageLayoutScope === 'current' && index !== pageIndex) return item;
      return { ...item, margins };
    }) }), false);
    documentActionAt.current = Date.now();
  };

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target?.closest('input, textarea, [contenteditable="true"]'));
      if (modifier && event.key.toLowerCase() === 's') { event.preventDefault(); void store.saveNow(); }
      if (modifier && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
      if (modifier && event.shiftKey && event.key.toLowerCase() === 'z') { event.preventDefault(); redo(); }
      if (modifier && event.key.toLowerCase() === 'n') { event.preventDefault(); createNew(); }
      if (modifier && event.key.toLowerCase() === 'p') { event.preventDefault(); globalThis.print(); }
      if (modifier && event.altKey && event.key.toLowerCase() === 'g') { event.preventDefault(); setShowPageGuides((value) => !value); }
      if (selectedObjectId && !typing && (event.key === 'Delete' || event.key === 'Backspace')) { event.preventDefault(); objectAction('delete'); }
      if (selectedObjectId && !typing && modifier && event.key.toLowerCase() === 'c') { const object = store.document.pages[currentPageRef.current].objects.find((item) => item.id === selectedObjectId); if (object) objectClipboard.current = structuredClone(object); }
      if (!typing && modifier && event.key.toLowerCase() === 'v' && objectClipboard.current) { event.preventDefault(); const copy = { ...structuredClone(objectClipboard.current), id: crypto.randomUUID(), x: objectClipboard.current.x + 18, y: objectClipboard.current.y + 18 }; store.updateDocument((document) => ({ ...document, pages: document.pages.map((page, index) => index === currentPageRef.current ? fitPageObjects({ ...page, objects: [...page.objects, copy] }) : page) })); setSelectedObjectId(copy.id); }
      if (event.key === 'Escape') setSelectedObjectId(null);
    };
    const wheel = (event: WheelEvent) => { if (!event.ctrlKey) return; event.preventDefault(); setZoom((value) => Math.min(150, Math.max(50, value + (event.deltaY > 0 ? -25 : 25)))); };
    window.addEventListener('keydown', keydown);
    window.addEventListener('wheel', wheel, { passive: false });
    return () => { window.removeEventListener('keydown', keydown); window.removeEventListener('wheel', wheel); };
  });

  const applyFontFromLibrary = (family: string) => {
    editor?.chain().focus().setFontFamily(family).run();
    setFontLibraryOpen(false);
  };

  const applyDocumentStyle = (styleId: DocumentStyleId) => {
    const style = documentStylePreset(styleId);
    store.updateDocument((document) => applyDocumentStylePreset(document, styleId));
    setToast({ type: 'success', message: `${style.label} 기본 글꼴과 제목 스타일을 적용했습니다.` });
  };

  const applyAi = (text: string, mode: 'insert' | 'append' | 'replace' | 'new-page') => {
    const nodes = paragraphsFromText(text).content ?? [];
    if (mode === 'new-page') { addPage(paragraphsFromText(text)); return; }
    if (!editor) return;
    if (mode === 'replace') editor.chain().focus().deleteSelection().insertContent(nodes).run();
    else if (mode === 'append') editor.chain().focus('end').insertContent(nodes).run();
    else editor.chain().focus().insertContent(nodes).run();
    setToast({ type: 'success', message: 'AI 제안을 문서에 적용했습니다. 실행 취소할 수 있습니다.' });
  };

  const selectedObject = useMemo(() => store.document.pages[currentPage]?.objects.find((object) => object.id === selectedObjectId) ?? null, [currentPage, selectedObjectId, store.document.pages]);
  const saveLabel = store.saveStatus === 'saving' ? '저장 중…' : store.saveStatus === 'dirty' ? '변경됨' : store.saveStatus === 'error' ? '저장 오류' : store.lastSavedAt ? `${store.lastSavedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 저장` : '로컬 저장 준비';

  if (screen === 'welcome') return <>
    <WelcomeScreen recent={recent} interrupted={store.interrupted} onCreate={createNew} onOpen={openDocument} onFile={(files) => { createNew(); setTimeout(() => void handleFiles(files, 0), 0); }} onAdmin={() => setAdminOpen(true)} />
    {store.interrupted && store.recoveryCandidate && <div className="recovery-banner" role="dialog" aria-label="이전 작업 복구"><AlertTriangle size={21} /><span><strong>이전 작업을 복구할까요?</strong><small>{store.recoveryCandidate.name} · {new Date(store.recoveryCandidate.updatedAt).toLocaleString('ko-KR')}</small></span><button type="button" onClick={() => openDocument(store.recoveryCandidate!)}><FileCheck2 size={16} /> 복구</button><button type="button" className="icon-button" onClick={store.dismissRecovery} aria-label="복구 알림 닫기"><X size={16} /></button></div>}
    <AdminDialog open={adminOpen} onClose={() => { setAdminOpen(false); void refreshAppDefaults(); }} />
  </>;

  return <main className="editor-shell">
    <RealtimeCollaboration key={store.document.id} editor={editor} document={store.document} currentPage={currentPage} onRemotePage={(pageId, page) => store.updateDocument((document) => ({ ...document, pages: document.pages.map((value) => value.id === pageId ? page : value) }), false)} />
    <EditorChrome
      editor={editor}
      documentName={store.document.name}
      saveLabel={saveLabel}
      selectedObject={selectedObject}
      pageCount={store.document.pages.length}
      currentPage={currentPage}
      zoom={zoom}
      aiOpen={aiOpen}
      pageNavOpen={pageNavOpen}
      onDocumentName={(name) => store.updateDocument((document) => ({ ...document, name }), false)}
      onUndo={undo}
      onRedo={redo}
      onSave={() => void store.saveNow()}
      onFiles={(files) => void handleFiles(files)}
      onNewDocument={() => setScreen('welcome')}
      onAddPage={() => addPage()}
      onDuplicatePage={duplicateCurrentPage}
      onDeletePage={deleteCurrentPage}
      onExport={() => { setExportOpen(true); clearExportMessage(); }}
      onPrint={() => globalThis.print()}
      onAdmin={() => setAdminOpen(true)}
      onPageSetup={() => setPageSetupOpen(true)}
      onReview={() => setReviewOpen(true)}
      onCloudSync={() => setCloudOpen(true)}
      onToggleAi={() => setAiOpen((value) => !value)}
      onTogglePageNav={() => setPageNavOpen((value) => !value)}
      onZoom={setZoom}
      onInsertObject={insertObject}
      onObjectAction={objectAction}
      documentText={documentToText(store.document)}
      selectionText={selectionText}
      pagePreset={currentPageState.preset}
      pageOrientation={currentPageState.orientation}
      onPagePreset={onPagePreset}
      onPageOrientation={onPageOrientation}
      onResetMargins={onResetMargins}
      pageLayoutScope={pageLayoutScope}
      onTogglePageLayoutScope={() => setPageLayoutScope((value) => (value === 'current' ? 'all' : 'current'))}
      showPageGuides={showPageGuides}
      onTogglePageGuides={() => setShowPageGuides((value) => !value)}
      favoriteFonts={favoriteFonts}
      documentStyleId={store.document.settings.documentStyleId}
      onFontLibrary={() => setFontLibraryOpen(true)}
      onDocumentStyle={applyDocumentStyle}
    />
    <section className={`${aiOpen ? 'workspace with-ai' : 'workspace'} ${pageNavOpen ? 'with-nav' : ''}`}>
      <PageCanvas
        document={store.document}
        editor={editor}
        currentPage={currentPage}
        zoom={zoom}
        pageNavOpen={pageNavOpen}
        selectedObjectId={selectedObjectId}
        onCurrentPage={(page) => { setCurrentPage(page); pageIdRef.current = ''; }}
        onAddPage={() => addPage()}
        onSelectObject={setSelectedObjectId}
        onFiles={(files, page, position) => void handleFiles(files, page, position)}
        onGestureStart={beginGesture}
        onGestureEnd={finishGesture}
        onObjectChange={(id, patch, history) => updateObject(id, patch, history)}
        onObjectAction={objectAction}
        onPageMarginsChange={onPageMarginsChange}
        showGuides={showPageGuides}
        onZoom={setZoom}
      />
      {aiOpen && <AIAssistantPanel selectedText={selectionText} documentText={documentToText(store.document)} onClose={() => setAiOpen(false)} onApply={applyAi} />}
    </section>
    <ExportDialog open={exportOpen} busy={exportBusy} message={exportMessage} fontFamilies={collectDocumentFontFamilies(store.document)} onClose={() => setExportOpen(false)} onExport={(type) => void runExport(type)} />
    <FontLibraryDialog open={fontLibraryOpen} favoriteFonts={favoriteFonts} onClose={() => setFontLibraryOpen(false)} onToggleFavorite={toggleFavoriteFont} onApply={applyFontFromLibrary} />
    <PageSetupDialog open={pageSetupOpen} document={store.document} currentPage={currentPage} onChange={store.replaceDocument} onClose={() => setPageSetupOpen(false)} />
    <ReviewDialog open={reviewOpen} document={store.document} onChange={store.replaceDocument} onClose={() => setReviewOpen(false)} />
    <CloudSyncDialog key={store.document.id} open={cloudOpen} document={store.document} onChange={store.replaceDocument} onClose={() => setCloudOpen(false)} />
    <AdminDialog open={adminOpen} onClose={() => { setAdminOpen(false); void refreshAppDefaults(); }} />
    {toast && <div className={`toast ${toast.type}`} role="status"><span>{toast.message}</span><button type="button" onClick={() => setToast(null)} aria-label="알림 닫기"><X size={15} /></button></div>}
  </main>;
}
