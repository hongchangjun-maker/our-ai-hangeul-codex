import { IMAGE_VARIANT_MAX_EDGE, type ImageVariant } from '../domain/image-quality';
import { putAssetVariant } from './local-storage';

export const IMAGE_VARIANT_EVENT = 'our-ai-hangeul:image-variant-ready';
export type ImageProcessingStatus = 'queued' | 'processing' | 'ready' | 'error';

function announce(assetId: string, status: ImageProcessingStatus, variant?: ImageVariant, message?: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(IMAGE_VARIANT_EVENT, { detail: { assetId, status, variant, message } }));
}

async function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

async function createVariant(source: Blob, sourceSize: { width: number; height: number }, maxEdge: number, quality: number) {
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return null;
  const ratio = Math.min(1, maxEdge / Math.max(sourceSize.width, sourceSize.height));
  const width = Math.max(1, Math.round(sourceSize.width * ratio));
  const height = Math.max(1, Math.round(sourceSize.height * ratio));
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image', resizeWidth: width, resizeHeight: height, resizeQuality: 'high' });
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return null;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvasBlob(canvas, 'image/webp', quality) ?? await canvasBlob(canvas, 'image/png', 1);
    return blob ? { blob, width, height } : null;
  } finally { bitmap.close(); }
}

let queue = Promise.resolve();

/** Serial processing prevents several large source decodes from peaking at once. */
export function queueImageVariants(assetId: string, source: Blob, size: { width: number; height: number }) {
  announce(assetId, 'queued');
  queue = queue.then(async () => {
    if (!/^image\/(?:jpeg|png|webp)$/i.test(source.type)) { announce(assetId, 'ready', 'original'); return; }
    announce(assetId, 'processing');
    const variants: Array<[Exclude<ImageVariant, 'original'>, number]> = [['thumbnail', 0.82], ['preview', 0.88], ['high', 0.94]];
    for (const [variant, quality] of variants) {
      const result = await createVariant(source, size, IMAGE_VARIANT_MAX_EDGE[variant], quality);
      if (result) {
        await putAssetVariant(assetId, variant, result.blob, result.width, result.height);
        announce(assetId, 'processing', variant);
      }
    }
    announce(assetId, 'ready');
  }).catch((reason) => announce(assetId, 'error', undefined, reason instanceof Error ? reason.message : '미리보기 생성 실패'));
  return queue;
}
