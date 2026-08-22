'use client';

import { Cloud, Copy, History, RefreshCw, UploadCloud, X } from 'lucide-react';
import { useState } from 'react';
import type { EditorDocument } from '../../domain/document';
import { createCloudRoom, loadCloudRoom, loadCloudVersion, pushCloudRoom, type CloudSnapshot } from '../../infrastructure/cloud-sync';

const STORAGE_KEY = 'our-ai-hangeul:cloud-code';

export function CloudSyncDialog({ open, document, onChange, onClose }: { open: boolean; document: EditorDocument; onChange: (document: EditorDocument) => void; onClose: () => void }) {
  const [code, setCode] = useState(() => { try { return new URLSearchParams(location.search).get('share') || localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; } }); const [snapshot, setSnapshot] = useState<CloudSnapshot>(); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [failed, setFailed] = useState(false);
  const run = async (action: () => Promise<void>) => { setBusy(true); setMessage(''); setFailed(false); try { await action(); } catch (error) { const conflict = error as Error & { latest?: CloudSnapshot }; if (conflict.latest) setSnapshot(conflict.latest); setFailed(true); setMessage(conflict.message || '요청이 실패했습니다.'); } finally { setBusy(false); } };
  const remember = (value: string) => { setCode(value); try { localStorage.setItem(STORAGE_KEY, value); } catch { /* unavailable */ } };
  const refresh = async (apply = false) => { const next = await loadCloudRoom(code.trim()); setSnapshot(next); if (apply) onChange(next.document); setMessage(apply ? `클라우드 ${next.revision}판을 문서에 적용했습니다.` : `클라우드 ${next.revision}판을 확인했습니다.`); };
  if (!open) return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="dialog cloud-dialog" role="dialog" aria-modal="true" aria-labelledby="cloud-title">
    <header><div><span className="dialog-icon"><Cloud size={20} /></span><span><h2 id="cloud-title">클라우드 동기화·버전·공동 편집</h2><p>공유 코드를 가진 사람끼리 저장하고 충돌을 확인합니다.</p></span></div><button type="button" onClick={onClose} aria-label="닫기"><X /></button></header>
    <div className="dialog-form"><p className="notice warning">공유 코드는 편집 권한을 가진 비밀 링크입니다. 신뢰하는 사람에게만 전달하세요. 사진 원본은 브라우저 로컬 저장소에 남고 문서 구조와 글상자 정보가 동기화됩니다.</p>
      <button className="primary-action" type="button" disabled={busy} onClick={() => void run(async () => { const created = await createCloudRoom(document); remember(created.token); setSnapshot({ document, revision: created.revision, updatedAt: created.updatedAt, history: [{ revision: 1, createdAt: created.updatedAt }] }); setMessage('새 공동 편집 문서를 만들었습니다. 공유 코드를 복사하세요.'); })}><Cloud size={16} /> 새 공동 편집 문서 만들기</button>
      <label>공유 코드<input value={code} onChange={(event) => remember(event.target.value.trim())} placeholder="공유받은 코드를 붙여넣으세요" /></label>
      <div className="cloud-actions"><button className="secondary-action" type="button" disabled={!code || busy} onClick={() => void navigator.clipboard.writeText(`${location.origin}${location.pathname}?share=${encodeURIComponent(code)}`).then(() => setMessage('공동 편집 링크를 복사했습니다.'))}><Copy size={15} /> 링크 복사</button><button className="secondary-action" type="button" disabled={!code || busy} onClick={() => void run(() => refresh(false))}><RefreshCw size={15} /> 새 변경 확인</button><button className="secondary-action" type="button" disabled={!snapshot || busy} onClick={() => void run(() => refresh(true))}>클라우드판 적용</button><button className="primary-action" type="button" disabled={!code || busy} onClick={() => void run(async () => { const base = snapshot ?? await loadCloudRoom(code); const pushed = await pushCloudRoom(code, base.revision, document); await refresh(false); setMessage(`${pushed.revision}판으로 저장했습니다.`); })}><UploadCloud size={15} /> 내 변경 저장</button></div>
      {message && <p className={`dialog-message ${failed ? 'error' : 'success'}`}>{message}</p>}
      {snapshot && <div className="version-history"><h3><History size={16} /> 버전 이력</h3>{snapshot.history.map((version) => <div key={version.revision}><span><strong>{version.revision}판</strong><small>{new Date(version.createdAt).toLocaleString('ko-KR')}</small></span><button type="button" onClick={() => void run(async () => { const result = await loadCloudVersion(code, version.revision); onChange(result.document); setMessage(`${version.revision}판을 편집 화면에 복원했습니다. 클라우드에 확정하려면 ‘내 변경 저장’을 누르세요.`); })}>이 버전 열기</button></div>)}</div>}
    </div>
  </section></div>;
}
