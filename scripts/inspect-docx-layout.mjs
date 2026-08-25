import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Window } from 'happy-dom';
import 'fake-indexeddb/auto';
import { createServer } from 'vite';

const source = path.resolve(process.argv[2] || '');
const startPage = Math.max(1, Number(process.argv[3] || 1));
const endPage = Math.max(startPage, Number(process.argv[4] || startPage));
if (!source) throw new Error('Usage: node inspect-docx-layout.mjs <docx> [start-page] [end-page]');

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
if (!globalThis.URL.createObjectURL) globalThis.URL.createObjectURL = () => 'blob:layout-inspection';
if (!globalThis.URL.revokeObjectURL) globalThis.URL.revokeObjectURL = () => undefined;

const server = await createServer({ configFile: false, root: process.cwd(), appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' });
try {
  const { importFile } = await server.ssrLoadModule('/app/infrastructure/file-import.ts');
  const bytes = await readFile(source);
  const result = await importFile(new browserWindow.File([bytes], path.basename(source), { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
  if (result.kind !== 'document') throw new Error('The DOCX did not produce an editor document.');
  const pages = result.document.pages.slice(startPage - 1, endPage).map((page, offset) => ({
    page: startPage + offset,
    objects: page.objects.map((object) => ({ type: object.type, name: object.name, x: object.x, y: object.y, width: object.width, height: object.height, mediaType: object.mediaType })),
  }));
  process.stdout.write(`${JSON.stringify({ pageCount: result.document.pages.length, pages }, null, 2)}\n`);
} finally {
  await server.close();
  await browserWindow.close();
}
