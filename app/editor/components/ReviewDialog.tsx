'use client';

import { Search, SpellCheck2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { EditorDocument } from '../../domain/document';
import { applyKoreanCorrections, findDocumentText, inspectKorean, replaceDocumentText } from '../../domain/text-tools';
import { useDialogBehavior } from '../hooks/use-dialog-behavior';

export function ReviewDialog({ open, document, onChange, onClose }: { open: boolean; document: EditorDocument; onChange: (document: EditorDocument) => void; onClose: () => void }) {
  const [query, setQuery] = useState(''); const [replacement, setReplacement] = useState(''); const [caseSensitive, setCaseSensitive] = useState(false); const [tab, setTab] = useState<'find' | 'spell'>('find');
  const matches = useMemo(() => findDocumentText(document, query, caseSensitive), [caseSensitive, document, query]);
  const issues = useMemo(() => inspectKorean(document), [document]);
  const dialogRef = useDialogBehavior(open, onClose);
  if (!open) return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={dialogRef} tabIndex={-1} className="dialog review-dialog" role="dialog" aria-modal="true" aria-labelledby="review-title">
    <header><div><span className="dialog-icon">{tab === 'find' ? <Search size={20} /> : <SpellCheck2 size={20} />}</span><span><h2 id="review-title">찾기·바꾸기와 한국어 검사</h2><p>본문, 머리말·꼬리말과 글상자를 문서 전체에서 검사합니다.</p></span></div><button type="button" onClick={onClose} aria-label="닫기"><X /></button></header>
    <div className="dialog-tabs" role="tablist" aria-label="검토 도구"><button className={tab === 'find' ? 'selected' : ''} type="button" role="tab" aria-selected={tab === 'find'} onClick={() => setTab('find')}>찾기·바꾸기</button><button className={tab === 'spell' ? 'selected' : ''} type="button" role="tab" aria-selected={tab === 'spell'} onClick={() => setTab('spell')}>한국어 기본 교정</button></div>
    {tab === 'find' ? <div className="dialog-form"><label>찾을 말<input value={query} onChange={(event) => setQuery(event.target.value)} autoFocus /></label><label>바꿀 말<input value={replacement} onChange={(event) => setReplacement(event.target.value)} /></label><label className="checkbox-row"><input type="checkbox" checked={caseSensitive} onChange={(event) => setCaseSensitive(event.target.checked)} /><span><strong>영문 대소문자 구분</strong></span></label><button className="primary-action" type="button" disabled={!query || !matches.length} onClick={() => onChange(replaceDocumentText(document, query, replacement, caseSensitive))}>전체 {matches.reduce((sum, match) => sum + match.count, 0)}개 바꾸기</button><div className="result-list">{matches.length ? matches.map((match) => <p key={match.pageIndex}><strong>{match.pageIndex + 1}쪽 · {match.count}개</strong><span>{match.excerpt}</span></p>) : <p>일치하는 내용이 없습니다.</p>}</div></div> : <div className="dialog-form"><p className="notice">브라우저 맞춤법 표시와 함께 쓰는 오프라인 기본 교정입니다. 전문 사전·문맥 판단이 필요한 표현은 사용자가 최종 확인해야 합니다.</p><button className="primary-action" type="button" disabled={!issues.length} onClick={() => onChange(applyKoreanCorrections(document))}>검출된 {issues.reduce((sum, issue) => sum + issue.count, 0)}곳 모두 교정</button><div className="result-list">{issues.length ? issues.map((issue, index) => <p key={`${issue.pageIndex}-${index}`}><strong>{issue.pageIndex + 1}쪽 · {issue.count}곳</strong><span>{issue.reason} → {issue.replacement}</span></p>) : <p>기본 규칙에서 발견된 항목이 없습니다.</p>}</div></div>}
  </section></div>;
}
