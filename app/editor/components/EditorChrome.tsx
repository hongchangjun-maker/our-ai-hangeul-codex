'use client';

import { type Editor, useEditorState } from '@tiptap/react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowLeftRight,
  Bot,
  Cloud,
  Columns3,
  Eye,
  Download,
  FilePlus2,
  FileText,
  FileUp,
  ImagePlus,
  List,
  ListOrdered,
  Layers2,
  Lock,
  LockOpen,
  Minus,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Printer,
  Redo2,
  Save,
  Search,
  Settings,
  Square,
  Sparkles,
  Table2,
  Trash2,
  Type,
  Undo2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { DOCUMENT_STYLE_PRESETS, PAGE_PRESET_LABELS, type DocumentObject, type DocumentStyleId, type EditorDocument, type PagePreset } from '../../domain/document';
import { useDocumentStatistics } from '../hooks/use-document-statistics';
import { DEFAULT_FAVORITE_FONT_FAMILIES, DEFAULT_FONT_FAMILY, ENGLISH_FONTS, KOREAN_FONTS, fontLabel, isBundledFont } from '../font-catalog';
import { WindowModeControls } from './WindowModeControls';

function ToolButton({ label, children, onClick, active, disabled }: { label: string; children: React.ReactNode; onClick?: () => void; active?: boolean; disabled?: boolean }) {
  return <button className={active ? 'tool-button active' : 'tool-button'} type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}>{children}</button>;
}

