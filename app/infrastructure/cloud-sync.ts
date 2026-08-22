import type { EditorDocument } from '../domain/document';

export interface CloudSnapshot { document: EditorDocument; revision: number; updatedAt: string; history: Array<{ revision: number; createdAt: string }> }

async function response<T>(request: Promise<Response>) {
  const result = await request; const body = await result.json() as T & { message?: string; latest?: CloudSnapshot };
  if (!result.ok) { const error = new Error(body.message || '클라우드 요청이 실패했습니다.') as Error & { status?: number; latest?: CloudSnapshot }; error.status = result.status; error.latest = body.latest; throw error; }
  return body;
}

export function createCloudRoom(document: EditorDocument) {
  return response<{ token: string; revision: number; updatedAt: string }>(fetch('/api/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ document }) }));
}

export function loadCloudRoom(code: string) {
  return response<CloudSnapshot>(fetch(`/api/sync?code=${encodeURIComponent(code)}`, { cache: 'no-store' }));
}

export function pushCloudRoom(code: string, baseRevision: number, document: EditorDocument) {
  return response<{ revision: number; updatedAt: string }>(fetch('/api/sync', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, baseRevision, document }) }));
}

export function loadCloudVersion(code: string, revision: number) {
  return response<{ document: EditorDocument; revision: number }>(fetch(`/api/sync?code=${encodeURIComponent(code)}&revision=${revision}`, { cache: 'no-store' }));
}
