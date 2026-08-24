'use client';

import { FileText, Ruler, X } from 'lucide-react';
import { useState } from 'react';
import { PAGE_PRESET_LABELS, PAGE_PRESETS, type EditorDocument, type Orientation, type PageMargins, type PagePreset } from '../../domain/document';
import { applyPageLayout, type PageLayoutScope } from '../../domain/page-layout';
import { useDialogBehavior } from '../hooks/use-dialog-behavior';

type PageSetupDialogProps = { open: boolean; document: EditorDocument; currentPage: number; onChange: (document: EditorDocument) => void; onClose: () => void };

export function PageSetupDialog(props: PageSetupDialogProps) {
  if (!props.open) return null;
  return <OpenPageSetupDialog {...props} />;
}

function OpenPageSetupDialog({ document, currentPage, onChange, onClose }: PageSetupDialogProps) {
  const dialogRef = useDialogBehavior(true, onClose);
  const page = document.pages[currentPage] ?? document.pages[0];
  const [preset, setPreset] = useState<PagePreset>(page.preset);
  const [orientation, setOrientation] = useState<Orientation>(page.orientation);
  const [margins, setMargins] = useState<PageMargins>({ ...page.margins });
  const [scope, setScope] = useState<PageLayoutScope>('all');
  const numbering = document.settings.pageNumber;
  const updatePage = (patch: Partial<typeof page>) => onChange({ ...document, pages: document.pages.map((item, index) => index === currentPage ? { ...item, ...patch } : item) });
  const updateAll = (field: 'header' | 'footer', value: string) => onChange({ ...document, pages: document.pages.map((item) => ({ ...item, [field]: value })) });
  const updateNumber = (patch: Partial<typeof numbering>) => onChange({ ...document, settings: { ...document.settings, pageNumber: { ...numbering, ...patch } } });
  const paper = PAGE_PRESETS[preset];
  const paperWidth = orientation === 'portrait' ? paper.widthMm : paper.heightMm;
  const paperHeight = orientation === 'portrait' ? paper.heightMm : paper.widthMm;
  const setMargin = (edge: keyof PageMargins, value: string) => setMargins((current) => ({ ...current, [edge]: Math.max(0, Number(value) || 0) }));
  const setEqualMargins = (value: number) => setMargins({ top: value, right: value, bottom: value, left: value });
  const applyLayout = () => {
    onChange(applyPageLayout(document, currentPage, scope, preset, orientation, margins));
    onClose();
  };

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={dialogRef} tabIndex={-1} className="dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="page-setup-title">
    <header><div><span className="dialog-icon"><FileText size={20} /></span><span><h2 id="page-setup-title">용지·여백과 쪽 설정</h2><p>정확한 표준 용지와 입력 영역을 현재 쪽 또는 전체 쪽에 적용합니다.</p></span></div><button type="button" onClick={onClose} aria-label="닫기"><X /></button></header>
    <div className="dialog-form">
      <fieldset className="page-layout-settings"><legend><Ruler size={15} /> 용지와 여백</legend>
        <div className="form-row"><label>표준 용지<select value={preset} onChange={(event) => setPreset(event.target.value as PagePreset)}>{(Object.keys(PAGE_PRESET_LABELS) as PagePreset[]).map((item) => <option key={item} value={item}>{PAGE_PRESET_LABELS[item]}</option>)}</select></label><label>방향<select value={orientation} onChange={(event) => setOrientation(event.target.value as Orientation)}><option value="portrait">세로</option><option value="landscape">가로</option></select></label></div>
        <p className="paper-dimension" role="status"><strong>{preset} {orientation === 'portrait' ? '세로' : '가로'}</strong><span>{paperWidth} × {paperHeight}mm</span></p>
        <div className="margin-presets" aria-label="빠른 여백"><button type="button" onClick={() => setEqualMargins(25.4)}>표준 25.4</button><button type="button" onClick={() => setEqualMargins(20)}>보통 20</button><button type="button" onClick={() => setEqualMargins(12.7)}>좁게 12.7</button><button type="button" onClick={() => setEqualMargins(30)}>넓게 30</button></div>
        <div className="margin-input-grid"><label>위쪽<input type="number" min="0" step="0.1" value={margins.top} onChange={(event) => setMargin('top', event.target.value)} /><span>mm</span></label><label>오른쪽<input type="number" min="0" step="0.1" value={margins.right} onChange={(event) => setMargin('right', event.target.value)} /><span>mm</span></label><label>아래쪽<input type="number" min="0" step="0.1" value={margins.bottom} onChange={(event) => setMargin('bottom', event.target.value)} /><span>mm</span></label><label>왼쪽<input type="number" min="0" step="0.1" value={margins.left} onChange={(event) => setMargin('left', event.target.value)} /><span>mm</span></label></div>
        <div className="layout-apply-row"><span className="layout-scope" role="group" aria-label="적용 범위"><button className={scope === 'current' ? 'selected' : ''} type="button" aria-pressed={scope === 'current'} onClick={() => setScope('current')}>현재 {currentPage + 1}쪽</button><button className={scope === 'all' ? 'selected' : ''} type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>전체 {document.pages.length}쪽</button></span><button className="primary-action" type="button" onClick={applyLayout}>{scope === 'all' ? '전체 쪽에 적용' : '현재 쪽에 적용'}</button></div>
        <p className="notice">각 페이지는 선택한 실제 규격 비율로 고정됩니다. 여백선은 화면에서만 보이며 인쇄와 파일 저장에는 포함되지 않습니다.</p>
      </fieldset>
      <label>현재 쪽 머리말<input value={page.header ?? ''} maxLength={300} onChange={(event) => updatePage({ header: event.target.value })} /></label><button className="secondary-action" type="button" onClick={() => updateAll('header', page.header ?? '')}>모든 쪽에 같은 머리말</button>
      <label>현재 쪽 꼬리말<input value={page.footer ?? ''} maxLength={300} onChange={(event) => updatePage({ footer: event.target.value })} /></label><button className="secondary-action" type="button" onClick={() => updateAll('footer', page.footer ?? '')}>모든 쪽에 같은 꼬리말</button>
      <label className="checkbox-row"><input type="checkbox" checked={numbering.enabled} onChange={(event) => updateNumber({ enabled: event.target.checked })} /><span><strong>쪽 번호 표시</strong><small>사용자가 지정한 시작 번호부터 자동 계산합니다.</small></span></label>
      <div className="form-row"><label>시작 번호<input type="number" min="0" max="100000" value={numbering.start} onChange={(event) => updateNumber({ start: Math.max(0, Number(event.target.value) || 0) })} /></label><label>표시 형식<select value={numbering.format} onChange={(event) => updateNumber({ format: event.target.value as typeof numbering.format })}><option value="number">1</option><option value="dash">- 1 -</option><option value="page-of-total">1 / 전체 3</option></select></label></div>
      <label>위치<select value={numbering.position} onChange={(event) => updateNumber({ position: event.target.value as typeof numbering.position })}><option value="footer-center">꼬리말 가운데</option><option value="footer-right">꼬리말 오른쪽</option><option value="header-right">머리말 오른쪽</option></select></label>
    </div>
  </section></div>;
}
