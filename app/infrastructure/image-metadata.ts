export type ImagePixelSize = { width: number; height: number };

function validSize(width: number, height: number): ImagePixelSize | null {
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 && width <= 100_000 && height <= 100_000
    ? { width: Math.round(width), height: Math.round(height) }
    : null;
}

function rasterSize(bytes: Uint8Array): ImagePixelSize | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return validSize(view.getUint32(16), view.getUint32(20));
  }
  if (bytes.length >= 10 && String.fromCharCode(...bytes.slice(0, 3)) === 'GIF') {
    return validSize(view.getUint16(6, true), view.getUint16(8, true));
  }
  if (bytes.length >= 30 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP' && String.fromCharCode(...bytes.slice(12, 16)) === 'VP8X') {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    return validSize(width, height);
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
      const marker = bytes[offset++];
      if (marker === 0xd8 || marker === 0xd9) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (startOfFrame.has(marker) && length >= 7) return validSize(view.getUint16(offset + 3), view.getUint16(offset + 5));
      offset += length;
    }
  }
  return null;
}

function svgSize(text: string): ImagePixelSize | null {
  const root = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
  if (root.localName !== 'svg') return null;
  const number = (value: string | null) => Number(value?.match(/^\s*([0-9.]+)/)?.[1]);
  const width = number(root.getAttribute('width'));
  const height = number(root.getAttribute('height'));
  const direct = validSize(width, height);
  if (direct) return direct;
  const viewBox = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  return viewBox?.length === 4 ? validSize(viewBox[2], viewBox[3]) : null;
}

async function browserDecodedSize(blob: Blob): Promise<ImagePixelSize | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      const result = validSize(bitmap.width, bitmap.height);
      bitmap.close();
      if (result) return result;
    } catch { /* Header parsing remains the deterministic fallback. */ }
  }
  return null;
}

export async function imagePixelSize(blob: Blob): Promise<ImagePixelSize> {
  if (blob.type === 'image/svg+xml') {
    const parsed = svgSize(await blob.text());
    if (parsed) return parsed;
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return rasterSize(bytes) ?? await browserDecodedSize(blob) ?? { width: 260, height: 180 };
}

export function fittedImageSize(source: ImagePixelSize, maxWidth = 520, maxHeight = 700): ImagePixelSize {
  const scale = Math.min(1, maxWidth / source.width, maxHeight / source.height);
  return { width: Math.max(1, Math.round(source.width * scale)), height: Math.max(1, Math.round(source.height * scale)) };
}
