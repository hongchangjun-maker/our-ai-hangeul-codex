'use client';

import { FileText, X } from 'lucide-react';
import type { EditorDocument } from '../../domain/document';

export function PageSetupDialog({ open, document, currentPage, onChange, onClose }: { open: boolean; document: EditorDocument; currentPage: number; onChange: (document: EditorDocument) => void; onClose: () => void }) {
  if (!open) return null;
  const page = document.pages[currentPage]; const numbering = document.settings.pageNumber;
  const updatePage = (patch: Partial<typeof page>) => onChange({ ...document, pages: document.pages.map((item, index) => index === currentPage ? { ...item, ...patch } : item) });
  const updateAll = (field: 'header' | 'footer', value: string) => onChange({ ...document, pages: document.pages.map((item) => ({ ...item, [field]: value })) });
  const updateNumber = (patch: Partial<typeof numbering>) => onChange({ ...document, settings: { ...document.settings, pageNumber: { ...numbering, ...patch } } });
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="page-setup-title">
    <header><div><span className="dialog-icon"><FileText size={20} /></span><span><h2 id="page-setup-title">머리말·꼬리말과 쪽 번호</h2><p>화면, 인쇄, PDF와 Office 내보내기에 적용됩니다.</p></span></div><button type="button" onClick={onClose} aria-label="닫기"><X /></button></header>
    <div className="dialog-form"><label>현재 쪽 머리말<input value={page.header ?? ''} maxLength={300} onChange={(event) => updatePage({ header: event.target.value })} /></label><button className="secondary-action" type="button" onClick={() => updateAll('header', page.header ?? '')}>모든 쪽에 같은 머리말</button>
      <label>현재 쪽 꼬리말<input value={page.footer ?? ''} maxLength={300} onChange={(event) => updatePage({ footer: event.target.value })} /></label><button className="secondary-action" type="button" onClick={() => updateAll('footer', page.footer ?? '')}>모든 쪽에 같은 꼬리말</button>
      <label className="checkbox-row"><input type="checkbox" checked={numbering.enabled} onChange={(event) => updateNumber({ enabled: event.target.checked })} /><span><strong>쪽 번호 표시</strong><small>사용자가 지정한 시작 번호부터 자동 계산합니다.</small></span></label>
      <div className="form-row"><label>시작 번호<input type="number" min="0" max="100000" value={numbering.start} onChange={(event) => updateNumber({ start: Math.max(0, Number(event.target.value) || 0) })} /></label><label>표시 형식<select value={numbering.format} onChange={(event) => updateNumber({ format: event.target.value as typeof numbering.format })}><option value="number">1</option><option value="dash">- 1 -</option><option value="page-of-total">1 / 전체 3</option></select></label></div>
      <label>위치<select value={numbering.position} onChange={(event) => updateNumber({ position: event.target.value as typeof numbering.position })}><option value="footer-center">꼬리말 가운데</option><option value="footer-right">꼬리말 오른쪽</option><option value="header-right">머리말 오른쪽</option></select></label>
    </div>
  </section></div>;
}
