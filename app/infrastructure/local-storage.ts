import { openDB, type DBSchema } from 'idb';
import type { EditorDocument } from '../domain/document';
import type { ImageVariant } from '../domain/image-quality';

export interface AssetRecord {
  id: string;
  blob: Blob;
  name: string;
  mediaType: string;
  size: number;
  createdAt: string;
  sha256?: string;
  width?: number;
  height?: number;
}

type StoredAssetRecord = Omit<AssetRecord, 'blob'> & { data?: ArrayBuffer; blob?: Blob };
type StoredVariantRecord = { key: string; assetId: string; variant: Exclude<ImageVariant, 'original'>; mediaType: string; size: number; width: number; height: number; data: ArrayBuffer; createdAt: string };

interface OurHangeulDatabase extends DBSchema {
  documents: {
    key: string;
    value: EditorDocument;
    indexes: { 'by-updated': string };
  };
  assets: {
    key: string;
    value: StoredAssetRecord;
    indexes: { 'by-sha256': string };
  };
  assetVariants: {
    key: string;
    value: StoredVariantRecord;
    indexes: { 'by-asset': string };
  };
  metadata: {
    key: string;
    value: { key: string; value: string };
  };
}

const DB_NAME = 'our-ai-hangeul';
const DB_VERSION = 3;

async function database() {
  return openDB<OurHangeulDatabase>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        const documents = db.createObjectStore('documents', { keyPath: 'id' });
        documents.createIndex('by-updated', 'updatedAt');
        const assets = db.createObjectStore('assets', { keyPath: 'id' });
        assets.createIndex('by-sha256', 'sha256');
        db.createObjectStore('metadata', { keyPath: 'key' });
      }
      if (oldVersion < 3) {
        const assets = transaction.objectStore('assets');
        if (!assets.indexNames.contains('by-sha256')) assets.createIndex('by-sha256', 'sha256');
        const variants = db.createObjectStore('assetVariants', { keyPath: 'key' });
        variants.createIndex('by-asset', 'assetId');
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

async function digest(data: ArrayBuffer) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function storeAsset(file: Blob, name: string, mediaType = file.type || 'application/octet-stream', dimensions?: { width: number; height: number }) {
  const data = await file.arrayBuffer();
  const sha256 = await digest(data);
  const db = await database();
  const existing = await db.getFromIndex('assets', 'by-sha256', sha256);
  if (existing) return { ...existing, blob: new Blob([existing.data ?? existing.blob!], { type: existing.mediaType }) } satisfies AssetRecord;
  return storeAssetBuffer(db, crypto.randomUUID(), data, name, mediaType, sha256, dimensions);
}

async function storeAssetBuffer(db: Awaited<ReturnType<typeof database>>, id: string, data: ArrayBuffer, name: string, mediaType: string, sha256: string, dimensions?: { width: number; height: number }) {
  const common = { id, name, mediaType, size: data.byteLength, createdAt: new Date().toISOString(), sha256, width: dimensions?.width, height: dimensions?.height };
  await db.put('assets', { ...common, data });
  return { ...common, blob: new Blob([data], { type: mediaType }) } satisfies AssetRecord;
}

export async function storeAssetWithId(id: string, file: Blob, name: string, mediaType = file.type || 'application/octet-stream', dimensions?: { width: number; height: number }) {
  const data = await file.arrayBuffer();
  return storeAssetBuffer(await database(), id, data, name, mediaType, await digest(data), dimensions);
}

export async function getAsset(id: string) {
  const record = await (await database()).get('assets', id);
  if (!record) return undefined;
  if (record.data) return { ...record, blob: new Blob([record.data], { type: record.mediaType }) } satisfies AssetRecord;
  if (record.blob) return { ...record, blob: record.blob } satisfies AssetRecord;
  return undefined;
}

export async function deleteAsset(id: string) {
  const db = await database();
  const transaction = db.transaction(['assets', 'assetVariants'], 'readwrite');
  await transaction.objectStore('assets').delete(id);
  const keys = await transaction.objectStore('assetVariants').index('by-asset').getAllKeys(id);
  await Promise.all(keys.map((key) => transaction.objectStore('assetVariants').delete(key)));
  await transaction.done;
}

export async function putAssetVariant(assetId: string, variant: Exclude<ImageVariant, 'original'>, blob: Blob, width: number, height: number) {
  const data = await blob.arrayBuffer();
  const value: StoredVariantRecord = { key: `${assetId}:${variant}`, assetId, variant, mediaType: blob.type || 'image/webp', size: data.byteLength, width, height, data, createdAt: new Date().toISOString() };
  await (await database()).put('assetVariants', value);
  return value;
}

export async function getAssetVariant(assetId: string, preferred: ImageVariant) {
  if (preferred === 'original') return getAsset(assetId);
  const order: ImageVariant[] = preferred === 'high' ? ['high', 'preview', 'thumbnail', 'original'] : preferred === 'preview' ? ['preview', 'thumbnail', 'high', 'original'] : ['thumbnail', 'preview', 'high', 'original'];
  const db = await database();
  for (const variant of order) {
    if (variant === 'original') return getAsset(assetId);
    const value = await db.get('assetVariants', `${assetId}:${variant}`);
    if (value) return { id: assetId, blob: new Blob([value.data], { type: value.mediaType }), name: variant, mediaType: value.mediaType, size: value.size, createdAt: value.createdAt, width: value.width, height: value.height } satisfies AssetRecord;
  }
  return undefined;
}

export async function listAssetVariants(assetId: string) {
  return (await database()).getAllFromIndex('assetVariants', 'by-asset', assetId);
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
