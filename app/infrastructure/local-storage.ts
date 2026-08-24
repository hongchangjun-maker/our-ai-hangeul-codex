import { openDB, type DBSchema } from 'idb';
import type { EditorDocument } from '../domain/document';

export interface AssetRecord {
  id: string;
  blob: Blob;
  name: string;
  mediaType: string;
  size: number;
  createdAt: string;
}

type StoredAssetRecord = Omit<AssetRecord, 'blob'> & { data?: ArrayBuffer; blob?: Blob };

interface OurHangeulDatabase extends DBSchema {
  documents: {
    key: string;
    value: EditorDocument;
    indexes: { 'by-updated': string };
  };
  assets: {
    key: string;
    value: StoredAssetRecord;
  };
  metadata: {
    key: string;
    value: { key: string; value: string };
  };
}

const DB_NAME = 'our-ai-hangeul';
const DB_VERSION = 2;

async function database() {
  return openDB<OurHangeulDatabase>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const documents = db.createObjectStore('documents', { keyPath: 'id' });
        documents.createIndex('by-updated', 'updatedAt');
        db.createObjectStore('assets', { keyPath: 'id' });
        db.createObjectStore('metadata', { keyPath: 'key' });
      }
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
  return storeAssetWithId(id, file, name, mediaType);
}

export async function storeAssetWithId(id: string, file: Blob, name: string, mediaType = file.type || 'application/octet-stream') {
  const data = await file.arrayBuffer();
  const common = { id, name, mediaType, size: data.byteLength, createdAt: new Date().toISOString() };
  await (await database()).put('assets', { ...common, data });
  return { ...common, blob: new Blob([data], { type: mediaType }) } satisfies AssetRecord;
}

export async function getAsset(id: string) {
  const record = await (await database()).get('assets', id);
  if (!record) return undefined;
  if (record.data) return { ...record, blob: new Blob([record.data], { type: record.mediaType }) } satisfies AssetRecord;
  if (record.blob) return { ...record, blob: record.blob } satisfies AssetRecord;
  return undefined;
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
