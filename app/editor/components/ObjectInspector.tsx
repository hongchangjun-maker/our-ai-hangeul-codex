'use client';

import { Copy, ExternalLink, FlipHorizontal2, FlipVertical2, Layers, Lock, LockOpen, RotateCcw, Trash2 } from 'lucide-react';
import type { DocumentObject, DocumentPage } from '../../domain/document';
import { imagePrintMetrics, normalizedCrop } from '../../domain/image-quality';
import { clamp } from '../../domain/geometry';
import { getAsset } from '../../infrastructure/local-storage';

type ObjectAction = 'front' | 'back' | 'lock' | 'duplicate' | 'delete' | 'center-x' | 'center-y';

function NumberField({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  return <label className="inspector-number"><span>{label}</span><input type="number" value={Math.round(value * 10) / 10} min={min} max={max} step={step} onChange={(event) => Number.isFinite(event.target.valueAsNumber) && onChange(clamp(event.target.valueAsNumber, min, max))} /></label>;
}

function formatBytes(size = 0) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))}KB`;
  return `${(size / 1024 / 1024).toFixed(1)}MB`;
}

export function ObjectInspector({ object, page, pageWidth, pageHeight, onChange, onAction }: {
  object: DocumentObject;
  page: DocumentPage;
  pageWidth: number;
  pageHeight: number;
  onChange: (patch: Partial<DocumentObject>) => void;
  onAction: (action: ObjectAction) => void;
}) {
  const typeLabel = object.type === 'image' ? '사진' : object.type === 'attachment' ? '첨부 파일' : object.type === 'text-box' ? '글상자' : '도형';
  const crop = normalizedCrop(object);
  const metrics = object.type === 'image' ? imagePrintMetrics(object, page) : null;
  const cropPercent = { left: crop.x * 100, top: crop.y * 100, right: (1 - crop.x - crop.width) * 100, bottom: (1 - crop.y - crop.height) * 100 };
  const setCropEdge = (edge: keyof typeof cropPercent, percent: number) => {
    const values = { ...cropPercent, [edge]: clamp(percent, 0, 90) };
    if (values.left + values.right > 95) values[edge] = 95 - values[edge === 'left' ? 'right' : 'left'];
    if (values.top + values.bottom > 95) values[edge] = 95 - values[edge === 'top' ? 'bottom' : 'top'];
    onChange({ crop: { x: values.left / 100, y: values.top / 100, width: 1 - (values.left + values.right) / 100, height: 1 - (values.top + values.bottom) / 100 } });
  };
  const openOriginal = async () => {
    if (!object.assetId) return;
    const asset = await getAsset(object.assetId); if (!asset) return;
    const url = URL.createObjectURL(asset.blob); window.open(url, '_blank', 'noopener,noreferrer'); setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return <section className="object-inspector" aria-label={`${typeLabel} 속성`}>
    <div className="inspector-heading"><span>선택한 {typeLabel}</span><small>마우스로 끌어 바로 조절</small></div>
    {object.type === 'image' && metrics && <div className={`image-quality ${metrics.quality}`}><strong>{metrics.dpi || 0} DPI</strong><span>{metrics.widthMm.toFixed(1)} × {metrics.heightMm.toFixed(1)}mm</span><small>{metrics.quality === 'low' ? '인쇄 시 흐릴 수 있습니다' : metrics.quality === 'caution' ? '인쇄 품질을 확인하세요' : '인쇄에 적합한 해상도'}</small></div>}
    {object.type === 'image' && <div className="image-source-info"><span>원본 {object.sourceWidthPx}×{object.sourceHeightPx}px</span><span>{formatBytes(object.size)}</span><button type="button" onClick={() => void openOriginal()}><ExternalLink size={12} /> 원본 보기</button></div>}
    {object.type === 'text-box' && <label className="inspector-text"><span>글상자 내용</span><textarea value={object.text || ''} maxLength={5000} onChange={(event) => onChange({ text: event.target.value })} /></label>}
    {(object.type === 'text-box' || object.type === 'shape') && <label className="inspector-color"><span>배경색</span><input type="color" value={object.style?.background || '#ffffff'} onChange={(event) => onChange({ style: { ...object.style, background: event.target.value } })} /></label>}
    <div className="inspector-grid">
      <NumberField label="X" value={object.x} min={0} max={pageWidth - object.width} onChange={(x) => onChange({ x })} />
      <NumberField label="Y" value={object.y} min={0} max={pageHeight - object.height} onChange={(y) => onChange({ y })} />
      <NumberField label="너비" value={object.width} min={44} max={pageWidth - object.x} onChange={(width) => onChange({ width })} />
      <NumberField label="높이" value={object.height} min={36} max={pageHeight - object.y} onChange={(height) => onChange({ height })} />
      <NumberField label="회전" value={object.rotation} min={-360} max={360} onChange={(rotation) => onChange({ rotation })} />
      <label className="inspector-number"><span>불투명도</span><output>{Math.round(object.opacity * 100)}%</output><input className="inspector-range" aria-label="불투명도" type="range" value={Math.round(object.opacity * 100)} min="10" max="100" onChange={(event) => onChange({ opacity: Number(event.target.value) / 100 })} /></label>
    </div>
    {object.type === 'image' && <fieldset className="crop-controls"><legend>비파괴 자르기 (%)</legend><div className="inspector-grid"><NumberField label="왼쪽" value={cropPercent.left} min={0} max={90} onChange={(value) => setCropEdge('left', value)} /><NumberField label="오른쪽" value={cropPercent.right} min={0} max={90} onChange={(value) => setCropEdge('right', value)} /><NumberField label="위" value={cropPercent.top} min={0} max={90} onChange={(value) => setCropEdge('top', value)} /><NumberField label="아래" value={cropPercent.bottom} min={0} max={90} onChange={(value) => setCropEdge('bottom', value)} /></div><div className="crop-actions"><button type="button" onClick={() => onChange({ flipX: !object.flipX })}><FlipHorizontal2 size={13} /> 좌우 반전</button><button type="button" onClick={() => onChange({ flipY: !object.flipY })}><FlipVertical2 size={13} /> 상하 반전</button><button type="button" onClick={() => onChange({ crop: undefined, flipX: false, flipY: false })}><RotateCcw size={13} /> 원본 복원</button></div></fieldset>}
    <div className="inspector-actions" aria-label="개체 빠른 작업">
      <button type="button" onClick={() => onAction('center-x')}>가로 중앙</button><button type="button" onClick={() => onAction('center-y')}>세로 중앙</button>
      <button type="button" onClick={() => onAction('front')}><Layers size={13} /> 앞으로</button><button type="button" onClick={() => onAction('back')}><Layers size={13} /> 뒤로</button>
      <button type="button" onClick={() => onAction('duplicate')}><Copy size={13} /> 복제</button><button type="button" onClick={() => onAction('lock')}>{object.locked ? <LockOpen size={13} /> : <Lock size={13} />}{object.locked ? '잠금 해제' : '잠금'}</button>
      <button className="danger" type="button" onClick={() => onAction('delete')}><Trash2 size={13} /> 삭제</button>
    </div>
    <p className="inspector-tip">원본은 변경되지 않습니다. 복제·실행 취소·저장 후 다시 열기에도 같은 자산 ID와 편집값을 사용합니다.</p>
  </section>;
}
