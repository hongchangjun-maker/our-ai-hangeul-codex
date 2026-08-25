'use client';

import { Check, Star, X } from 'lucide-react';
import { useState } from 'react';
import { APP_FONTS, FONT_SUBSTITUTIONS, type AppFont } from '../font-catalog';
import { useDialogBehavior } from '../hooks/use-dialog-behavior';

export function FontLibraryDialog({ open, favoriteFonts, onClose, onToggleFavorite, onApply }: {
  open: boolean;
  favoriteFonts: string[];
  onClose: () => void;
  onToggleFavorite: (family: string) => void;
  onApply: (family: string) => void;
}) {
  const [script, setScript] = useState<'all' | AppFont['script']>('all');
  const [sample, setSample] = useState('가나다라마바사  The quick brown fox  123');
  const dialogRef = useDialogBehavior(open, onClose);
  if (!open) return null;
  const fonts = script === 'all' ? APP_FONTS : APP_FONTS.filter((font) => font.script === script);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} tabIndex={-1} className="dialog font-library-dialog" role="dialog" aria-modal="true" aria-labelledby="font-library-title">
      <header><div><span className="dialog-icon"><Star size={20} /></span><span><h2 id="font-library-title">글꼴 미리보기</h2><p>별표를 눌러 상단 바로 쓰기 줄에 고정하세요.</p></span></div><button type="button" onClick={onClose} aria-label="글꼴 창 닫기"><X /></button></header>
      <div className="font-library-controls">
        <div role="tablist" aria-label="글꼴 분류"><button className={script === 'all' ? 'selected' : ''} type="button" role="tab" aria-selected={script === 'all'} onClick={() => setScript('all')}>전체</button><button className={script === 'korean' ? 'selected' : ''} type="button" role="tab" aria-selected={script === 'korean'} onClick={() => setScript('korean')}>한글</button><button className={script === 'english' ? 'selected' : ''} type="button" role="tab" aria-selected={script === 'english'} onClick={() => setScript('english')}>English</button></div>
        <label>미리보기 문장<input value={sample} maxLength={120} onChange={(event) => setSample(event.target.value)} aria-label="글꼴 미리보기 문장" /></label>
      </div>
      <aside className="font-compatibility-note">
        <strong>원고 글꼴 호환</strong>
        <p>배포권이 확인된 오픈 글꼴만 앱에 내장합니다. 원래 이름은 DOCX 재저장용으로 보존하고 화면에서는 아래 글꼴로 표시합니다.</p>
        {FONT_SUBSTITUTIONS.filter((item) => item.reason === 'redistribution-unverified').map((item) => <small key={item.source}><b>{item.source}</b> → {item.fallback}</small>)}
        <a href="/fonts/FONT-LICENSES.md" target="_blank" rel="noreferrer">내장 글꼴 라이선스</a>
      </aside>
      <div className="font-library-grid">{fonts.map((font) => {
        const favorite = favoriteFonts.includes(font.family);
        return <article className="font-preview-card" key={font.family} style={{ fontFamily: font.family }}><div className="font-card-actions"><button className={favorite ? 'favorite active' : 'favorite'} type="button" onClick={() => onToggleFavorite(font.family)} aria-label={`${font.label} ${favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}`} aria-pressed={favorite}><Star size={16} fill={favorite ? 'currentColor' : 'none'} /></button><button className="apply-font" type="button" onClick={() => onApply(font.family)}><Check size={15} /> 적용</button></div><strong>{font.label}</strong><small>{font.script === 'korean' ? '한글 글꼴' : 'English font'} · {font.description}</small><p>{sample || '가나다 ABC 123'}</p></article>;
      })}</div>
    </section>
  </div>;
}
