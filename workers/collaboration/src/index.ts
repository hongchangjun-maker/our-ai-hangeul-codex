export interface Env {
  ASSETS: R2Bucket;
  COLLAB_ROOM: DurableObjectNamespace;
  APP_ORIGIN: string;
  SITE_SYNC_ORIGIN: string;
}

type Session = { clientId: string; name: string; pageId?: string };
type Incoming =
  | { type: 'claim'; pageId: string }
  | { type: 'release'; pageId: string }
  | { type: 'selection'; pageId: string; from: number; to: number }
  | { type: 'page_snapshot'; pageId: string; content: unknown };

const encoder = new TextEncoder();
const ASSET_ID = /^[A-Za-z0-9_-]{8,128}$/;
const TOKEN = /^[A-Za-z0-9_-]{32,128}$/;
const MAX_ASSET_BYTES = 50 * 1024 * 1024;

function base64Url(bytes: Uint8Array) {
  let value = ''; for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function tokenHash(token: string) {
  if (!TOKEN.test(token)) return null;
  return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(token))));
}

function allowedOrigin(request: Request, env: Env) {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  if (origin === env.APP_ORIGIN || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return false;
}

function headers(origin: string | null) {
  const value = new Headers({ 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
  if (origin) { value.set('access-control-allow-origin', origin); value.set('vary', 'Origin'); }
  return value;
}

function json(data: unknown, status: number, origin: string | null) {
  const result = headers(origin); result.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { status, headers: result });
}

async function authorize(request: Request, env: Env) {
  const code = new URL(request.url).searchParams.get('code')?.trim() ?? '';
  const hash = await tokenHash(code); if (!hash) return null;
  const response = await fetch(`${env.SITE_SYNC_ORIGIN}/api/sync?code=${encodeURIComponent(code)}`, { headers: { accept: 'application/json' } });
  if (!response.ok) return null;
  const snapshot = await response.json() as { document?: { id?: string } };
  return snapshot.document?.id ? { documentId: snapshot.document.id, hash } : null;
}

async function assetRequest(request: Request, env: Env, origin: string | null, assetId: string) {
  if (!ASSET_ID.test(assetId)) return json({ message: '자산 식별자가 올바르지 않습니다.' }, 400, origin);
  const auth = await authorize(request, env); if (!auth) return json({ message: '공유 코드를 확인해 주세요.' }, 403, origin);
  const key = `${auth.hash}/${assetId}`;
  if (request.method === 'DELETE') { await env.ASSETS.delete(key); return new Response(null, { status: 204, headers: headers(origin) }); }
  if (request.method === 'PUT') {
    const length = Number(request.headers.get('content-length') || 0);
    if (!Number.isFinite(length) || length <= 0 || length > MAX_ASSET_BYTES) return json({ message: '첨부 파일은 50MB 이하만 동기화할 수 있습니다.' }, 413, origin);
    const filename = decodeURIComponent(request.headers.get('x-file-name') || 'attachment').slice(0, 240);
    const mediaType = (request.headers.get('content-type') || 'application/octet-stream').slice(0, 160);
    await env.ASSETS.put(key, request.body, { httpMetadata: { contentType: mediaType }, customMetadata: { filename } });
    return json({ assetId, size: length }, 201, origin);
  }
  const object = request.method === 'HEAD' ? await env.ASSETS.head(key) : await env.ASSETS.get(key);
  if (!object) return json({ message: '첨부 파일을 찾지 못했습니다.' }, 404, origin);
  const resultHeaders = headers(origin); object.writeHttpMetadata(resultHeaders); resultHeaders.set('etag', object.httpEtag); resultHeaders.set('content-length', String(object.size)); resultHeaders.set('x-file-name', encodeURIComponent(object.customMetadata?.filename || 'attachment'));
  return new Response(request.method === 'HEAD' ? null : (object as R2ObjectBody).body, { status: 200, headers: resultHeaders });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url); const origin = allowedOrigin(request, env);
    if (origin === false) return json({ message: '허용되지 않은 출처입니다.' }, 403, null);
    if (request.method === 'OPTIONS') { const result = headers(origin); result.set('access-control-allow-methods', 'GET, HEAD, PUT, DELETE, OPTIONS'); result.set('access-control-allow-headers', 'content-type, x-file-name'); return new Response(null, { status: 204, headers: result }); }
    if (url.pathname === '/health') return json({ ok: true, storage: 'r2', realtime: 'durable-object-websocket' }, 200, origin);
    if (url.pathname.startsWith('/assets/') && ['GET', 'HEAD', 'PUT', 'DELETE'].includes(request.method)) return assetRequest(request, env, origin, decodeURIComponent(url.pathname.slice(8)));
    if (url.pathname === '/ws' && request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      const auth = await authorize(request, env); if (!auth) return json({ message: '공유 코드를 확인해 주세요.' }, 403, origin);
      const clientId = url.searchParams.get('clientId')?.slice(0, 80) || crypto.randomUUID(); const name = url.searchParams.get('name')?.slice(0, 40) || '공동 편집자';
      const id = env.COLLAB_ROOM.idFromName(auth.documentId); const stub = env.COLLAB_ROOM.get(id);
      const forwarded = new Request(request); forwarded.headers.set('x-client-id', clientId); forwarded.headers.set('x-client-name', encodeURIComponent(name));
      const response = await stub.fetch(forwarded); if (response.status !== 101) console.error('Durable Object WebSocket upgrade failed', response.status); return response;
    }
    return json({ message: '경로를 찾지 못했습니다.' }, 404, origin);
  },
} satisfies ExportedHandler<Env>;

