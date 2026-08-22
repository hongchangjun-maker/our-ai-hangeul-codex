'use client';

import { Clock3, FileText, ImagePlus, Settings, Sparkles } from 'lucide-react';
import type { EditorDocument } from '../../domain/document';
import { WindowModeControls } from './WindowModeControls';

const templates = [
  { id: 'blank', label: '빈 문서', description: 'A4 문서를 처음부터 만들어요', color: 'mint' },
  { id: 'report', label: '보고서', description: '제목과 요약이 준비된 문서', color: 'blue' },
  { id: 'official', label: '공문', description: '정돈된 공문 기본 양식', color: 'peach' },
  { id: 'minutes', label: '회의록', description: '안건과 결정사항을 빠르게', color: 'lilac' },
];

export function WelcomeScreen({
  recent,
  interrupted,
  onCreate,
  onOpen,
  onFile,
  onAdmin,
}: {
  recent: EditorDocument[];
  interrupted: boolean;
  onCreate: (templateId: string) => void;
  onOpen: (document: EditorDocument) => void;
  onFile: (files: FileList) => void;
  onAdmin: () => void;
}) {
  return (
    <main className="welcome-shell" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (event.dataTransfer.files.length) onFile(event.dataTransfer.files); }}>
      <header className="welcome-header">
        <button className="brand" type="button" aria-label="우리의 AI 한글 홈">
          <span className="brand-mark">우</span>
          <span><strong>우리의 AI 한글</strong><small>문서는 어렵지 않아야 합니다.</small></span>
        </button>
        <div className="welcome-actions"><WindowModeControls /><button className="quiet-button" type="button" onClick={onAdmin}><Settings size={17} /> 관리자</button></div>
      </header>
      <section className="welcome-hero" aria-labelledby="welcome-title">
        <div className="welcome-banner">
          <div className="welcome-banner-copy">
            <span className="eyebrow"><Sparkles size={15} /> 누구나 5분 안에 만드는 한글 문서</span>
            <h1 id="welcome-title">생각을 문서로,<br />더 자연스럽게</h1>
            <p>표준 문서부터 AI 검토와 공동 편집까지 한곳에서 시작하세요.</p>
            <div className="template-choices" aria-label="새 문서 종류">
              {templates.map((template) => <button type="button" key={template.id} onClick={() => onCreate(template.id)} title={template.description}>{template.label}</button>)}
            </div>
          </div>
        </div>
        <label className="drop-zone">
          <ImagePlus size={22} />
          <span><strong>파일을 여기에 끌어 놓아도 됩니다</strong><small>HWPX · DOCX · ODT · RTF · HTML · Markdown · TXT를 바로 열어요</small></span>
          <input type="file" accept=".hwpx,.docx,.odt,.rtf,.html,.htm,.md,.markdown,.txt,.csv,.json,.oah,image/*" multiple onChange={(event) => event.target.files && onFile(event.target.files)} />
        </label>
      </section>
      {recent.length > 0 && (
        <section className="recent-documents" aria-labelledby="recent-heading">
          <div className="recent-heading"><span><Clock3 size={16} /><strong id="recent-heading">최근 문서</strong></span>{interrupted && <em>자동 저장된 이전 작업이 있습니다</em>}</div>
          <div className="recent-list">
            {recent.slice(0, 4).map((document) => (
              <button type="button" key={document.id} onClick={() => onOpen(document)}>
                <span className="recent-icon"><FileText size={20} /></span>
                <span><strong>{document.name}</strong><small>{new Date(document.updatedAt).toLocaleString('ko-KR')} · {document.pages.length}쪽</small></span>
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
