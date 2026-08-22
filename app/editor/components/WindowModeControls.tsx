'use client';

import { AppWindow, Maximize2, Minimize2 } from 'lucide-react';
import { useEffect, useState } from 'react';

export function WindowModeControls({ compact = false }: { compact?: boolean }) {
  const [fullscreen, setFullscreen] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const displayMode = matchMedia('(display-mode: standalone)');
    const update = () => { setFullscreen(Boolean(document.fullscreenElement)); setStandalone(displayMode.matches); };
    update(); document.addEventListener('fullscreenchange', update); displayMode.addEventListener('change', update);
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js');
    if (new URLSearchParams(location.search).get('window') === 'desktop') try { window.resizeTo(1920, 1080); } catch { /* browser controls window sizing */ }
    return () => { document.removeEventListener('fullscreenchange', update); displayMode.removeEventListener('change', update); };
  }, []);

  const openDesktopWindow = () => {
    const features = 'popup=yes,width=1920,height=1080,resizable=yes,scrollbars=yes,noopener=no';
    const target = new URL(location.href); target.searchParams.set('window', 'desktop');
    const child = window.open(target, 'our-ai-hangeul-desktop', features);
    if (!child) alert('팝업이 차단되었습니다. 주소창의 팝업 허용을 누른 뒤 다시 시도해 주세요.');
    else child.focus();
  };

  const toggleFullscreen = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { alert('브라우저가 전체화면 전환을 허용하지 않았습니다. F11 또는 설치형 앱을 이용해 주세요.'); }
  };

  return <div className={compact ? 'window-mode-controls compact' : 'window-mode-controls'} aria-label="창 표시 방식">
    <button type="button" onClick={openDesktopWindow} title="1920×1080 크기의 크기 조절 가능한 새 창"><AppWindow size={16} /><span>1920×1080 새 창</span></button>
    <button type="button" onClick={() => void toggleFullscreen()} aria-pressed={fullscreen} title="브라우저 표시줄 없이 전체화면으로 전환">
      {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}<span>{fullscreen ? '브라우저 화면' : standalone ? '독립 창 사용 중' : '전체화면'}</span>
    </button>
  </div>;
}
