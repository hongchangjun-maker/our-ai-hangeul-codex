import type { EditorDocument } from '../domain/document';
import { getAsset, listAssetVariants, putAssetVariant, storeAssetWithId } from './local-storage';

export const CLOUD_CODE_STORAGE_KEY = 'our-ai-hangeul:cloud-code';
export const cloudDocumentCodeKey = (documentId: string) => `${CLOUD_CODE_STORAGE_KEY}:${documentId}`;
export const CLOUD_CONNECTED_EVENT = 'our-ai-hangeul:cloud-connected';
export const CLOUD_ASSET_PROGRESS_EVENT = 'our-ai-hangeul:cloud-asset-progress';

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

function progress(assetId: string, name: string, loaded: number, total: number, status: 'uploading' | 'retrying' | 'ready' | 'error') {
  window.dispatchEvent(new CustomEvent(CLOUD_ASSET_PROGRESS_EVENT, { detail: { assetId, name, loaded, total, status } }));
}

async function uploadBlob(url: string, asset: { id: string; name: string; mediaType: string; size: number; blob: Blob; sha256?: string; width?: number; height?: number }, attempt = 0): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('PUT', url);
      request.setRequestHeader('content-type', asset.mediaType);
      request.setRequestHeader('x-file-name', encodeURIComponent(asset.name));
      if (asset.sha256) request.setRequestHeader('x-content-sha256', asset.sha256);
      if (asset.width) request.setRequestHeader('x-image-width', String(asset.width));
      if (asset.height) request.setRequestHeader('x-image-height', String(asset.height));
      request.upload.onprogress = (event) => progress(asset.id, asset.name, event.loaded, event.lengthComputable ? event.total : asset.size, 'uploading');
      request.onerror = () => reject(new Error('네트워크 연결이 끊겼습니다.'));
      request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error(`R2 업로드 실패 (${request.status})`));
      request.send(asset.blob);
    });
    progress(asset.id, asset.name, asset.size, asset.size, 'ready');
  } catch (reason) {
    if (attempt < 2 && navigator.onLine) {
      progress(asset.id, asset.name, 0, asset.size, 'retrying');
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      return uploadBlob(url, asset, attempt + 1);
    }
    progress(asset.id, asset.name, 0, asset.size, 'error');
    throw reason;
  }
}

export async function uploadDocumentAssets(code: string, document: EditorDocument) {
  if (!navigator.onLine) throw new Error('오프라인입니다. 원본은 이 기기에 안전하게 보관되며 연결 복구 후 다시 동기화할 수 있습니다.');
  const objects = assetObjects(document); let uploaded = 0; let skipped = 0;
  for (const object of objects) {
    const asset = await getAsset(object.assetId!); if (!asset) { skipped += 1; continue; }
    const isImage = object.type === 'image';
    const url = await endpoint(isImage ? `/image-assets/${encodeURIComponent(asset.id)}/original` : `/assets/${encodeURIComponent(asset.id)}`, code);
    const exists = await fetch(url, { method: 'HEAD' });
    if (!exists.ok) { await uploadBlob(url, asset); uploaded += 1; }
    if (isImage) for (const variant of await listAssetVariants(asset.id)) {
      const variantUrl = await endpoint(`/image-assets/${encodeURIComponent(asset.id)}/${variant.variant}`, code);
      if ((await fetch(variantUrl, { method: 'HEAD' })).ok) continue;
      await uploadBlob(variantUrl, { id: asset.id, name: `${asset.name} ${variant.variant}`, mediaType: variant.mediaType, size: variant.size, blob: new Blob([variant.data], { type: variant.mediaType }), width: variant.width, height: variant.height });
    }
  }
  return { uploaded, skipped };
}

export async function hydrateDocumentAssets(code: string, document: EditorDocument) {
  let downloaded = 0; let missing = 0;
  for (const object of assetObjects(document)) {
    if (await getAsset(object.assetId!)) continue;
    const isImage = object.type === 'image';
    const response = await fetch(await endpoint(isImage ? `/image-assets/${encodeURIComponent(object.assetId!)}/original` : `/assets/${encodeURIComponent(object.assetId!)}`, code));
    if (response.status === 404) { missing += 1; continue; }
    if (!response.ok) throw new Error((await response.json() as { message?: string }).message || '첨부 파일을 내려받지 못했습니다.');
    const blob = await response.blob(); const headerName = response.headers.get('x-file-name');
    await storeAssetWithId(object.assetId!, blob, headerName ? decodeURIComponent(headerName) : object.name || '첨부 파일', response.headers.get('content-type') || object.mediaType || blob.type, object.sourceWidthPx && object.sourceHeightPx ? { width: object.sourceWidthPx, height: object.sourceHeightPx } : undefined);
    if (isImage) for (const variant of ['thumbnail', 'preview', 'high'] as const) {
      const variantResponse = await fetch(await endpoint(`/image-assets/${encodeURIComponent(object.assetId!)}/${variant}`, code));
      if (!variantResponse.ok) continue;
      const width = Number(variantResponse.headers.get('x-image-width')) || object.sourceWidthPx || 1;
      const height = Number(variantResponse.headers.get('x-image-height')) || object.sourceHeightPx || 1;
      await putAssetVariant(object.assetId!, variant, await variantResponse.blob(), width, height);
    }
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
