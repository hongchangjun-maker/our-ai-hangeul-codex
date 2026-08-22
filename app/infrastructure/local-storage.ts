import { openDB, type DBSchema } from 'idb';
import type { EditorDocument } from '../domain/document';

interface AssetRecord {
  id: string;
  blob: Blob;
  name: string;
  mediaType: string;
  size: number;
  createdAt: string;
}

interface OurHangeulDatabase extends DBSchema {
  documents: {
    key: string;
    value: EditorDocument;
    indexes: { 'by-updated': string };
  };
  assets: {
    key: string;
    value: AssetRecord;
  };
  metadata: {
    key: string;
    value: { key: string; value: string };
  };
}

const DB_NAME = 'our-ai-hangeul';
const DB_VERSION = 1;

async function database() {
  return openDB<OurHangeulDatabase>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const documents = db.createObjectStore('documents', { keyPath: 'id' });
      documents.createIndex('by-updated', 'updatedAt');
      db.createObjectStore('assets', { keyPath: 'id' });
      db.createObjectStore('metadata', { keyPath: 'key' });
    },
  });
}

export async function saveDocument(document: EditorDocument) {
  const db = await database();
  await db.put('documents', structuredClone(document));
  await db.put('metadata', { key: 'lastDocumentId', value: document.id });
}

export async function loadDocument(id: string) {
  return (await database()).get('documents', id);
}

export async function loadLastDocument() {
  const db = await database();
  const metadata = await db.get('metadata', 'lastDocumentId');
  return metadata ? db.get('documents', metadata.value) : undefined;
}

export async function listRecentDocuments(limit = 6) {
  const values = await (await database()).getAllFromIndex('documents', 'by-updated');
  return values.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
}

export async function deleteDocument(id: string) {
  await (await database()).delete('documents', id);
}

export async function storeAsset(file: Blob, name: string, mediaType = file.type || 'application/octet-stream') {
  const id = crypto.randomUUID();
  const record: AssetRecord = { id, blob: file, name, mediaType, size: file.size, createdAt: new Date().toISOString() };
  await (await database()).put('assets', record);
  return record;
}

export async function getAsset(id: string) {
  return (await database()).get('assets', id);
}

export async function deleteAsset(id: string) {
  await (await database()).delete('assets', id);
}

export const recoveryState = {
  markDirty() {
    try { localStorage.setItem('our-ai-hangeul:dirty', 'true'); } catch { /* storage may be unavailable */ }
  },
  markSaved() {
    try { localStorage.setItem('our-ai-hangeul:dirty', 'false'); } catch { /* storage may be unavailable */ }
  },
  wasInterrupted() {
    try { return localStorage.getItem('our-ai-hangeul:dirty') === 'true'; } catch { return false; }
  },
};
