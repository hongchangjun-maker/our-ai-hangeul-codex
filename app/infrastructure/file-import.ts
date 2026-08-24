import { migrateDocument, type EditorDocument, type DocumentObject } from '../domain/document';
import { storeAsset, storeAssetWithId } from './local-storage';
import { WORD_IMPORT_EXTENSIONS, importWordDocument } from './word-formats';
import { assertImageSignature, fittedImageSize, imagePixelSize } from './image-metadata';
import { queueImageVariants } from './image-proxy';

export const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']);
export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

export type ImportResult =
  | { kind: 'image'; object: DocumentObject }
  | { kind: 'text'; text: string }
  | { kind: 'table'; rows: string[][] }
  | { kind: 'document'; document: EditorDocument; notice?: string }
  | { kind: 'attachment'; object: DocumentObject; notice?: string };

async function importSourceDocument(file: File) {
  const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (signature[0] !== 0x50 || signature[1] !== 0x4b) return migrateDocument(JSON.parse(await file.text()));
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const manifest = JSON.parse(await zip.file('manifest.json')?.async('text') ?? '{}') as { format?: string; document?: string; assets?: string[] };
  if (manifest.format !== 'our-ai-hangeul-source-v2') throw new Error('우리의 AI 한글 원본 패키지 형식이 올바르지 않습니다.');
  const documentText = await zip.file(manifest.document || 'document.json')?.async('text');
  if (!documentText) throw new Error('원본 패키지에서 문서 정보를 찾지 못했습니다.');
  const document = migrateDocument(JSON.parse(documentText));
  const assetIds = new Set(document.pages.flatMap((page) => page.objects.map((object) => object.assetId).filter((id): id is string => Boolean(id))));
  for (const id of assetIds) {
    const blob = await zip.file(`assets/${id}`)?.async('blob');
    if (!blob) throw new Error('원본 패키지의 이미지 또는 첨부 파일이 누락되었습니다.');
    const object = document.pages.flatMap((page) => page.objects).find((item) => item.assetId === id);
    await storeAssetWithId(id, blob, object?.name || '원본 자산', object?.mediaType || blob.type || 'application/octet-stream');
  }
  return document;
}

function extensionOf(name: string) {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

function imageMediaType(extension: string, supplied: string) {
  if (supplied.startsWith('image/')) return supplied;
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' } as Record<string, string>)[extension] || 'application/octet-stream';
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((item) => item.some((value) => value.trim()));
}

async function sanitizedSvg(file: File) {
  const text = await file.text();
  if (/<script\b|<foreignObject\b|\son\w+\s*=|(?:href|xlink:href)\s*=\s*["'](?:https?:|data:text\/html)/i.test(text)) {
    throw new Error('실행 가능한 코드가 포함된 SVG는 삽입할 수 없습니다.');
  }
  return new Blob([text], { type: 'image/svg+xml' });
}

export async function importFile(file: File, position = { x: 90, y: 120 }): Promise<ImportResult> {
  if (file.size <= 0) throw new Error('빈 파일은 가져올 수 없습니다.');
  const extension = extensionOf(file.name);

  if (IMAGE_TYPES.has(file.type) || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(extension)) {
    if (file.size > MAX_IMAGE_BYTES) throw new Error('이미지는 30MB 이하만 삽입할 수 있습니다.');
    const blob = extension === 'svg' || file.type === 'image/svg+xml' ? await sanitizedSvg(file) : file;
    const mediaType = imageMediaType(extension, blob.type);
    await assertImageSignature(blob, mediaType);
    const source = await imagePixelSize(blob);
    const display = fittedImageSize(source);
    const asset = await storeAsset(blob, file.name, mediaType, source);
    void queueImageVariants(asset.id, asset.blob, source);
    return {
      kind: 'image',
      object: { id: crypto.randomUUID(), type: 'image', x: position.x, y: position.y, width: display.width, height: display.height, rotation: 0, zIndex: 10, locked: false, opacity: 1, assetId: asset.id, name: file.name, mediaType: asset.mediaType, size: asset.size, sourceWidthPx: source.width, sourceHeightPx: source.height, style: { borderRadius: 4, shadow: true } },
    };
  }

  if (file.type === 'text/plain' || extension === 'txt') return { kind: 'text', text: await file.text() };
  if (file.type === 'text/csv' || extension === 'csv') return { kind: 'table', rows: parseCsv(await file.text()) };
  if (extension === 'json' || extension === 'oah') {
    const parsed = extension === 'oah' ? await importSourceDocument(file) : migrateDocument(JSON.parse(await file.text()) as EditorDocument);
    if (parsed.formatVersion && Array.isArray(parsed.pages)) return { kind: 'document', document: parsed };
  }

  if ((WORD_IMPORT_EXTENSIONS as readonly string[]).includes(extension)) {
    const document = await importWordDocument(file, extension);
    const notice = extension === 'docx'
      ? `Word 저장 기준으로 ${document.pages.length}쪽을 복원했습니다. 특수 글꼴·도형 효과는 편집 가능한 기본 요소로 바뀔 수 있습니다.`
      : undefined;
    return { kind: 'document', document, notice };
  }

  if (['hwp', 'doc'].includes(extension)) {
    throw new Error(`.${extension.toUpperCase()} 구형 바이너리 문서는 브라우저에서 안전하게 변환할 수 없습니다. 한글 또는 Word에서 HWPX·DOCX로 저장한 뒤 가져오세요.`);
  }

  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error('첨부 파일은 50MB 이하만 보관할 수 있습니다.');
  const asset = await storeAsset(file, file.name, file.type || 'application/octet-stream');
  const compatibilityNotice = ['xlsx', 'pptx', 'pdf'].includes(extension)
    ? '이 파일은 워드프로세서 문서 변환 대상이 아니므로 원본 첨부로 보관했습니다.'
    : undefined;
  return {
    kind: 'attachment',
    notice: compatibilityNotice,
    object: { id: crypto.randomUUID(), type: 'attachment', x: position.x, y: position.y, width: 280, height: 76, rotation: 0, zIndex: 10, locked: false, opacity: 1, assetId: asset.id, name: file.name, mediaType: asset.mediaType, size: file.size },
  };
}
