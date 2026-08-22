'use client';

import { Download, FileCode2, FileJson2, FileText, Printer, X } from 'lucide-react';

export function ExportDialog({ open, busy, message, onClose, onExport }: { open: boolean; busy: boolean; message: string; onClose: () => void; onExport: (type: 'pdf' | 'txt' | 'html' | 'source' | 'print') => void }) {
  if (!open) return null;
  const items = [
    { id: 'pdf' as const, label: 'PDF 문서', detail: 'A4 페이지 배치를 이미지로 보존', icon: <FileText /> },
    { id: 'txt' as const, label: 'TXT 텍스트', detail: '본문 글자만 간단히 저장', icon: <FileText /> },
    { id: 'html' as const, label: 'HTML 문서', detail: '브라우저에서 열 수 있는 문서', icon: <FileCode2 /> },
    { id: 'source' as const, label: '우리의 AI 한글 원본', detail: '다시 열고 편집할 수 있는 JSON', icon: <FileJson2 /> },
    { id: 'print' as const, label: '인쇄 미리보기', detail: '브라우저 인쇄 설정에서 확인', icon: <Printer /> },
  ];
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><section className="dialog export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title"><header><div><span className="dialog-icon"><Download size={20} /></span><span><h2 id="export-title">문서 내보내기</h2><p>필요한 형식을 선택하세요.</p></span></div><button type="button" onClick={onClose} disabled={busy} aria-label="내보내기 닫기"><X /></button></header><div className="export-grid">{items.map((item) => <button type="button" key={item.id} disabled={busy} onClick={() => onExport(item.id)}><span>{item.icon}</span><span><strong>{item.label}</strong><small>{item.detail}</small></span></button>)}</div>{message && <p className="dialog-status" aria-live="polite">{message}</p>}<footer><span>HWPX·DOCX 가져오기/내보내기는 2차 호환 엔진에서 제공합니다.</span></footer></section></div>;
}
