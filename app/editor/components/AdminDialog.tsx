'use client';

import { Bot, CheckCircle2, KeyRound, Loader2, LockKeyhole, Save, Server, Settings, ShieldCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DEFAULT_FONT_FAMILY, ENGLISH_FONTS, KOREAN_FONTS } from '../font-catalog';

interface ModelInfo {
  id: string;
  label: string;
  tier: string;
  enabled: boolean;
  inputPrice?: number;
  outputPrice?: number;
}

interface AdminSettings {
  model: string;
  reasoning: string;
  maxOutputTokens: number;
  hasApiKey: boolean;
  autoRouting: boolean;
  defaultFont: string;
  autosaveDelayMs: number;
}

const initialSettings: AdminSettings = { model: 'gpt-5.6-terra', reasoning: 'low', maxOutputTokens: 2400, hasApiKey: false, autoRouting: true, defaultFont: DEFAULT_FONT_FAMILY, autosaveDelayMs: 900 };

export function AdminDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [settings, setSettings] = useState<AdminSettings>(initialSettings);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadSettings = async () => {
    const response = await fetch('/api/admin/settings');
    if (response.status === 401) { setAuthenticated(false); return; }
    const data = await response.json() as { settings: AdminSettings; models: ModelInfo[] };
    if (response.ok) { setSettings(data.settings); setModels(data.models); setAuthenticated(true); }
  };

  useEffect(() => {
    if (!open) return;
    fetch('/api/admin/status').then((response) => response.json()).then((raw) => {
      const data = raw as { configured?: boolean; authenticated?: boolean };
      setConfigured(Boolean(data.configured));
      setAuthenticated(Boolean(data.authenticated));
      if (data.authenticated) void loadSettings();
    }).catch(() => { setConfigured(false); setError('관리자 서버 상태를 확인할 수 없습니다.'); });
  }, [open]);

  if (!open) return null;

  const login = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
      const data = await response.json() as { message?: string };
      if (!response.ok) throw new Error(data.message || '관리자 인증에 실패했습니다.');
      setPassword(''); setAuthenticated(true); await loadSettings();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '인증 오류가 발생했습니다.'); }
    finally { setBusy(false); }
  };

  const save = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...settings, apiKey: apiKey.trim() || undefined }) });
      const data = await response.json() as { message?: string; settings?: AdminSettings };
      if (!response.ok) throw new Error(data.message || '설정을 저장하지 못했습니다.');
      if (data.settings) setSettings(data.settings);
      setApiKey(''); setMessage('설정을 안전하게 저장했습니다.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '저장 오류가 발생했습니다.'); }
    finally { setBusy(false); }
  };

  const testConnection = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin/test-ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apiKey: apiKey.trim() || undefined, model: settings.model }) });
      const data = await response.json() as { message?: string };
      if (!response.ok) throw new Error(data.message || '연결 테스트에 실패했습니다.');
      setMessage(data.message || 'OpenAI 연결을 확인했습니다.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '연결 테스트 오류가 발생했습니다.'); }
    finally { setBusy(false); }
  };

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><section className="dialog admin-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-title">
    <header><div><span className="dialog-icon"><Settings size={20} /></span><span><h2 id="admin-title">관리자 설정</h2><p>서버 측 AI와 기본 편집 환경을 관리합니다.</p></span></div><button type="button" onClick={onClose} disabled={busy} aria-label="관리자 닫기"><X /></button></header>
    {!configured && <div className="admin-blocked"><Server size={28} /><h3>관리자 보안 설정이 필요합니다</h3><p><code>ADMIN_PASSWORD_HASH</code>와 <code>SESSION_SECRET</code>을 서버 비밀값으로 설정해야 합니다. 비밀번호는 브라우저 코드에 포함되지 않습니다.</p></div>}
    {configured && !authenticated && <form className="admin-login" onSubmit={login}><span className="admin-lock"><LockKeyhole size={28} /></span><h3>관리자 인증</h3><p>초기 임시 비밀번호 또는 변경한 관리자 비밀번호를 입력하세요.</p><label>관리자 비밀번호<input autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" minLength={4} maxLength={128} /></label><button className="primary-action" type="submit" disabled={busy || password.length < 4}>{busy ? <Loader2 className="spin" size={17} /> : <ShieldCheck size={17} />} 확인</button></form>}
    {configured && authenticated && <div className="admin-content">
      <section className="admin-summary"><div><span><Server size={18} /></span><strong>앱 서버</strong><small>정상</small></div><div><span><KeyRound size={18} /></span><strong>OpenAI</strong><small>{settings.hasApiKey ? '키 저장됨' : '연결 필요'}</small></div><div><span><Bot size={18} /></span><strong>기본 모델</strong><small>{models.find((model) => model.id === settings.model)?.label || settings.model}</small></div></section>
      <section className="settings-section"><div className="settings-heading"><div><h3>OpenAI 연결</h3><p>키는 서버에서 암호화하며 저장된 값은 다시 표시하지 않습니다.</p></div>{settings.hasApiKey && <span className="connected-badge"><CheckCircle2 size={14} /> 저장됨</span>}</div><label>새 API Key (변경할 때만 입력)<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={settings.hasApiKey ? '저장된 키 유지' : 'sk-…'} autoComplete="off" /></label><div className="form-row"><label>기본 모델<select value={settings.model} onChange={(event) => setSettings({ ...settings, model: event.target.value })}>{models.map((model) => <option key={model.id} value={model.id} disabled={!model.enabled}>{model.label} · {model.tier}</option>)}</select></label><label>추론 수준<select value={settings.reasoning} onChange={(event) => setSettings({ ...settings, reasoning: event.target.value })}><option value="none">없음</option><option value="low">낮음</option><option value="medium">보통</option><option value="high">높음</option></select></label></div><label className="checkbox-row"><input type="checkbox" checked={settings.autoRouting} onChange={(event) => setSettings({ ...settings, autoRouting: event.target.checked })} /><span><strong>AI 자동 모델 선택</strong><small>맞춤법·제목은 Luna, 일반 문서 작성은 Terra, 중요 전문 분석은 Sol을 사용합니다.</small></span></label><button className="secondary-action" type="button" disabled={busy || (!settings.hasApiKey && !apiKey.trim())} onClick={() => void testConnection()}>{busy ? <Loader2 className="spin" size={16} /> : <Bot size={16} />} 연결 테스트 (실제 API 호출)</button></section>
      <section className="settings-section"><div className="settings-heading"><div><h3>워드 기본 설정</h3><p>새 문서에 적용되는 기본값입니다.</p></div></div><div className="form-row"><label>기본 글꼴<select value={settings.defaultFont} onChange={(event) => setSettings({ ...settings, defaultFont: event.target.value })}><optgroup label="한글 글꼴">{KOREAN_FONTS.map((font) => <option key={font.family} value={font.family}>{font.label}</option>)}</optgroup><optgroup label="English fonts">{ENGLISH_FONTS.map((font) => <option key={font.family} value={font.family}>{font.label}</option>)}</optgroup></select></label><label>자동 저장<select value={settings.autosaveDelayMs} onChange={(event) => setSettings({ ...settings, autosaveDelayMs: Number(event.target.value) })}><option value={500}>0.5초</option><option value={900}>0.9초</option><option value={2000}>2초</option></select></label></div></section>
      <button className="primary-action save-settings" type="button" onClick={() => void save()} disabled={busy}>{busy ? <Loader2 className="spin" size={17} /> : <Save size={17} />} 설정 저장</button>
    </div>}
    {(error || message) && <p className={error ? 'dialog-message error' : 'dialog-message success'} role="status">{error || message}</p>}
  </section></div>;
}
