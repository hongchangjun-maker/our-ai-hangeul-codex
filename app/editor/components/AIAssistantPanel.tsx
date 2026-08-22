'use client';

import { Bot, Check, Copy, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';

type AiAction = 'polish' | 'shorten' | 'expand' | 'proofread' | 'official' | 'report' | 'summarize' | 'continue' | 'ask';

const actions: { id: AiAction; label: string }[] = [
  { id: 'polish', label: '자연스럽게' }, { id: 'proofread', label: '맞춤법 확인' }, { id: 'shorten', label: '더 짧게' },
  { id: 'expand', label: '더 자세하게' }, { id: 'official', label: '공문체' }, { id: 'report', label: '보고서체' },
  { id: 'summarize', label: '전체 요약' }, { id: 'continue', label: '이어쓰기' },
];

export function AIAssistantPanel({ selectedText, documentText, onClose, onApply }: { selectedText: string; documentText: string; onClose: () => void; onApply: (text: string, mode: 'insert' | 'append' | 'replace' | 'new-page') => void }) {
  const [available, setAvailable] = useState(false);
  const [statusLabel, setStatusLabel] = useState('연결 상태 확인 중…');
  const [instruction, setInstruction] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [lastAction, setLastAction] = useState<AiAction>('ask');

  useEffect(() => {
    let active = true;
    fetch('/api/ai/status').then((response) => response.json()).then((raw) => {
      const data = raw as { connected?: boolean; label?: string };
      if (!active) return;
      setAvailable(Boolean(data.connected));
      setStatusLabel(data.connected ? `연결됨 · ${data.label || 'AI'}` : 'OPENAI_NOT_CONNECTED');
    }).catch(() => { if (active) setStatusLabel('연결 상태를 확인할 수 없음'); });
    return () => { active = false; };
  }, []);

  const run = async (action: AiAction, customInstruction = instruction) => {
    if (!available || loading) return;
    const source = selectedText.trim() || documentText.trim();
    if (!source) { setError('먼저 문서 내용을 입력해 주세요.'); return; }
    setLoading(true); setError(''); setLastAction(action);
    try {
      const response = await fetch('/api/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, instruction: customInstruction, content: source.slice(0, 100_000), scope: selectedText.trim() ? 'selection' : 'document' }) });
      const data = await response.json() as { output?: string; error?: string; message?: string };
      if (!response.ok || !data.output) throw new Error(data.message || data.error || 'AI 결과를 받지 못했습니다.');
      setResult(data.output);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'AI 요청 중 오류가 발생했습니다.');
    } finally { setLoading(false); }
  };

  const copy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };

  return <aside className="ai-panel" aria-label="AI 문서도우미">
    <div className="ai-heading"><span><Bot size={20} /> AI 문서도우미</span><button type="button" onClick={onClose} aria-label="AI 패널 닫기"><X size={18} /></button></div>
    <div className="ai-connection" data-connected={available}><span />{statusLabel}</div>
    <div className="ai-intro"><Sparkles size={20} /><strong>{selectedText ? '선택한 문장을 어떻게 바꿀까요?' : '무엇을 도와드릴까요?'}</strong><p>원문은 바로 바꾸지 않고, 먼저 결과를 보여드릴게요.</p></div>
    <div className="prompt-chips">{actions.map((action) => <button type="button" key={action.id} disabled={!available || loading} onClick={() => void run(action.id)}>{action.label}</button>)}</div>
    <label className="ai-input"><span className="sr-only">AI에게 요청하기</span><textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="예: 이 내용을 2페이지 보고서 구조로 정리해줘" maxLength={2000} /><button type="button" disabled={!available || loading || !instruction.trim()} onClick={() => void run('ask')} aria-label="AI 요청 보내기">{loading ? <Loader2 className="spin" size={16} /> : '↑'}</button></label>
    {!available && <p className="ai-notice">관리자에서 서버 측 OpenAI 연결을 설정해야 사용할 수 있습니다. 가짜 결과는 표시하지 않습니다.</p>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    {result && <section className="ai-result" aria-live="polite"><div className="ai-result-title"><strong>AI 제안</strong><span><button type="button" onClick={() => void run(lastAction)} aria-label="다시 생성"><RefreshCw size={14} /></button><button type="button" onClick={() => void copy()} aria-label="복사">{copied ? <Check size={14} /> : <Copy size={14} />}</button></span></div><div className="ai-result-text">{result}</div><div className="ai-apply-actions"><button type="button" onClick={() => onApply(result, selectedText ? 'replace' : 'insert')}>{selectedText ? '선택 부분 교체' : '문서에 삽입'}</button><button type="button" onClick={() => onApply(result, 'append')}>아래에 추가</button><button type="button" onClick={() => onApply(result, 'new-page')}>새 페이지</button></div></section>}
  </aside>;
}
