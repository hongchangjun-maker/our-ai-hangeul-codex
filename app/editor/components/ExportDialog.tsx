'use client';

import { Download, FileCode2, FileJson2, FileText, Printer, X } from 'lucide-react';

type ExportType = 'pdf' | 'png' | 'hwpx' | 'docx' | 'odt' | 'rtf' | 'markdown' | 'txt' | 'html' | 'source' | 'print';

export function ExportDialog({ open, busy, message, fontFamilies, onClose, onExport }: { open: boolean; busy: boolean; message: string; fontFamilies: string[]; onClose: () => void; onExport: (type: ExportType) => void }) {
  if (!open) return null;
  const items: Array<{ id: ExportType; label: string; detail: string; icon: React.ReactNode }> = [
    { id: 'hwpx', label: 'HWPX 기본 문서', detail: '본문·표와 앱 개체 왕복 정보를 저장', icon: <FileText /> },
    { id: 'docx', label: 'DOCX 문서', detail: '머리말·쪽 번호·표·사진을 Word로 저장', icon: <FileText /> },
    { id: 'odt', label: 'ODT 문서', detail: 'LibreOffice·OpenDocument 문서로 저장', icon: <FileText /> },
    { id: 'rtf', label: 'RTF 문서', detail: '폭넓게 열리는 서식 텍스트로 저장', icon: <FileText /> },
    { id: 'markdown', label: 'Markdown', detail: '제목·목록 중심의 범용 텍스트', icon: <FileCode2 /> },
    { id: 'pdf', label: 'PDF 문서', detail: '무손실 페이지 배치와 원본 사진을 보존', icon: <FileText /> },
    { id: 'png', label: '300 DPI PNG', detail: '각 쪽을 무손실 PNG로 저장 (여러 쪽은 ZIP)', icon: <FileText /> },
    { id: 'txt', label: 'TXT 텍스트', detail: '본문 글자만 간단히 저장', icon: <FileText /> },
    { id: 'html', label: 'HTML 문서', detail: '브라우저에서 열 수 있는 문서', icon: <FileCode2 /> },
    { id: 'source', label: '우리의 AI 한글 원본', detail: '사진·첨부를 원본 바이트로 담는 OAH', icon: <FileJson2 /> },
    { id: 'print', label: '인쇄 미리보기', detail: '브라우저 인쇄 설정에서 확인', icon: <Printer /> },
  ];
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><section className="dialog export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title">
    <header><div><span className="dialog-icon"><Download size={20} /></span><span><h2 id="export-title">문서 내보내기</h2><p>상단은 가장 많이 쓰는 워드프로세서 형식입니다.</p></span></div><button type="button" onClick={onClose} disabled={busy} aria-label="내보내기 닫기"><X /></button></header>
    <div className="export-grid">{items.map((item) => <button type="button" key={item.id} disabled={busy} onClick={() => onExport(item.id)}><span>{item.icon}</span><span><strong>{item.label}</strong><small>{item.detail}</small></span></button>)}</div>
    <aside className="font-compatibility-note"><strong>글꼴·호환 안내</strong><p>이 문서에서 사용하는 글꼴: {fontFamilies.join(', ') || '기본 글꼴'}</p><small>OAH·DOCX·HWPX에는 업로드한 사진의 원본 바이트를 재압축 없이 보존합니다. PDF도 JPEG 변환 없이 무손실 PNG 페이지와 원본 사진 데이터를 사용합니다. DOCX는 머리말·꼬리말·쪽 번호·표·사진을 표준 요소로 저장하고 글상자는 편집 가능한 표 상자로 변환합니다.</small><small>HWPX 표는 편집 가능한 표로 저장하며 사진·글상자의 정확한 위치는 우리의 AI 한글 왕복 정보로 보존합니다. 다른 컴퓨터에 글꼴이 없으면 대체될 수 있고, 외부 프로그램의 자유 배치 해석은 달라질 수 있습니다.</small></aside>
    {message && <p className="dialog-status" aria-live="polite">{message}</p>}<footer><span>가져오기: HWPX · DOCX · ODT · RTF · HTML · Markdown · TXT. 복잡한 외부 글상자 효과는 원본과 PDF도 함께 보관하세요.</span></footer>
  </section></div>;
}
