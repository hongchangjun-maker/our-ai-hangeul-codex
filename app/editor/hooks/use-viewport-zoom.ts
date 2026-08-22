'use client';

import { useEffect, useState } from 'react';

function fitZoom(pageHeight: number) {
  if (typeof window === 'undefined') return 100;
  const availableHeight = Math.max(420, window.innerHeight - 28);
  return Math.min(100, Math.max(50, Math.floor((availableHeight / pageHeight) * 20) * 5));
}

export function useViewportZoom(pageHeight: number) {
  const [zoom, setZoom] = useState(() => fitZoom(1123));
  const [fitMode, setFitMode] = useState(true);

  useEffect(() => {
    if (!fitMode) return;
    const fit = () => setZoom(fitZoom(pageHeight));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [fitMode, pageHeight]);

  return {
    zoom,
    fitPage: () => { setFitMode(true); setZoom(fitZoom(pageHeight)); },
    setManualZoom: (value: number) => { setFitMode(false); setZoom(value); },
    stepZoom: (delta: number) => { setFitMode(false); setZoom((value) => Math.min(150, Math.max(50, value + delta))); },
  };
}