export function EditorChrome({
  editor,
  documentName,
  saveLabel,
  selectedObject,
  pageCount,
  currentPage,
  zoom,
  aiOpen,
  pageNavOpen,
  onDocumentName,
  onUndo,
  onRedo,
  onSave,
  onFiles,
  onNewDocument,
  onAddPage,
  onDuplicatePage,
  onDeletePage,
  pagePreset,
  pageOrientation,
  onExport,
  onPrint,
  onAdmin,
  onPageSetup,
  onReview,
  onCloudSync,
  onToggleAi,
  onTogglePageNav,
  onPagePreset,
  onPageOrientation,
  onResetMargins,
  pageLayoutScope,
  onTogglePageLayoutScope,
  showPageGuides,
  onTogglePageGuides,
  favoriteFonts,
  documentStyleId,
  onFontLibrary,
  onDocumentStyle,
  onZoom,
  onFitPage,
  onInsertObject,
  onObjectAction,
  statisticsDocument,
  selectionText,
}: {
  editor: Editor | null;
  documentName: string;
  saveLabel: string;
  selectedObject: DocumentObject | null;
  pageCount: number;
  currentPage: number;
  zoom: number;
  aiOpen: boolean;
  pageNavOpen: boolean;
  onDocumentName: (name: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onFiles: (files: FileList) => void;
  onNewDocument: () => void;
  onAddPage: () => void;
  onDuplicatePage: () => void;
  onDeletePage: () => void;
  onExport: () => void;
  onPrint: () => void;
  onAdmin: () => void;
  onPageSetup: () => void;
  onReview: () => void;
  onCloudSync: () => void;
  onToggleAi: () => void;
  onTogglePageNav: () => void;
  pagePreset: PagePreset;
  pageOrientation: 'portrait' | 'landscape';
  onPagePreset: (preset: PagePreset) => void;
  onPageOrientation: () => void;
  onResetMargins: () => void;
  pageLayoutScope: 'current' | 'all';
  onTogglePageLayoutScope: () => void;
  showPageGuides: boolean;
  onTogglePageGuides: () => void;
  favoriteFonts: string[];
  documentStyleId: DocumentStyleId;
  onFontLibrary: () => void;
  onDocumentStyle: (styleId: DocumentStyleId) => void;
  onZoom: (value: number) => void;
  onFitPage: () => void;
  onInsertObject: (type: 'text-box' | 'shape') => void;
  onObjectAction: (action: 'front' | 'back' | 'lock' | 'duplicate' | 'delete' | 'center-x' | 'center-y') => void;
  statisticsDocument: EditorDocument;
  selectionText: string;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  const formatting = useEditorState({ editor, selector: ({ editor: value }) => ({
    font: value?.getAttributes('textStyle').fontFamily || DEFAULT_FONT_FAMILY,
    size: String(value?.getAttributes('textStyle').fontSize || '11pt').replace('pt', ''),
    block: value?.isActive('heading', { level: 1 }) ? 'h1' : value?.isActive('heading', { level: 2 }) ? 'h2' : value?.isActive('heading', { level: 3 }) ? 'h3' : value?.isActive('blockquote') ? 'quote' : 'p',
    bold: Boolean(value?.isActive('bold')), italic: Boolean(value?.isActive('italic')), underline: Boolean(value?.isActive('underline')), strike: Boolean(value?.isActive('strike')),
    align: value?.isActive({ textAlign: 'center' }) ? 'center' : value?.isActive({ textAlign: 'right' }) ? 'right' : value?.isActive({ textAlign: 'justify' }) ? 'justify' : 'left',
    bullet: Boolean(value?.isActive('bulletList')), ordered: Boolean(value?.isActive('orderedList')), table: Boolean(value?.isActive('table')),
  }) }) ?? { font: DEFAULT_FONT_FAMILY, size: '11', block: 'p', bold: false, italic: false, underline: false, strike: false, align: 'left', bullet: false, ordered: false, table: false };
  const menus = [
    { label: '파일', icon: FileText },
    { label: '글자', icon: Type },
    { label: '삽입', icon: ImagePlus },
    { label: '표', icon: Table2 },
    { label: '페이지', icon: Columns3 },
    { label: '검토', icon: Search },
    { label: 'AI', icon: Sparkles },
    { label: '보기', icon: Eye },
  ];
  const selectedFont = formatting.font;
  const applyFont = (family: string) => editor?.chain().focus().setFontFamily(family).run();
  const quickFonts = (favoriteFonts.length ? favoriteFonts : DEFAULT_FAVORITE_FONT_FAMILIES).filter(isBundledFont).slice(0, 6);
  const blockStyle = formatting.block;
  const { characters, words } = useDocumentStatistics(statisticsDocument);

  const textTools = <>
    <div className="quick-fonts" aria-label="자주 쓰는 글꼴">
      <span>바로 쓰기</span>
      {quickFonts.map((family) => <button key={family} className={selectedFont === family ? 'quick-font-button active' : 'quick-font-button'} type="button" style={{ fontFamily: family }} onClick={() => applyFont(family)} aria-label={`${fontLabel(family)} 글꼴 적용`}>{fontLabel(family)}</button>)}
      <button className="quick-font-more" type="button" onClick={onFontLibrary}>전체 글꼴</button>
    </div>
    <span className="divider" />
    <select className="select-tool" aria-label="글꼴" value={selectedFont} onChange={(event) => applyFont(event.target.value)}>
      <optgroup label="한글 글꼴">
        {KOREAN_FONTS.map((font) => <option key={font.family} value={font.family}>{font.label} · {font.description}</option>)}
      </optgroup>
      <optgroup label="English fonts">
        {ENGLISH_FONTS.map((font) => <option key={font.family} value={font.family}>{font.label} · {font.description}</option>)}
      </optgroup>
      {!isBundledFont(selectedFont) && <optgroup label="기존 문서 글꼴"><option value={selectedFont}>{selectedFont}</option></optgroup>}
    </select>
    <select className="style-tool" aria-label="문서 스타일" value={documentStyleId} onChange={(event) => onDocumentStyle(event.target.value as DocumentStyleId)}>
      {DOCUMENT_STYLE_PRESETS.map((style) => <option key={style.id} value={style.id}>{style.label} · {style.description}</option>)}
    </select>
    <select className="size-tool" aria-label="글자 크기" value={formatting.size} onChange={(event) => editor?.chain().focus().setFontSize(`${event.target.value}pt`).run()}>
      {[8,9,10,11,12,14,16,18,20,24,28,32,40,48].map((size) => <option key={size}>{size}</option>)}
    </select>
    <span className="divider" />
    <ToolButton label="굵게" active={formatting.bold} onClick={() => editor?.chain().focus().toggleBold().run()}><strong>가</strong></ToolButton>
    <ToolButton label="기울임" active={formatting.italic} onClick={() => editor?.chain().focus().toggleItalic().run()}><em>가</em></ToolButton>
    <ToolButton label="밑줄" active={formatting.underline} onClick={() => editor?.chain().focus().toggleUnderline().run()}><u>가</u></ToolButton>
    <ToolButton label="취소선" active={formatting.strike} onClick={() => editor?.chain().focus().toggleStrike().run()}><s>가</s></ToolButton>
    <label className="color-tool" title="글자색"><span>가</span><input type="color" aria-label="글자색" defaultValue="#1e2a27" onChange={(event) => editor?.chain().focus().setColor(event.target.value).run()} /></label>
    <label className="highlight-tool" title="형광펜"><span>형광</span><input type="color" aria-label="형광펜 색" defaultValue="#fff3a3" onChange={(event) => editor?.chain().focus().toggleHighlight({ color: event.target.value }).run()} /></label>
    <span className="divider" />
    <ToolButton label="왼쪽 정렬" active={formatting.align === 'left'} onClick={() => editor?.chain().focus().setTextAlign('left').run()}><AlignLeft size={18} /></ToolButton>
    <ToolButton label="가운데 정렬" active={formatting.align === 'center'} onClick={() => editor?.chain().focus().setTextAlign('center').run()}><AlignCenter size={18} /></ToolButton>
    <ToolButton label="오른쪽 정렬" active={formatting.align === 'right'} onClick={() => editor?.chain().focus().setTextAlign('right').run()}><AlignRight size={18} /></ToolButton>
    <ToolButton label="양쪽 정렬" active={formatting.align === 'justify'} onClick={() => editor?.chain().focus().setTextAlign('justify').run()}><AlignJustify size={18} /></ToolButton>
    <select className="line-height-tool" aria-label="줄 간격" defaultValue="1.7" onChange={(event) => editor?.chain().focus().setLineHeight(event.target.value).run()}>
      <option value="1.2">줄 120%</option><option value="1.5">줄 150%</option><option value="1.7">줄 170%</option><option value="2">줄 200%</option>
    </select>
    <span className="divider" />
    <select className="style-tool" aria-label="문단 스타일" value={blockStyle} onChange={(event) => {
      const value = event.target.value;
      if (value === 'quote') editor?.chain().focus().setBlockquote().run();
      else if (value === 'p') editor?.chain().focus().setParagraph().run();
      else editor?.chain().focus().setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 }).run();
    }}>
      <option value="p">본문</option><option value="h1">제목 1</option><option value="h2">제목 2</option><option value="h3">제목 3</option><option value="quote">인용문</option>
    </select>
    <ToolButton label="글머리표 목록" active={formatting.bullet} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={18} /></ToolButton>
    <ToolButton label="번호 목록" active={formatting.ordered} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={18} /></ToolButton>
  </>;

  const tableTools = <>
    <button className="label-tool" type="button" onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 size={17} /> 3×3 표</button>
    <ToolButton label="아래 행 추가" onClick={() => editor?.chain().focus().addRowAfter().run()} disabled={!formatting.table}><Plus size={16} />행</ToolButton>
    <ToolButton label="오른쪽 열 추가" onClick={() => editor?.chain().focus().addColumnAfter().run()} disabled={!formatting.table}><Plus size={16} />열</ToolButton>
    <ToolButton label="행 삭제" onClick={() => editor?.chain().focus().deleteRow().run()} disabled={!formatting.table}><Minus size={16} />행</ToolButton>
    <ToolButton label="열 삭제" onClick={() => editor?.chain().focus().deleteColumn().run()} disabled={!formatting.table}><Minus size={16} />열</ToolButton>
    <button className="label-tool" type="button" disabled={!formatting.table} onClick={() => editor?.chain().focus().mergeOrSplit().run()}>셀 병합/나누기</button>
    <ToolButton label="표 삭제" onClick={() => editor?.chain().focus().deleteTable().run()} disabled={!formatting.table}><Trash2 size={16} /></ToolButton>
  </>;

  return <>
    <header className="editor-top-pill">
      <input className="document-name" value={documentName} maxLength={80} onChange={(event) => onDocumentName(event.target.value)} aria-label="문서 이름" />
      <button className="save-state" type="button" onClick={onSave} title="지금 저장"><Save size={13} /><span>{saveLabel}</span></button>
    </header>
    <nav className="editor-left-rail" aria-label="문서 도구">
      <button className="rail-brand" type="button" onClick={onNewDocument} aria-label="우리의 AI 한글 홈" title="홈"><span>우</span></button>
      {menus.map(({ label, icon: Icon }) => <button className={menu === label ? 'rail-button selected' : 'rail-button'} type="button" key={label} onClick={() => setMenu((value) => value === label ? null : label)} aria-label={label} aria-pressed={menu === label} title={label}><Icon size={20} /><span>{label}</span></button>)}
    </nav>
    {menu && <aside className="tool-drawer" aria-label={`${menu} 도구 패널`}>
      <header><span>{menu}</span><button type="button" onClick={() => setMenu(null)} aria-label={`${menu} 도구 닫기`} title="닫기"><X size={18} /></button></header>
      <section className="ribbon" aria-label={`${menu} 도구`}>
      {menu === '파일' && <>
        <button className="label-tool" type="button" onClick={onNewDocument}><FilePlus2 size={17} /> 새 문서</button>
        <label className="label-tool file-label"><FileUp size={17} /> 열기<input type="file" accept=".hwpx,.docx,.odt,.rtf,.html,.htm,.md,.markdown,.txt,.csv,.json,.oah,image/*" multiple onChange={(event) => event.target.files && onFiles(event.target.files)} /></label>
        <button className="label-tool" type="button" onClick={onSave}><Save size={17} /> 지금 저장</button>
        <button className="label-tool" type="button" onClick={onExport}><Download size={17} /> 내보내기</button>
        <button className="label-tool" type="button" onClick={onPrint}><Printer size={17} /> 인쇄</button>
        <button className="label-tool" type="button" onClick={onCloudSync}><Cloud size={17} /> 클라우드 동기화</button>
        <button className="label-tool" type="button" onClick={onAdmin}><Settings size={17} /> 관리자 설정</button>
      </>}
      {menu === '글자' && textTools}
      {menu === '검토' && <button className="label-tool" type="button" onClick={onReview}><Search size={17} /> 찾기·바꾸기 / 맞춤법</button>}
      {menu === '삽입' && <>
        <label className="label-tool file-label"><ImagePlus size={17} /> 사진/파일<input type="file" multiple onChange={(event) => event.target.files && onFiles(event.target.files)} /></label>
        <button className="label-tool" type="button" onClick={() => onInsertObject('text-box')}><Type size={17} /> 글상자</button>
        <button className="label-tool" type="button" onClick={() => onInsertObject('shape')}><Square size={17} /> 도형</button>
        <button className="label-tool" type="button" onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 size={17} /> 표</button>
        <button className="label-tool" type="button" onClick={onAddPage}><FilePlus2 size={17} /> 새 페이지</button>
      </>}
      {menu === '표' && tableTools}
      {menu === '페이지' && <>
        <button className="label-tool" type="button" onClick={onPageSetup}><FileText size={17} /> 머리말·꼬리말 / 쪽 번호</button>
        <button className="label-tool" type="button" onClick={onAddPage}><FilePlus2 size={17} /> 페이지 추가</button>
        <button className="label-tool" type="button" onClick={onDuplicatePage}><Columns3 size={17} /> 현재 쪽 복제</button>
        <button className="label-tool danger" type="button" onClick={onDeletePage} disabled={pageCount <= 1}><Trash2 size={17} /> 현재 쪽 삭제</button>
        <span className="divider" />
        <button className="label-tool" type="button" onClick={onTogglePageLayoutScope}><ArrowLeftRight size={17} /> {pageLayoutScope === 'current' ? '현재 쪽' : '전체 쪽'}</button>
        <label className="label-tool">
          <span>문서 크기</span>
          <select className="select-tool" value={pagePreset} onChange={(event) => onPagePreset(event.target.value as PagePreset)} aria-label="문서 크기">
            {(Object.keys(PAGE_PRESET_LABELS) as PagePreset[]).map((preset) => <option key={preset} value={preset}>{PAGE_PRESET_LABELS[preset]}</option>)}
          </select>
        </label>
        <button className="label-tool" type="button" onClick={onPageOrientation}><ArrowLeftRight size={17} /> {pageOrientation === 'portrait' ? '가로' : '세로'}로 전환</button>
        <button className="label-tool" type="button" onClick={onResetMargins}><Layers2 size={17} /> 기본 여백으로 되돌리기</button>
        <button className="label-tool" type="button" onClick={onTogglePageGuides}><Eye size={17} /> 가이드 {showPageGuides ? '숨기기' : '보기'}</button>
      </>}
      {menu === 'AI' && <>
        <button className="label-tool primary" type="button" onClick={onToggleAi}><Bot size={17} /> AI 문서도우미</button>
        <span className="ribbon-help">AI 결과는 검토 후 사용자가 직접 문서에 적용합니다.</span>
      </>}
      {menu === '보기' && <>
        <button className="label-tool" type="button" onClick={onTogglePageNav}>{pageNavOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />} 페이지 탐색</button>
        <button className="label-tool" type="button" onClick={() => onZoom(100)}>100%</button>
        <button className="label-tool" type="button" onClick={onFitPage}>세로 한 쪽 맞춤</button>
        <WindowModeControls compact />
      </>}
      {selectedObject && <div className="object-context-tools">
        <span className="divider" />
        <strong>{selectedObject.type === 'image' ? '사진' : '개체'}</strong>
        <ToolButton label="가로 가운데" onClick={() => onObjectAction('center-x')}><AlignCenter size={17} /></ToolButton>
        <ToolButton label="세로 가운데" onClick={() => onObjectAction('center-y')}><MoreHorizontal size={17} /></ToolButton>
        <ToolButton label="앞으로" onClick={() => onObjectAction('front')}><Layers2 size={17} />↑</ToolButton>
        <ToolButton label="뒤로" onClick={() => onObjectAction('back')}><Layers2 size={17} />↓</ToolButton>
        <ToolButton label={selectedObject.locked ? '잠금 해제' : '잠금'} onClick={() => onObjectAction('lock')}>{selectedObject.locked ? <LockOpen size={17} /> : <Lock size={17} />}</ToolButton>
        <ToolButton label="복제" onClick={() => onObjectAction('duplicate')}><Columns3 size={17} /></ToolButton>
        <ToolButton label="삭제" onClick={() => onObjectAction('delete')}><Trash2 size={17} /></ToolButton>
      </div>}
      </section>
    </aside>}
    <div className="floating-quick-tools floating-left-tools" style={{ left: `max(74px, calc(50% - ${397 * zoom / 100 + 58}px))` }} aria-label="빠른 편집 도구">
      <ToolButton label="저장" onClick={onSave}><Save size={19} /></ToolButton>
      <ToolButton label="실행 취소" onClick={onUndo}><Undo2 size={19} /></ToolButton>
      <ToolButton label="다시 실행" onClick={onRedo}><Redo2 size={19} /></ToolButton>
    </div>
    <div className="floating-quick-tools floating-right-tools" style={{ right: `max(14px, calc(50% - ${397 * zoom / 100 + 58}px))` }} aria-label="빠른 삽입과 출력 도구">
      <ToolButton label="AI 문서도우미" active={aiOpen} onClick={onToggleAi}><Sparkles size={20} /></ToolButton>
      <label className="floating-file-button" title="사진 또는 파일 삽입" aria-label="사진 또는 파일 삽입"><ImagePlus size={20} /><input type="file" multiple onChange={(event) => event.target.files && onFiles(event.target.files)} /></label>
      <ToolButton label="글상자 삽입" onClick={() => onInsertObject('text-box')}><Type size={20} /></ToolButton>
      <ToolButton label="표 삽입" onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 size={20} /></ToolButton>
      <ToolButton label="새 페이지" onClick={onAddPage}><FilePlus2 size={20} /></ToolButton>
      <ToolButton label="내보내기" onClick={onExport}><Download size={20} /></ToolButton>
      <ToolButton label="인쇄" onClick={onPrint}><Printer size={20} /></ToolButton>
    </div>
    <footer className="statusbar status-pill">
      <span>{currentPage + 1}/{pageCount}쪽</span><span>{saveLabel}</span>
      <span className="document-stats">{selectionText ? `선택 ${selectionText.length.toLocaleString('ko-KR')}자` : `공백 포함 ${characters.toLocaleString('ko-KR')}자 · ${words.toLocaleString('ko-KR')}단어`}</span>
      <span className="zoom"><button type="button" onClick={() => onZoom(Math.max(50, zoom - 25))}>−</button><b>{zoom}%</b><button type="button" onClick={() => onZoom(Math.min(150, zoom + 25))}>+</button></span>
    </footer>
  </>;
}
