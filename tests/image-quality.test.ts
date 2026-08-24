import { describe, expect, it } from 'vitest';
import { createPage, type DocumentObject } from '../app/domain/document';
import { imagePrintMetrics, imageRenderStyle, selectImageVariant } from '../app/domain/image-quality';
import { mmToPx } from '../app/domain/geometry';
import { getAssetVariant, putAssetVariant, storeAsset } from '../app/infrastructure/local-storage';

const imageObject = (patch: Partial<DocumentObject> = {}): DocumentObject => ({ id: 'image-12345678', type: 'image', x: 0, y: 0, width: mmToPx(100), height: mmToPx(50), rotation: 0, zIndex: 1, locked: false, opacity: 1, sourceWidthPx: 1200, sourceHeightPx: 600, ...patch });

describe('non-destructive image pipeline', () => {
  it('selects a proxy level from rendered pixels and device density', () => {
    expect(selectImageVariant(120, 80, 2)).toBe('thumbnail');
    expect(selectImageVariant(600, 400, 2)).toBe('preview');
    expect(selectImageVariant(1200, 800, 2)).toBe('high');
    expect(selectImageVariant(2000, 1200, 2)).toBe('original');
  });

  it('keeps crop as normalized metadata and calculates print DPI', () => {
    const object = imageObject({ crop: { x: 0.1, y: 0.2, width: 0.8, height: 0.7 }, flipX: true });
    expect(imageRenderStyle(object)).toMatchObject({ width: '125%', left: '-12.5%', transform: 'scale(-1, 1)' });
    const metrics = imagePrintMetrics(imageObject(), createPage());
    expect(metrics.dpi).toBeGreaterThanOrEqual(304);
    expect(metrics.quality).toBe('excellent');
  });

  it('deduplicates originals by SHA-256 while variants remain separate', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const first = await storeAsset(new Blob([bytes], { type: 'image/png' }), 'first.png', 'image/png');
    const second = await storeAsset(new Blob([bytes], { type: 'image/png' }), 'second.png', 'image/png');
    expect(second.id).toBe(first.id);
    await putAssetVariant(first.id, 'thumbnail', new Blob([new Uint8Array([9])], { type: 'image/webp' }), 100, 80);
    const variant = await getAssetVariant(first.id, 'thumbnail');
    expect(variant?.mediaType).toBe('image/webp');
    expect(new Uint8Array(await variant!.blob.arrayBuffer())).toEqual(new Uint8Array([9]));
  });
});
