'use client';

import { Copy, Download, FileText, Grip, Layers, Lock, LockOpen, RotateCw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { DocumentObject } from '../../domain/document';
import { clamp, snapCoordinate } from '../../domain/geometry';
import { downloadBlob } from '../../infrastructure/download';
import { getAsset } from '../../infrastructure/local-storage';
import { ImageAssetView } from './ImageAssetView';

function formatBytes(size = 0) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function ObjectContent({ object, displayScale }: { object: DocumentObject; displayScale: number }) {
  if (object.type === 'image') return <ImageAssetView object={object} displayScale={displayScale} />;
  if (object.type === 'attachment') {
    const download = async () => {
      if (!object.assetId) return;
      const asset = await getAsset(object.assetId);
      if (!asset) return;
      downloadBlob(asset.blob, object.name || asset.name);
    };
    return <button className="attachment-card" type="button" onDoubleClick={() => void download()}><span><FileText size={24} /></span><span><strong>{object.name}</strong><small>{formatBytes(object.size)} · 두 번 눌러 저장</small></span><Download size={16} /></button>;
  }
  if (object.type === 'text-box') return <div className="free-text-box" style={{ background: object.style?.background }}>{object.text || '텍스트 상자'}</div>;
  return <div className="free-shape" style={{ background: object.style?.background, borderColor: object.style?.borderColor, borderWidth: object.style?.borderWidth, borderRadius: object.style?.borderRadius }} />;
}

export function ObjectLayer({
  objects,
  pageWidth,
  pageHeight,
  displayScale,
  selectedId,
  snapEnabled,
  guidesEnabled,
  onSelect,
  onGestureStart,
  onGestureEnd,
  onChange,
  onAction,
}: {
  objects: DocumentObject[];
  pageWidth: number;
  pageHeight: number;
  displayScale: number;
  selectedId: string | null;
  snapEnabled: boolean;
  guidesEnabled: boolean;
  onSelect: (id: string | null) => void;
  onGestureStart: () => void;
  onGestureEnd: () => void;
  onChange: (id: string, patch: Partial<DocumentObject>) => void;
  onAction: (action: 'front' | 'back' | 'lock' | 'duplicate' | 'delete' | 'center-x' | 'center-y') => void;
}) {
  const [guide, setGuide] = useState<{ x?: number; y?: number }>({});
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const byId = useMemo(() => new Map(objects.map((object) => [object.id, object])), [objects]);

  const beginMove = (event: React.PointerEvent, id: string) => {
    const object = byId.get(id);
    if (!object || object.locked || event.button !== 0) return;
    event.stopPropagation();
    setContextMenu(null);
    onSelect(id);
    onGestureStart();
    const element = event.currentTarget as HTMLElement;
    element.setPointerCapture(event.pointerId);
    const layerRect = element.closest('.object-layer')?.getBoundingClientRect();
    const scaleX = layerRect?.width ? layerRect.width / pageWidth : 1;
    const scaleY = layerRect?.height ? layerRect.height / pageHeight : scaleX;
    const start = { clientX: event.clientX, clientY: event.clientY, x: object.x, y: object.y };
    const others = objects.filter((item) => item.id !== id);
    const xCandidates = [0, pageWidth / 2 - object.width / 2, pageWidth - object.width, ...others.flatMap((item) => [item.x, item.x + item.width, item.x + item.width / 2 - object.width / 2])];
    const yCandidates = [0, pageHeight / 2 - object.height / 2, pageHeight - object.height, ...others.flatMap((item) => [item.y, item.y + item.height, item.y + item.height / 2 - object.height / 2])];
    const move = (pointer: PointerEvent) => {
      let x = clamp(start.x + (pointer.clientX - start.clientX) / scaleX, 0, pageWidth - object.width);
      let y = clamp(start.y + (pointer.clientY - start.clientY) / scaleY, 0, pageHeight - object.height);
      const nextGuide: { x?: number; y?: number } = {};
      if (snapEnabled && !pointer.altKey) {
        const snappedX = snapCoordinate(x, xCandidates);
        const snappedY = snapCoordinate(y, yCandidates);
        x = snappedX.value; y = snappedY.value;
        if (snappedX.snapped) nextGuide.x = x + object.width / 2;
        if (snappedY.snapped) nextGuide.y = y + object.height / 2;
      }
      if (guidesEnabled) setGuide(nextGuide);
      onChange(id, { x, y });
    };
    const end = () => {
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', end);
      element.removeEventListener('pointercancel', end);
      setGuide({});
      onGestureEnd();
    };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', end);
    element.addEventListener('pointercancel', end);
  };

  const beginResize = (event: React.PointerEvent, id: string) => {
    const object = byId.get(id);
    if (!object || object.locked) return;
    event.stopPropagation();
    onGestureStart();
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    const layerRect = handle.closest('.object-layer')?.getBoundingClientRect();
    const scaleX = layerRect?.width ? layerRect.width / pageWidth : 1;
    const scaleY = layerRect?.height ? layerRect.height / pageHeight : scaleX;
    const start = { clientX: event.clientX, clientY: event.clientY, width: object.width, height: object.height };
    const aspect = object.width / object.height;
    const move = (pointer: PointerEvent) => {
      let width = clamp(start.width + (pointer.clientX - start.clientX) / scaleX, 44, pageWidth - object.x);
      let height = clamp(start.height + (pointer.clientY - start.clientY) / scaleY, 36, pageHeight - object.y);
      if (!pointer.shiftKey && object.type === 'image') {
        width = Math.min(width, (pageHeight - object.y) * aspect);
        height = width / aspect;
      }
      onChange(id, { width, height });
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      onGestureEnd();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };

  const beginRotate = (event: React.PointerEvent, id: string) => {
    const object = byId.get(id);
    if (!object || object.locked) return;
    event.stopPropagation();
    onGestureStart();
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    const layerRect = handle.closest('.object-layer')?.getBoundingClientRect();
    const scaleX = layerRect?.width ? layerRect.width / pageWidth : 1;
    const scaleY = layerRect?.height ? layerRect.height / pageHeight : scaleX;
    const centerX = (layerRect?.left ?? 0) + (object.x + object.width / 2) * scaleX;
    const centerY = (layerRect?.top ?? 0) + (object.y + object.height / 2) * scaleY;
    const move = (pointer: PointerEvent) => {
      if (!layerRect) return;
      const angle = Math.atan2(pointer.clientY - centerY, pointer.clientX - centerX) * 180 / Math.PI + 90;
      onChange(id, { rotation: pointer.shiftKey ? Math.round(angle / 15) * 15 : Math.round(angle) });
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      onGestureEnd();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };

  return (
    <div className="object-layer" style={{ '--inverse-page-scale': String(1 / displayScale) } as React.CSSProperties} onPointerDown={(event) => { if (event.target === event.currentTarget) { onSelect(null); setContextMenu(null); } }}>
      {guide.x !== undefined && <span className="smart-guide vertical" style={{ left: guide.x }} />}
      {guide.y !== undefined && <span className="smart-guide horizontal" style={{ top: guide.y }} />}
      {objects.slice().sort((a, b) => a.zIndex - b.zIndex).map((object) => {
        const selected = object.id === selectedId;
        return (
          <div
            className={`document-object ${selected ? 'selected' : ''} ${object.locked ? 'locked' : ''}`}
            key={object.id}
            data-object-id={object.id}
            data-pdf-native={object.type === 'image' && ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(object.mediaType || '') ? 'true' : undefined}
            style={{ left: object.x, top: object.y, width: object.width, height: object.height, transform: `rotate(${object.rotation}deg)`, zIndex: object.zIndex, opacity: object.opacity, borderRadius: object.style?.borderRadius, boxShadow: object.style?.shadow ? '0 10px 26px rgba(23,45,38,.18)' : undefined }}
            onPointerDown={(event) => beginMove(event, object.id)}
            onContextMenu={(event) => {
              event.preventDefault(); event.stopPropagation(); onSelect(object.id);
              const layer = event.currentTarget.closest('.object-layer');
              const rect = layer?.getBoundingClientRect();
              if (!rect) return;
              setContextMenu({ id: object.id, x: (event.clientX - rect.left) * pageWidth / rect.width, y: (event.clientY - rect.top) * pageHeight / rect.height });
            }}
          >
            <ObjectContent object={object} displayScale={displayScale} />
            {selected && !object.locked && <>
              <button className="object-handle rotate" type="button" aria-label="개체 회전" onPointerDown={(event) => beginRotate(event, object.id)}><RotateCw size={12} /></button>
              <button className="object-handle resize" type="button" aria-label="개체 크기 변경" onPointerDown={(event) => beginResize(event, object.id)}><Grip size={12} /></button>
            </>}
          </div>
        );
      })}
      {contextMenu && <div className="object-context-menu" role="menu" style={{ left: Math.min(contextMenu.x, pageWidth - 168), top: Math.min(contextMenu.y, pageHeight - 126) }}>
        <button type="button" role="menuitem" onClick={() => { onAction('duplicate'); setContextMenu(null); }}><Copy size={14} /> 복제</button>
        <button type="button" role="menuitem" onClick={() => { onAction('front'); setContextMenu(null); }}><Layers size={14} /> 맨 앞으로</button>
        <button type="button" role="menuitem" onClick={() => { onAction('back'); setContextMenu(null); }}><Layers size={14} /> 맨 뒤로</button>
        <button type="button" role="menuitem" onClick={() => { onAction('lock'); setContextMenu(null); }}>{byId.get(contextMenu.id)?.locked ? <LockOpen size={14} /> : <Lock size={14} />}{byId.get(contextMenu.id)?.locked ? '잠금 해제' : '잠금'}</button>
        <button className="danger" type="button" role="menuitem" onClick={() => { onAction('delete'); setContextMenu(null); }}><Trash2 size={14} /> 삭제</button>
      </div>}
    </div>
  );
}
