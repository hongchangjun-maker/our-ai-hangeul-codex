import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Window } from 'happy-dom';
import 'fake-indexeddb/auto';
import { createServer } from 'vite';

const output = path.resolve(process.argv[2] || 'tmp/word-roundtrip/source.docx');
await mkdir(path.dirname(output), { recursive: true });
const browserWindow = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browserWindow,
  document: browserWindow.document,
  localStorage: browserWindow.localStorage,
  DOMParser: browserWindow.DOMParser,
  HTMLElement: browserWindow.HTMLElement,
  HTMLAnchorElement: browserWindow.HTMLAnchorElement,
  File: browserWindow.File,
});
if (!globalThis.URL.createObjectURL) globalThis.URL.createObjectURL = () => 'blob:roundtrip';
if (!globalThis.URL.revokeObjectURL) globalThis.URL.revokeObjectURL = () => undefined;

const server = await createServer({ configFile: false, root: process.cwd(), appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' });
try {
  const { createDocument } = await server.ssrLoadModule('/app/domain/document.ts');
  const { storeAsset } = await server.ssrLoadModule('/app/infrastructure/local-storage.ts');
  const { buildDocxBlob } = await server.ssrLoadModule('/app/infrastructure/export-service.ts');
  const documentModel = createDocument('blank');
  documentModel.name = 'Word 왕복 호환 검증';
  documentModel.pages[0].textFlow = { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'DOCX 네이티브 왕복 검증' }] },
    { type: 'table', content: [
      { type: 'tableRow', content: [{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: '항목' }] }] }, { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: '결과' }] }] }] },
      { type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '표' }] }] }, { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '유지' }] }] }] },
    ] },
  ] };
  const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l9sS8QAAAABJRU5ErkJggg==', 'base64'));
  const asset = await storeAsset(new Blob([png], { type: 'image/png' }), 'roundtrip.png', 'image/png', { width: 1, height: 1 });
  documentModel.pages[0].objects = [
    { id: crypto.randomUUID(), type: 'image', x: 80, y: 260, width: 150, height: 90, rotation: 0, zIndex: 4, locked: false, opacity: 1, assetId: asset.id, name: 'roundtrip.png', mediaType: 'image/png', sourceWidthPx: 1, sourceHeightPx: 1 },
    ...(process.env.QA_NO_TEXTBOX ? [] : [{ id: crypto.randomUUID(), type: 'text-box', x: 290, y: 260, width: 220, height: 90, rotation: 0, zIndex: 5, locked: false, opacity: 1, text: '편집 가능한 네이티브 글상자', name: '왕복 글상자', style: { background: '#FFF8DB', borderColor: '#8EB8AD', borderWidth: 1 } }]),
  ];
  const blob = await buildDocxBlob(documentModel);
  await writeFile(output, new Uint8Array(await blob.arrayBuffer()));
  process.stdout.write(`${JSON.stringify({ output, bytes: blob.size })}\n`);
} finally {
  await server.close();
  await browserWindow.close();
}
