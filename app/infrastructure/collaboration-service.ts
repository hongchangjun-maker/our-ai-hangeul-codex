import type { EditorDocument } from '../domain/document';
import { getAsset, storeAssetWithId } from './local-storage';

export const CLOUD_CODE_STORAGE_KEY = 'our-ai-hangeul:cloud-code';
export const cloudDocumentCodeKey = (documentId: string) => `${CLOUD_CODE_STORAGE_KEY}:${documentId}`;
export const CLOUD_CONNECTED_EVENT = 'our-ai-hangeul:cloud-connected';

interface CollaborationConfig { connected: boolean; url?: string; message?: string }

let configPromise: Promise<CollaborationConfig> | undefined;
export function collaborationConfig() {
  configPromise ??= fetch('/api/collaboration/config', { cache: 'no-store' }).then(async (response) => {
    const value = await response.json() as CollaborationConfig;
    if (!response.ok) throw new Error(value.message || '공동 편집 설정을 확인하지 못했습니다.');
    return value;
  });
  return configPromise;
}

function assetObjects(document: EditorDocument) {
  const values = document.pages.flatMap((page) => page.objects).filter((object) => object.assetId);
  return [...new Map(values.map((object) => [object.assetId!, object])).values()];
}

async function endpoint(path: string, code: string) {
  const config = await collaborationConfig();
  if (!config.connected || !config.url) throw new Error(config.message || 'R2 첨부 저장소가 연결되지 않았습니다.');
  return `${config.url}${path}?code=${encodeURIComponent(code)}`;
}

export async function uploadDocumentAssets(code: string, document: EditorDocument) {
  const objects = assetObjects(document); let uploaded = 0; let skipped = 0;
  for (const object of objects) {
    const asset = await getAsset(object.assetId!); if (!asset) { skipped += 1; continue; }
    const url = await endpoint(`/assets/${encodeURIComponent(asset.id)}`, code);
    const exists = await fetch(url, { method: 'HEAD' }); if (exists.ok) continue;
    const response = await fetch(url, { method: 'PUT', headers: { 'content-type': asset.mediaType, 'x-file-name': encodeURIComponent(asset.name) }, body: asset.blob });
    if (!response.ok) throw new Error((await response.json() as { message?: string }).message || `${asset.name} 업로드에 실패했습니다.`);
    uploaded += 1;
  }
  return { uploaded, skipped };
}

export async function hydrateDocumentAssets(code: string, document: EditorDocument) {
  let downloaded = 0; let missing = 0;
  for (const object of assetObjects(document)) {
    if (await getAsset(object.assetId!)) continue;
    const response = await fetch(await endpoint(`/assets/${encodeURIComponent(object.assetId!)}`, code));
    if (response.status === 404) { missing += 1; continue; }
    if (!response.ok) throw new Error((await response.json() as { message?: string }).message || '첨부 파일을 내려받지 못했습니다.');
    const blob = await response.blob(); const headerName = response.headers.get('x-file-name');
    await storeAssetWithId(object.assetId!, blob, headerName ? decodeURIComponent(headerName) : object.name || '첨부 파일', response.headers.get('content-type') || object.mediaType || blob.type);
    downloaded += 1;
  }
  return { downloaded, missing };
}

export function announceCloudCode(code: string, documentId?: string) {
  try { localStorage.setItem(CLOUD_CODE_STORAGE_KEY, code); if (documentId) localStorage.setItem(cloudDocumentCodeKey(documentId), code); } catch { /* storage unavailable */ }
  window.dispatchEvent(new CustomEvent(CLOUD_CONNECTED_EVENT, { detail: { code } }));
}

export async function collaborationWebSocketUrl(code: string, clientId: string, name: string) {
  const config = await collaborationConfig();
  if (!config.connected || !config.url) throw new Error(config.message || '실시간 공동 편집 서버가 연결되지 않았습니다.');
  const url = new URL('/ws', config.url); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('code', code); url.searchParams.set('clientId', clientId); url.searchParams.set('name', name); return url.toString();
}
