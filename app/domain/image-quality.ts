import type { DocumentObject, DocumentPage } from './document';
import { pageGeometry } from './geometry';

export type ImageVariant = 'thumbnail' | 'preview' | 'high' | 'original';

export const IMAGE_VARIANT_MAX_EDGE: Record<Exclude<ImageVariant, 'original'>, number> = {
  thumbnail: 360,
  preview: 1440,
  high: 2880,
};

export function selectImageVariant(renderedWidthPx: number, renderedHeightPx: number, devicePixelRatio = 1): ImageVariant {
  const requiredEdge = Math.max(renderedWidthPx, renderedHeightPx) * Math.max(1, devicePixelRatio);
  if (requiredEdge <= IMAGE_VARIANT_MAX_EDGE.thumbnail) return 'thumbnail';
  if (requiredEdge <= IMAGE_VARIANT_MAX_EDGE.preview) return 'preview';
  if (requiredEdge <= IMAGE_VARIANT_MAX_EDGE.high) return 'high';
  return 'original';
}

export function normalizedCrop(object: DocumentObject) {
  return object.crop ?? { x: 0, y: 0, width: 1, height: 1 };
}

export function imageRenderStyle(object: DocumentObject) {
  const crop = normalizedCrop(object);
  return {
    width: `${100 / crop.width}%`,
    height: `${100 / crop.height}%`,
    left: `${-crop.x / crop.width * 100}%`,
    top: `${-crop.y / crop.height * 100}%`,
    transform: `scale(${object.flipX ? -1 : 1}, ${object.flipY ? -1 : 1})`,
  };
}

export function imagePrintMetrics(object: DocumentObject, page: DocumentPage) {
  const geometry = pageGeometry(page);
  const crop = normalizedCrop(object);
  const widthMm = object.width / geometry.widthPx * geometry.widthMm;
  const heightMm = object.height / geometry.heightPx * geometry.heightMm;
  const horizontalPixels = (object.sourceWidthPx ?? 0) * crop.width;
  const verticalPixels = (object.sourceHeightPx ?? 0) * crop.height;
  const dpiX = widthMm > 0 ? horizontalPixels / (widthMm / 25.4) : 0;
  const dpiY = heightMm > 0 ? verticalPixels / (heightMm / 25.4) : 0;
  const dpi = Math.floor(Math.min(dpiX || dpiY, dpiY || dpiX));
  return {
    widthMm,
    heightMm,
    dpi,
    quality: dpi >= 300 ? 'excellent' as const : dpi >= 200 ? 'good' as const : dpi >= 150 ? 'caution' as const : 'low' as const,
  };
}
