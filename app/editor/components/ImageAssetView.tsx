'use client';

/* eslint-disable @next/next/no-img-element -- the source is a local user-owned Blob URL */

import { useEffect, useRef, useState } from 'react';
import type { DocumentObject } from '../../domain/document';
import { imageRenderStyle, selectImageVariant, type ImageVariant } from '../../domain/image-quality';
import { IMAGE_VARIANT_EVENT } from '../../infrastructure/image-proxy';
import { getAssetVariant } from '../../infrastructure/local-storage';

function useNearViewport(lazy: boolean) {
  const ref = useRef<HTMLSpanElement>(null);
  const [near, setNear] = useState(!lazy);
  useEffect(() => {
    if (!lazy) return;
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') { const timer = setTimeout(() => setNear(true), 0); return () => clearTimeout(timer); }
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setNear(true); observer.disconnect(); } }, { rootMargin: '1400px 0px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [lazy]);
  return { ref, near };
}

function useOriginalOutput() {
  const [original, setOriginal] = useState(false);
  useEffect(() => {
    const before = () => setOriginal(true);
    const after = () => setOriginal(false);
    const mode = (event: Event) => setOriginal(Boolean((event as CustomEvent<{ original?: boolean }>).detail?.original));
    addEventListener('beforeprint', before); addEventListener('afterprint', after); addEventListener('our-ai-hangeul:image-output-mode', mode);
    return () => { removeEventListener('beforeprint', before); removeEventListener('afterprint', after); removeEventListener('our-ai-hangeul:image-output-mode', mode); };
  }, []);
  return original;
}

function useImageUrl(assetId: string | undefined, variant: ImageVariant, enabled: boolean) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ url?: string; error?: string }>({});
  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<{ assetId?: string }>).detail;
      if (detail?.assetId === assetId) setRevision((value) => value + 1);
    };
    addEventListener(IMAGE_VARIANT_EVENT, update);
    return () => removeEventListener(IMAGE_VARIANT_EVENT, update);
  }, [assetId]);
  useEffect(() => {
    let active = true; let objectUrl: string | undefined;
    if (!assetId || !enabled) return;
    getAssetVariant(assetId, variant).then((asset) => {
      if (!active) return;
      if (!asset) { setState({ error: '이미지 자산을 찾지 못했습니다.' }); return; }
      objectUrl = URL.createObjectURL(asset.blob);
      setState({ url: objectUrl });
    }).catch((reason) => active && setState({ error: reason instanceof Error ? reason.message : '이미지를 불러오지 못했습니다.' }));
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [assetId, enabled, revision, variant]);
  return state;
}

export function ImageAssetView({ object, displayScale = 1, lazy = false }: { object: DocumentObject; displayScale?: number; lazy?: boolean }) {
  const { ref, near } = useNearViewport(lazy);
  const originalOutput = useOriginalOutput();
  const variant = originalOutput ? 'original' : selectImageVariant(object.width * displayScale, object.height * displayScale, globalThis.devicePixelRatio || 1);
  const state = useImageUrl(object.assetId, variant, near);
  return <span ref={ref} className="image-crop-frame" data-image-variant={variant}>
    {state.url ? <img src={state.url} alt={object.name || '삽입 이미지'} draggable={false} style={imageRenderStyle(object)} /> : <span className={state.error ? 'asset-loading error' : 'asset-loading'}>{state.error || (near ? '미리보기 준비 중…' : '스크롤하면 표시됩니다')}</span>}
  </span>;
}
