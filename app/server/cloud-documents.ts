import { migrateDocument, type EditorDocument } from '../domain/document';
import { ensureDatabase, getD1 } from './settings';

const encoder = new TextEncoder();
export const MAX_CLOUD_DOCUMENT_BYTES = 900_000;

function base64Url(bytes: Uint8Array) {
  let value = ''; for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function tokenHash(token: string) {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) throw new Error('공유 코드가 올바르지 않습니다.');
  return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(token))));
}

function snapshot(document: unknown) {
  const valid = migrateDocument(document);
  const value = JSON.stringify(valid);
  if (encoder.encode(value).byteLength > MAX_CLOUD_DOCUMENT_BYTES) throw new Error('클라우드 문서는 900KB 이하만 동기화할 수 있습니다. 사진 원본은 현재 기기에 보관됩니다.');
  return { document: valid, value };
}

export async function createCloudDocument(documentValue: unknown, ownerHash: string) {
  await ensureDatabase();
  const { document, value } = snapshot(documentValue);
  const token = base64Url(crypto.getRandomValues(new Uint8Array(24)));
  const hash = await tokenHash(token); const now = new Date().toISOString(); const id = crypto.randomUUID();
  await getD1().batch([
    getD1().prepare('INSERT INTO cloud_documents (id, token_hash, name, snapshot, revision, created_at, updated_at, client_hash) VALUES (?, ?, ?, ?, 1, ?, ?, ?)').bind(id, hash, document.name, value, now, now, ownerHash),
    getD1().prepare('INSERT INTO cloud_versions (id, document_id, revision, snapshot, created_at, client_hash) VALUES (?, ?, 1, ?, ?, ?)').bind(crypto.randomUUID(), id, value, now, ownerHash),
  ]);
  return { token, revision: 1, updatedAt: now };
}

export async function readCloudDocument(token: string) {
  await ensureDatabase(); const hash = await tokenHash(token);
  const row = await getD1().prepare('SELECT id, snapshot, revision, updated_at AS updatedAt FROM cloud_documents WHERE token_hash = ?').bind(hash).first<{ id: string; snapshot: string; revision: number; updatedAt: string }>();
  if (!row) return null;
  const history = await getD1().prepare('SELECT revision, created_at AS createdAt FROM cloud_versions WHERE document_id = ? ORDER BY revision DESC LIMIT 30').bind(row.id).all<{ revision: number; createdAt: string }>();
  return { document: migrateDocument(JSON.parse(row.snapshot)), revision: row.revision, updatedAt: row.updatedAt, history: history.results };
}

export async function updateCloudDocument(token: string, baseRevision: number, documentValue: unknown, editorHash: string) {
  await ensureDatabase(); const hash = await tokenHash(token); const { document, value } = snapshot(documentValue); const now = new Date().toISOString();
  const row = await getD1().prepare('SELECT id, revision FROM cloud_documents WHERE token_hash = ?').bind(hash).first<{ id: string; revision: number }>();
  if (!row) return { kind: 'missing' as const };
  if (row.revision !== baseRevision) return { kind: 'conflict' as const, latest: await readCloudDocument(token) };
  const revision = row.revision + 1;
  const result = await getD1().prepare('UPDATE cloud_documents SET name = ?, snapshot = ?, revision = ?, updated_at = ?, client_hash = ? WHERE id = ? AND revision = ?').bind(document.name, value, revision, now, editorHash, row.id, baseRevision).run();
  if (!result.meta.changes) return { kind: 'conflict' as const, latest: await readCloudDocument(token) };
  await getD1().prepare('INSERT INTO cloud_versions (id, document_id, revision, snapshot, created_at, client_hash) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), row.id, revision, value, now, editorHash).run();
  return { kind: 'updated' as const, revision, updatedAt: now };
}

export async function readCloudVersion(token: string, revision: number): Promise<EditorDocument | null> {
  await ensureDatabase(); const hash = await tokenHash(token);
  const row = await getD1().prepare('SELECT v.snapshot FROM cloud_versions v JOIN cloud_documents d ON d.id = v.document_id WHERE d.token_hash = ? AND v.revision = ?').bind(hash, revision).first<{ snapshot: string }>();
  return row ? migrateDocument(JSON.parse(row.snapshot)) : null;
}
