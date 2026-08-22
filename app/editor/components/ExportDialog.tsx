'use client';

import { Download, FileCode2, FileJson2, FileText, Printer, X } from 'lucide-react';

export function ExportDialog({ open, busy, message, fontFamilies, onClose, onExport }: { open: boolean; busy: boolean; message: string; fontFamilies: string[]; onClose: () => void; onExport: (type: 'pdf' | 'hwpx' | 'docx' | 'odt' | 'rtf' | 'markdown' | 'txt' | 'html' | 'source' | 'print') => void }) {
  if (!open) return null;
  const items = [
    { id: 'hwpx' as const, label: 'HWPX 기본 문서', detail: '한글 HWPX 텍스트 문서로 저장', icon: <FileText /> },
    { id: 'docx' as const, label: 'DOCX 문서', detail: '본문·제목을 편집 가능한 Word 문서로 저장', icon: <FileText /> },
    { id: 'odt' as const, label: 'ODT 문서', detail: 'LibreOffice·OpenDocument 문서로 저장', icon: <FileText /> },
    { id: 'rtf' as const, label: 'RTF 문서', detail: '폭넓게 열리는 서식 텍스트로 저장', icon: <FileText /> },
    { id: 'markdown' as const, label: 'Markdown', detail: '제목·목록 중심의 범용 텍스트', icon: <FileCode2 /> },
    { id: 'pdf' as const, label: 'PDF 문서', detail: '현재 페이지 배치를 이미지로 보존', icon: <FileText /> },
    { id: 'txt' as const, label: 'TXT 텍스트', detail: '본문 글자만 간단히 저장', icon: <FileText /> },
    { id: 'html' as const, label: 'HTML 문서', detail: '브라우저에서 열 수 있는 문서', icon: <FileCode2 /> },
    { id: 'source' as const, label: '우리의 AI 한글 원본', detail: '다시 열고 편집할 수 있는 JSON', icon: <FileJson2 /> },
    { id: 'print' as const, label: '인쇄 미리보기', detail: '브라우저 인쇄 설정에서 확인', icon: <Printer /> },
  ];
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><section className="dialog export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title"><header><div><span className="dialog-icon"><Download size={20} /></span><span><h2 id="export-title">문서 내보내기</h2><p>상단은 가장 많이 쓰는 워드프로세서 형식입니다.</p></span></div><button type="button" onClick={onClose} disabled={busy} aria-label="내보내기 닫기"><X /></button></header><div className="export-grid">{items.map((item) => <button type="button" key={item.id} disabled={busy} onClick={() => onExport(item.id)}><span>{item.icon}</span><span><strong>{item.label}</strong><small>{item.detail}</small></span></button>)}</div><aside className="font-compatibility-note"><strong>글꼴·호환 안내</strong><p>이 문서에서 사용하는 글꼴: {fontFamilies.join(', ') || '기본 글꼴'}</p><small>HWPX·DOCX·ODT·RTF는 편집 가능한 본문·제목 중심으로 저장합니다. 다른 컴퓨터에 해당 글꼴이 없으면 대체될 수 있으며, 자유 배치 사진·개체는 PDF가 가장 안전합니다. 구형 HWP·DOC는 안전한 브라우저 변환기가 없어 지원하지 않습니다.</small><small>본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.</small></aside>{message && <p className="dialog-status" aria-live="polite">{message}</p>}<footer><span>가져오기: HWPX · DOCX · ODT · RTF · HTML · Markdown · TXT. 표·복잡한 개체는 원본과 PDF도 함께 보관하세요.</span></footer></section></div>;
}