export class CollaborationRoom implements DurableObject {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request) {
    const pair = new WebSocketPair(); const client = pair[0]; const server = pair[1];
    const session: Session = { clientId: request.headers.get('x-client-id') || crypto.randomUUID(), name: decodeURIComponent(request.headers.get('x-client-name') || '공동 편집자') };
    this.state.acceptWebSocket(server); server.serializeAttachment(session);
    server.send(JSON.stringify({ type: 'ready', clientId: session.clientId, participants: this.participants(), locks: this.locks() }));
    this.broadcast({ type: 'presence', participants: this.participants(), locks: this.locks() });
    return new Response(null, { status: 101, webSocket: client });
  }

  private sockets() { return this.state.getWebSockets(); }
  private sessions() { return this.sockets().map((socket) => ({ socket, session: socket.deserializeAttachment() as Session })); }
  private participants() { return this.sessions().map(({ session }) => session); }
  private locks() { return this.sessions().filter(({ session }) => session.pageId).map(({ session }) => ({ pageId: session.pageId!, clientId: session.clientId, name: session.name })); }
  private broadcast(message: unknown, except?: WebSocket) { const value = JSON.stringify(message); for (const socket of this.sockets()) if (socket !== except) try { socket.send(value); } catch { /* disconnected */ } }
  private validPageId(value: string) { return /^[A-Za-z0-9_-]{8,128}$/.test(value); }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || raw.length > 950_000) return;
    let message: Incoming; try { message = JSON.parse(raw) as Incoming; } catch { return; }
    const session = socket.deserializeAttachment() as Session;
    if (!message || !('pageId' in message) || !this.validPageId(message.pageId)) return;
    const holder = this.sessions().find(({ socket: other, session: value }) => other !== socket && value.pageId === message.pageId);
    if (message.type === 'claim') {
      if (holder) { socket.send(JSON.stringify({ type: 'lock_denied', pageId: message.pageId, holder: holder.session })); return; }
      session.pageId = message.pageId; socket.serializeAttachment(session);
      const saved = await this.state.storage.get<{ content: unknown; sequence: number }>(`page:${message.pageId}`);
      socket.send(JSON.stringify({ type: 'lock_granted', pageId: message.pageId, saved })); this.broadcast({ type: 'presence', participants: this.participants(), locks: this.locks() }); return;
    }
    if (message.type === 'release') { if (session.pageId === message.pageId) { delete session.pageId; socket.serializeAttachment(session); this.broadcast({ type: 'presence', participants: this.participants(), locks: this.locks() }); } return; }
    if (message.type === 'selection') {
      const from = Math.max(0, Math.min(1_000_000, Math.trunc(message.from))); const to = Math.max(from, Math.min(1_000_000, Math.trunc(message.to)));
      this.broadcast({ type: 'selection', pageId: message.pageId, from, to, clientId: session.clientId, name: session.name }, socket); return;
    }
    if (message.type === 'page_snapshot') {
      if (session.pageId !== message.pageId || holder) { socket.send(JSON.stringify({ type: 'write_denied', pageId: message.pageId })); return; }
      const current = await this.state.storage.get<{ sequence: number }>(`page:${message.pageId}`); const sequence = (current?.sequence ?? 0) + 1;
      const serialized = JSON.stringify(message.content); if (encoder.encode(serialized).byteLength > 900_000) return;
      await this.state.storage.put(`page:${message.pageId}`, { content: message.content, sequence });
      this.broadcast({ type: 'page_snapshot', pageId: message.pageId, content: message.content, sequence, clientId: session.clientId }, socket);
    }
  }

  webSocketClose(socket: WebSocket) { try { socket.close(1000, 'closed'); } catch { /* already closed */ } this.broadcast({ type: 'presence', participants: this.participants(), locks: this.locks() }); }
  webSocketError(socket: WebSocket) { try { socket.close(1011, 'error'); } catch { /* already closed */ } }
}
