'use client';

/* eslint-disable @next/next/no-img-element -- user-owned local Blob URLs cannot use the Next image optimizer */

import { Download, FileText, Grip, RotateCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { DocumentObject } from '../../domain/document';
import { clamp, snapCoordinate } from '../../domain/geometry';
import { getAsset } from '../../infrastructure/local-storage';

function useAssetUrl(assetId?: string) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    if (assetId) {
      getAsset(assetId).then((asset) => {
        if (!asset || !active) return;
        objectUrl = URL.createObjectURL(asset.blob);
        setUrl(objectUrl);
      });
    }
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [assetId]);
  return url;
}

function formatBytes(size = 0) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function ObjectContent({ object }: { object: DocumentObject }) {
  const url = useAssetUrl(object.assetId);
  if (object.type === 'image') return url ? <img src={url} alt={object.name || '삽입 이미지'} draggable={false} /> : <span className="asset-loading">이미지 준비 중…</span>;
  if (object.type === 'attachment') {
    const download = async () => {
      if (!object.assetId) return;
      const asset = await getAsset(object.assetId);
      if (!asset) return;
      const objectUrl = URL.createObjectURL(asset.blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = object.name || asset.name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    };
    return <button className="attachment-card" type="button" onDoubleClick={() => void download()}><span><FileText size={24} /></span><span><strong>{object.name}</strong><small>{formatBytes(object.size)} · 두 번 눌러 저장</small></span><Download size={16} /></button>;
  }
  if (object.type === 'text-box') return <div className="free-text-box">{object.text || '텍스트 상자'}</div>;
  return <div className="free-shape" />;
}

export function ObjectLayer({
  objects,
  pageWidth,
  pageHeight,
  selectedId,
  snapEnabled,
  guidesEnabled,
  onSelect,
  onGestureStart,
  onGestureEnd,
  onChange,
}: {
  objects: DocumentObject[];
  pageWidth: number;
  pageHeight: number;
  selectedId: string | null;
  snapEnabled: boolean;
  guidesEnabled: boolean;
  onSelect: (id: string | null) => void;
  onGestureStart: () => void;
  onGestureEnd: () => void;
  onChange: (id: string, patch: Partial<DocumentObject>) => void;
}) {
  const [guide, setGuide] = useState<{ x?: number; y?: number }>({});
  const byId = useMemo(() => new Map(objects.map((object) => [object.id, object])), [objects]);

  const beginMove = (event: React.PointerEvent, id: string) => {
    const object = byId.get(id);
    if (!object || object.locked || event.button !== 0) return;
    event.stopPropagation();
    onSelect(id);
    onGestureStart();
    const element = event.currentTarget as HTMLElement;
    element.setPointerCapture(event.pointerId);
    const start = { clientX: event.clientX, clientY: event.clientY, x: object.x, y: object.y };
    const others = objects.filter((item) => item.id !== id);
    const xCandidates = [0, pageWidth / 2 - object.width / 2, pageWidth - object.width, ...others.flatMap((item) => [item.x, item.x + item.width, item.x + item.width / 2 - object.width / 2])];
    const yCandidates = [0, pageHeight / 2 - object.height / 2, pageHeight - object.height, ...others.flatMap((item) => [item.y, item.y + item.height, item.y + item.height / 2 - object.height / 2])];
    const move = (pointer: PointerEvent) => {
      let x = clamp(start.x + pointer.clientX - start.clientX, 0, pageWidth - object.width);
      let y = clamp(start.y + pointer.clientY - start.clientY, 0, pageHeight - object.height);
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
    const start = { clientX: event.clientX, clientY: event.clientY, width: object.width, height: object.height };
    const aspect = object.width / object.height;
    const move = (pointer: PointerEvent) => {
      const width = clamp(start.width + pointer.clientX - start.clientX, 44, pageWidth - object.x);
      let height = clamp(start.height + pointer.clientY - start.clientY, 36, pageHeight - object.y);
      if (!pointer.shiftKey && object.type === 'image') height = width / aspect;
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
    const centerX = object.x + object.width / 2;
    const centerY = object.y + object.height / 2;
    const layerRect = handle.closest('.object-layer')?.getBoundingClientRect();
    const move = (pointer: PointerEvent) => {
      if (!layerRect) return;
      const angle = Math.atan2(pointer.clientY - layerRect.top - centerY, pointer.clientX - layerRect.left - centerX) * 180 / Math.PI + 90;
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
    <div className="object-layer" onPointerDown={(event) => { if (event.target === event.currentTarget) onSelect(null); }}>
      {guide.x !== undefined && <span className="smart-guide vertical" style={{ left: guide.x }} />}
      {guide.y !== undefined && <span className="smart-guide horizontal" style={{ top: guide.y }} />}
      {objects.slice().sort((a, b) => a.zIndex - b.zIndex).map((object) => {
        const selected = object.id === selectedId;
        return (
          <div
            className={`document-object ${selected ? 'selected' : ''} ${object.locked ? 'locked' : ''}`}
            key={object.id}
            data-object-id={object.id}
            style={{ left: object.x, top: object.y, width: object.width, height: object.height, transform: `rotate(${object.rotation}deg)`, zIndex: object.zIndex, opacity: object.opacity, borderRadius: object.style?.borderRadius, boxShadow: object.style?.shadow ? '0 10px 26px rgba(23,45,38,.18)' : undefined }}
            onPointerDown={(event) => beginMove(event, object.id)}
          >
            <ObjectContent object={object} />
            {selected && !object.locked && <>
              <button className="object-handle rotate" type="button" aria-label="개체 회전" onPointerDown={(event) => beginRotate(event, object.id)}><RotateCw size={12} /></button>
              <button className="object-handle resize" type="button" aria-label="개체 크기 변경" onPointerDown={(event) => beginResize(event, object.id)}><Grip size={12} /></button>
            </>}
          </div>
        );
      })}
    </div>
  );
}
