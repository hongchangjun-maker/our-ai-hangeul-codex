'use client';

import { Copy, Layers, Lock, LockOpen, Trash2 } from 'lucide-react';
import type { DocumentObject } from '../../domain/document';
import { clamp } from '../../domain/geometry';

type ObjectAction = 'front' | 'back' | 'lock' | 'duplicate' | 'delete' | 'center-x' | 'center-y';

function NumberField({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  return <label className="inspector-number"><span>{label}</span><input type="number" value={Math.round(value * 10) / 10} min={min} max={max} step={step} onChange={(event) => Number.isFinite(event.target.valueAsNumber) && onChange(clamp(event.target.valueAsNumber, min, max))} /></label>;
}

export function ObjectInspector({ object, pageWidth, pageHeight, onChange, onAction }: {
  object: DocumentObject;
  pageWidth: number;
  pageHeight: number;
  onChange: (patch: Partial<DocumentObject>) => void;
  onAction: (action: ObjectAction) => void;
}) {
  const typeLabel = object.type === 'image' ? '사진' : object.type === 'attachment' ? '첨부 파일' : object.type === 'text-box' ? '글상자' : '도형';
  return <section className="object-inspector" aria-label={`${typeLabel} 속성`}>
    <div className="inspector-heading"><span>선택한 {typeLabel}</span><small>마우스로 끌어 바로 조절</small></div>
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
    <div className="inspector-actions" aria-label="개체 빠른 작업">
      <button type="button" onClick={() => onAction('center-x')}>가로 중앙</button><button type="button" onClick={() => onAction('center-y')}>세로 중앙</button>
      <button type="button" onClick={() => onAction('front')}><Layers size={13} /> 앞으로</button><button type="button" onClick={() => onAction('back')}><Layers size={13} /> 뒤로</button>
      <button type="button" onClick={() => onAction('duplicate')}><Copy size={13} /> 복제</button><button type="button" onClick={() => onAction('lock')}>{object.locked ? <LockOpen size={13} /> : <Lock size={13} />}{object.locked ? '잠금 해제' : '잠금'}</button>
      <button className="danger" type="button" onClick={() => onAction('delete')}><Trash2 size={13} /> 삭제</button>
    </div>
    <p className="inspector-tip">우클릭하면 같은 작업을 캔버스에서 바로 실행할 수 있습니다.</p>
  </section>;
}
