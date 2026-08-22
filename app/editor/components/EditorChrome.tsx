'use client';

import type { Editor } from '@tiptap/react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bot,
  Columns3,
  Download,
  FilePlus2,
  FileUp,
  ImagePlus,
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
  Settings,
  Sparkles,
  Table2,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useState } from 'react';
import type { DocumentObject } from '../../domain/document';

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
  onExport,
  onPrint,
  onAdmin,
  onToggleAi,
  onTogglePageNav,
  onZoom,
  onObjectAction,
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
  onToggleAi: () => void;
  onTogglePageNav: () => void;
  onZoom: (value: number) => void;
  onObjectAction: (action: 'front' | 'back' | 'lock' | 'duplicate' | 'delete' | 'center-x' | 'center-y') => void;
}) {
  const [menu, setMenu] = useState('글자');
  const menus = ['파일', '글자', '삽입', '표', '페이지', 'AI', '보기'];

  const textTools = <>
    <select className="select-tool" aria-label="글꼴" value={editor?.getAttributes('textStyle').fontFamily || 'Noto Sans KR'} onChange={(event) => editor?.chain().focus().setFontFamily(event.target.value).run()}>
      <option>Noto Sans KR</option><option>Noto Serif KR</option><option>Nanum Gothic</option><option>Nanum Myeongjo</option><option>Malgun Gothic</option>
    </select>
    <select className="size-tool" aria-label="글자 크기" value={(editor?.getAttributes('textStyle').fontSize || '11pt').replace('pt', '')} onChange={(event) => editor?.chain().focus().setFontSize(`${event.target.value}pt`).run()}>
      {[8,9,10,11,12,14,16,18,20,24,28,32,40,48].map((size) => <option key={size}>{size}</option>)}
    </select>
    <span className="divider" />
    <ToolButton label="굵게" active={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()}><strong>가</strong></ToolButton>
    <ToolButton label="기울임" active={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()}><em>가</em></ToolButton>
    <ToolButton label="밑줄" active={editor?.isActive('underline')} onClick={() => editor?.chain().focus().toggleUnderline().run()}><u>가</u></ToolButton>
    <ToolButton label="취소선" active={editor?.isActive('strike')} onClick={() => editor?.chain().focus().toggleStrike().run()}><s>가</s></ToolButton>
    <label className="color-tool" title="글자색"><span>가</span><input type="color" aria-label="글자색" defaultValue="#1e2a27" onChange={(event) => editor?.chain().focus().setColor(event.target.value).run()} /></label>
    <label className="highlight-tool" title="형광펜"><span>형광</span><input type="color" aria-label="형광펜 색" defaultValue="#fff3a3" onChange={(event) => editor?.chain().focus().toggleHighlight({ color: event.target.value }).run()} /></label>
    <span className="divider" />
    <ToolButton label="왼쪽 정렬" active={editor?.isActive({ textAlign: 'left' })} onClick={() => editor?.chain().focus().setTextAlign('left').run()}><AlignLeft size={18} /></ToolButton>
    <ToolButton label="가운데 정렬" active={editor?.isActive({ textAlign: 'center' })} onClick={() => editor?.chain().focus().setTextAlign('center').run()}><AlignCenter size={18} /></ToolButton>
    <ToolButton label="오른쪽 정렬" active={editor?.isActive({ textAlign: 'right' })} onClick={() => editor?.chain().focus().setTextAlign('right').run()}><AlignRight size={18} /></ToolButton>
    <ToolButton label="양쪽 정렬" active={editor?.isActive({ textAlign: 'justify' })} onClick={() => editor?.chain().focus().setTextAlign('justify').run()}><AlignJustify size={18} /></ToolButton>
    <select className="line-height-tool" aria-label="줄 간격" defaultValue="1.7" onChange={(event) => editor?.chain().focus().setLineHeight(event.target.value).run()}>
      <option value="1.2">줄 120%</option><option value="1.5">줄 150%</option><option value="1.7">줄 170%</option><option value="2">줄 200%</option>
    </select>
  </>;

  const tableTools = <>
    <button className="label-tool" type="button" onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 size={17} /> 3×3 표</button>
    <ToolButton label="아래 행 추가" onClick={() => editor?.chain().focus().addRowAfter().run()} disabled={!editor?.isActive('table')}><Plus size={16} />행</ToolButton>
    <ToolButton label="오른쪽 열 추가" onClick={() => editor?.chain().focus().addColumnAfter().run()} disabled={!editor?.isActive('table')}><Plus size={16} />열</ToolButton>
    <ToolButton label="행 삭제" onClick={() => editor?.chain().focus().deleteRow().run()} disabled={!editor?.isActive('table')}><Minus size={16} />행</ToolButton>
    <ToolButton label="열 삭제" onClick={() => editor?.chain().focus().deleteColumn().run()} disabled={!editor?.isActive('table')}><Minus size={16} />열</ToolButton>
    <button className="label-tool" type="button" disabled={!editor?.isActive('table')} onClick={() => editor?.chain().focus().mergeOrSplit().run()}>셀 병합/나누기</button>
    <ToolButton label="표 삭제" onClick={() => editor?.chain().focus().deleteTable().run()} disabled={!editor?.isActive('table')}><Trash2 size={16} /></ToolButton>
  </>;

  return <>
    <header className="topbar">
      <button className="compact-brand" type="button" onClick={onNewDocument} aria-label="우리의 AI 한글 홈"><span>우</span><strong>우리의 AI 한글</strong></button>
      <input className="document-name" value={documentName} maxLength={80} onChange={(event) => onDocumentName(event.target.value)} aria-label="문서 이름" />
      <div className="top-actions">
        <button className="save-state" type="button" onClick={onSave}><Save size={14} /> {saveLabel}</button>
        <ToolButton label="실행 취소" onClick={onUndo}><Undo2 size={18} /></ToolButton>
        <ToolButton label="다시 실행" onClick={onRedo}><Redo2 size={18} /></ToolButton>
        <button className={aiOpen ? 'ai-button active' : 'ai-button'} type="button" onClick={onToggleAi}><Sparkles size={17} /> AI</button>
        <ToolButton label="내보내기" onClick={onExport}><Download size={18} /></ToolButton>
        <ToolButton label="인쇄" onClick={onPrint}><Printer size={18} /></ToolButton>
        <ToolButton label="관리자" onClick={onAdmin}><Settings size={18} /></ToolButton>
      </div>
    </header>
    <nav className="menu-tabs" aria-label="문서 메뉴">
      {menus.map((item) => <button className={menu === item ? 'selected' : ''} type="button" key={item} onClick={() => setMenu(item)}>{item}</button>)}
    </nav>
    <section className="ribbon" aria-label={`${menu} 도구`}>
      {menu === '파일' && <>
        <button className="label-tool" type="button" onClick={onNewDocument}><FilePlus2 size={17} /> 새 문서</button>
        <label className="label-tool file-label"><FileUp size={17} /> 열기<input type="file" multiple onChange={(event) => event.target.files && onFiles(event.target.files)} /></label>
        <button className="label-tool" type="button" onClick={onSave}><Save size={17} /> 지금 저장</button>
        <button className="label-tool" type="button" onClick={onExport}><Download size={17} /> 내보내기</button>
        <button className="label-tool" type="button" onClick={onPrint}><Printer size={17} /> 인쇄</button>
      </>}
      {menu === '글자' && textTools}
      {menu === '삽입' && <>
        <label className="label-tool file-label"><ImagePlus size={17} /> 사진/파일<input type="file" multiple onChange={(event) => event.target.files && onFiles(event.target.files)} /></label>
        <button className="label-tool" type="button" onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 size={17} /> 표</button>
        <button className="label-tool" type="button" onClick={onAddPage}><FilePlus2 size={17} /> 새 페이지</button>
      </>}
      {menu === '표' && tableTools}
      {menu === '페이지' && <>
        <button className="label-tool" type="button" onClick={onAddPage}><FilePlus2 size={17} /> 페이지 추가</button>
        <button className="label-tool" type="button" onClick={onDuplicatePage}><Columns3 size={17} /> 현재 쪽 복제</button>
        <button className="label-tool danger" type="button" onClick={onDeletePage} disabled={pageCount <= 1}><Trash2 size={17} /> 현재 쪽 삭제</button>
      </>}
      {menu === 'AI' && <>
        <button className="label-tool primary" type="button" onClick={onToggleAi}><Bot size={17} /> AI 문서도우미</button>
        <span className="ribbon-help">AI 결과는 검토 후 사용자가 직접 문서에 적용합니다.</span>
      </>}
      {menu === '보기' && <>
        <button className="label-tool" type="button" onClick={onTogglePageNav}>{pageNavOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />} 페이지 탐색</button>
        <button className="label-tool" type="button" onClick={() => onZoom(100)}>100%</button>
        <button className="label-tool" type="button" onClick={() => onZoom(75)}>페이지 맞춤</button>
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
    <footer className="statusbar">
      <span>{currentPage + 1}/{pageCount}쪽</span><span>{saveLabel}</span>
      <span className="zoom"><button type="button" onClick={() => onZoom(Math.max(50, zoom - 25))}>−</button><b>{zoom}%</b><button type="button" onClick={() => onZoom(Math.min(150, zoom + 25))}>+</button></span>
    </footer>
  </>;
}
