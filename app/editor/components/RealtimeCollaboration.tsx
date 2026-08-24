'use client';

import type { Editor } from '@tiptap/react';
import { CloudOff, Radio, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { DocumentPage, EditorDocument } from '../../domain/document';
import { CLOUD_CONNECTED_EVENT, cloudDocumentCodeKey, collaborationWebSocketUrl } from '../../infrastructure/collaboration-service';

type Participant = { clientId: string; name: string; pageId?: string };
type Lock = { clientId: string; name: string; pageId: string };
type RemoteSelection = { clientId: string; name: string; pageId: string; from: number; to: number };

function initialCode(documentId: string) { try { return new URLSearchParams(location.search).get('share') || localStorage.getItem(cloudDocumentCodeKey(documentId)) || ''; } catch { return ''; } }
function displayName() { try { const saved = localStorage.getItem('our-ai-hangeul:collaborator-name'); if (saved) return saved; const value = `편집자 ${crypto.randomUUID().slice(0, 4).toUpperCase()}`; localStorage.setItem('our-ai-hangeul:collaborator-name', value); return value; } catch { return '공동 편집자'; } }

export function RealtimeCollaboration({ editor, document, currentPage, onRemotePage }: { editor: Editor | null; document: EditorDocument; currentPage: number; onRemotePage: (pageId: string, page: DocumentPage) => void }) {
  const [code, setCode] = useState(() => initialCode(document.id)); const [status, setStatus] = useState<'off' | 'connecting' | 'live' | 'error'>(code ? 'connecting' : 'off');
  const [participants, setParticipants] = useState<Participant[]>([]); const [locks, setLocks] = useState<Lock[]>([]); const [selections, setSelections] = useState<RemoteSelection[]>([]); const [message, setMessage] = useState('');
  const socketRef = useRef<WebSocket | undefined>(undefined); const [clientId] = useState(() => crypto.randomUUID()); const [name] = useState(displayName); const page = document.pages[currentPage] ?? document.pages[0]; const pageId = page?.id;
  const pageRef = useRef(page); const onRemotePageRef = useRef(onRemotePage);
  const ownsPage = locks.some((lock) => lock.pageId === page?.id && lock.clientId === clientId);
  const otherHolder = locks.find((lock) => lock.pageId === page?.id && lock.clientId !== clientId);

  useEffect(() => {
    const connected = (event: Event) => { const value = (event as CustomEvent<{ code?: string }>).detail?.code?.trim(); if (value) { setCode(value); setStatus('connecting'); } };
    window.addEventListener(CLOUD_CONNECTED_EVENT, connected); return () => window.removeEventListener(CLOUD_CONNECTED_EVENT, connected);
  }, []);

  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => { onRemotePageRef.current = onRemotePage; }, [onRemotePage]);

  useEffect(() => {
    if (!code || code.length < 32) return;
    let active = true; let socket: WebSocket | undefined;
    void collaborationWebSocketUrl(code, clientId, name).then((url) => {
      if (!active) return; socket = new WebSocket(url); socketRef.current = socket;
      socket.onopen = () => { if (!active) return; setStatus('live'); if (pageRef.current) socket?.send(JSON.stringify({ type: 'claim', pageId: pageRef.current.id })); };
      socket.onmessage = (event) => {
        let data: Record<string, unknown>; try { data = JSON.parse(String(event.data)) as Record<string, unknown>; } catch { return; }
        if (data.type === 'ready' || data.type === 'presence') { setParticipants((data.participants as Participant[]) || []); setLocks((data.locks as Lock[]) || []); return; }
        if (data.type === 'lock_granted') { setLocks((value) => [...value.filter((lock) => lock.pageId !== data.pageId), { pageId: String(data.pageId), clientId, name }]); const saved = data.saved as { content?: DocumentPage } | undefined; const savedPage = saved?.content; if (savedPage && savedPage.id === String(data.pageId)) onRemotePageRef.current(String(data.pageId), savedPage); return; }
        if (data.type === 'lock_denied') { const holder = data.holder as Participant; setLocks((value) => [...value.filter((lock) => lock.pageId !== data.pageId), { pageId: String(data.pageId), clientId: holder.clientId, name: holder.name }]); setMessage(`${holder.name}님이 이 페이지를 편집 중입니다.`); return; }
        if (data.type === 'selection') { const next = data as unknown as RemoteSelection; setSelections((value) => [...value.filter((item) => item.clientId !== next.clientId || item.pageId !== next.pageId), next]); return; }
        if (data.type === 'page_snapshot') { const content = data.content as DocumentPage; if (content?.id === data.pageId && data.clientId !== clientId) onRemotePageRef.current(String(data.pageId), content); }
      };
      socket.onerror = () => { if (active) { setStatus('error'); setMessage('실시간 연결에 실패했습니다. 수동 클라우드 저장은 계속 사용할 수 있습니다.'); } };
      socket.onclose = () => { if (active) { setStatus('error'); setParticipants([]); setLocks([]); } };
    }).catch((error) => { if (active) { setStatus('error'); setMessage(error instanceof Error ? error.message : '실시간 공동 편집을 연결하지 못했습니다.'); } });
    return () => { active = false; socket?.close(1000, 'page closed'); if (socketRef.current === socket) socketRef.current = undefined; };
  }, [clientId, code, name]);

  useEffect(() => {
    const socket = socketRef.current; if (!socket || socket.readyState !== WebSocket.OPEN || !pageId) return;
    socket.send(JSON.stringify({ type: 'claim', pageId }));
    return () => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'release', pageId })); };
  }, [pageId, status]);

  useEffect(() => { if (!editor) return; editor.setEditable(status !== 'live' || !otherHolder); return () => { editor.setEditable(true); }; }, [editor, otherHolder, status]);

  useEffect(() => {
    if (!editor || status !== 'live' || !ownsPage || !pageId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const selection = () => { clearTimeout(timer); timer = setTimeout(() => { const socket = socketRef.current; if (socket?.readyState !== WebSocket.OPEN) return; const { from, to } = editor.state.selection; socket.send(JSON.stringify({ type: 'selection', pageId, from, to })); }, 160); };
    editor.on('selectionUpdate', selection); return () => { clearTimeout(timer); editor.off('selectionUpdate', selection); };
  }, [editor, ownsPage, pageId, status]);

  useEffect(() => {
    if (status !== 'live' || !ownsPage || !page) return; const socket = socketRef.current;
    const timer = setTimeout(() => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'page_snapshot', pageId: page.id, content: page })); }, 420);
    return () => clearTimeout(timer);
  }, [ownsPage, page, status]);

  const remote = selections.filter((selection) => selection.pageId === page?.id && selection.clientId !== clientId).slice(-4);
  const overlays = remote.flatMap((selection) => {
    if (!editor) return []; try { const start = editor.view.coordsAtPos(Math.min(selection.from, editor.state.doc.content.size)); const end = editor.view.coordsAtPos(Math.min(selection.to, editor.state.doc.content.size)); return [{ ...selection, left: Math.min(start.left, end.left), top: Math.min(start.top, end.top), width: Math.max(3, Math.abs(end.left - start.left)), height: Math.max(start.bottom - start.top, end.bottom - end.top) }]; } catch { return []; }
  });
  if (!code) return null;
  return <>
    <aside className={`collaboration-dock ${status}`} role="status" title={message || '실시간 공동 편집 상태'}>
      {status === 'live' ? <Radio size={14} /> : <CloudOff size={14} />}<strong>{status === 'live' ? '실시간' : status === 'connecting' ? '연결 중' : '오프라인'}</strong>
      {status === 'live' && <span><Users size={13} /> {participants.length}</span>}{otherHolder && <em>{otherHolder.name} 편집 중</em>}
    </aside>
    {overlays.map((selection) => <div className="remote-selection" key={`${selection.clientId}-${selection.pageId}`} style={{ left: selection.left, top: selection.top, width: selection.width, height: selection.height }}><span>{selection.name}</span></div>)}
  </>;
}
